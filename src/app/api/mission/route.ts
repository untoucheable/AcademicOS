import { Mission, sortMission, sortMissionSchedule } from "@/lib/mission";
import {
  buildAssessmentSliceFramework,
  buildTrackedWorkSliceFramework,
  getRecommendedAssessmentStudyBlockMinutes,
  isAssessmentPrepType,
} from "@/lib/assignment";
import { CalendarEvent, CalendarEventType, normalizeCalendarEvents } from "@/lib/calendar";
import { calendarEventSignature } from "@/lib/calendar-signature";
import { buildAcademicIntelligenceSnapshot } from "@/lib/intelligence";
import { calculateGradeAverage } from "@/lib/academic-analytics";
import { buildDailyPlanEvents } from "@/lib/daily-plans";
import { StudentState } from "@/lib/student-state";

import { getState, updateState } from "@/lib/server-state";

import OpenAI from "openai";

type ExtractedCalendarEvent = {
  title: string;
  type: CalendarEventType;
  startTime: string;
  endTime: string;
};

type ExtractionResult = {
  calendarEvents?: ExtractedCalendarEvent[];
};

type DeletionResult = {
  removeEvents?: string[];
};

type MissionInputAssignment = {
  id: string;
  title: string;
  course: string;
  subject?: string;
  assessmentType?: "assignment" | "homework" | "test" | "quiz" | "project";
  dueDate: string;
  priority: string;
  estimatedMinutes?: number;
  progressPercent?: number;
  studyMinutesCompleted?: number;
  remainingMinutes?: number;
  daysUntilDue?: number;
  availableStudyDays?: number;
  availableWorkDays?: number;
  recommendedTodayMinutes?: number;
  suggestedStudyBlockMinutes?: number;
  preferredWorkBlockMinutes?: number;
  recommendedBlockCount?: number;
  minimumStudyBlockMinutes?: number;
  maximumStudyBlockMinutes?: number;
  shouldFinishToday?: boolean;
  planningPressureScore?: number;
  planningStyle?: "tracked-work" | "assessment-prep";
  notes?: string;
};

type MissionInputDocument = {
  title: string;
  type: string;
  subject: string;
  tags?: string[];
};

type EnergyMode = "recovery" | "normal" | "high-output";

type AiStage = "deletion" | "extraction" | "mission";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const PRIMARY_AI_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const FALLBACK_AI_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || "openrouter/free";

const AI_OUTPUT_TOKEN_LIMITS = {
  deletion: 1000,
  extraction: 1000,
  mission: 3000,
} as const;

function extractFirstCompleteJsonValue(value: string) {
  const firstObject = value.indexOf("{");
  const firstArray = value.indexOf("[");
  const starts = [firstObject, firstArray].filter((index) => index >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  if (start < 0) return null;

  const opening = value[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === opening) depth += 1;
    if (character === closing) depth -= 1;
    if (depth === 0) return value.slice(start, index + 1);
  }

  return null;
}

function parseAiJson<T>(content: string | null | undefined, fallback: T): T {
  if (!content?.trim()) return fallback;

  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const rawText = fencedMatch ? fencedMatch[1].trim() : trimmed;

  try {
    return JSON.parse(rawText) as T;
  } catch {
    try {
      const extracted = extractFirstCompleteJsonValue(rawText);
      return extracted ? JSON.parse(extracted) as T : fallback;
    } catch {
      return fallback;
    }
  }
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function clampScore(value: number, min = 1, max = 10) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function numericEnergyToLabel(value: number) {
  if (value <= 3) return "low";
  if (value >= 8) return "high";
  return "medium";
}

function labelToEnergyMode(value: "low" | "medium" | "high"): EnergyMode {
  if (value === "low") return "recovery";
  if (value === "high") return "high-output";
  return "normal";
}

function getAuthoritativeMentalState(state: StudentState, currentTime: string) {
  const currentDayKey = currentTime.slice(0, 10);
  const sameDayPlan = state.dailyMissionPlan?.date === currentDayKey ? state.dailyMissionPlan : null;
  const energyLevel = sameDayPlan?.energyLevel || numericEnergyToLabel(state.status.energyLevel || 5);
  const focusScore = clampScore(sameDayPlan?.focusScore ?? state.status.focusScore ?? 6);
  const stressLevel = clampScore(sameDayPlan?.stressLevel ?? state.status.stressLevel ?? 5);

  return {
    energyLevel,
    focusScore,
    stressLevel,
    energyMode: labelToEnergyMode(energyLevel),
  };
}

function getErrorStatus(err: unknown) {
  if (!err || typeof err !== "object") return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

function getErrorCode(err: unknown) {
  if (!err || typeof err !== "object") return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function getErrorType(err: unknown) {
  if (!err || typeof err !== "object") return undefined;
  const type = (err as { type?: unknown }).type;
  return typeof type === "string" ? type : undefined;
}

function getErrorRequestId(err: unknown) {
  if (!err || typeof err !== "object") return undefined;
  const requestID = (err as { requestID?: unknown }).requestID;
  return typeof requestID === "string" ? requestID : undefined;
}

function getErrorHeader(err: unknown, name: string) {
  if (!err || typeof err !== "object") return undefined;
  const headers = (err as { headers?: { get?: (key: string) => string | null } }).headers;
  if (!headers?.get) return undefined;
  const value = headers.get(name);
  return value ?? undefined;
}

function isAiConnectionError(err: unknown) {
  return getErrorMessage(err).toLowerCase().includes("connection error");
}

function isOpenRouterCreditError(err: unknown) {
  const message = getErrorMessage(err).toLowerCase();
  const status = getErrorStatus(err);
  return status === 402 || message.includes("more credits") || message.includes("insufficient") || message.includes("max_tokens");
}

function isRetryableAiProviderError(err: unknown) {
  const message = getErrorMessage(err).toLowerCase();
  const status = getErrorStatus(err);

  return (
    status === 402 ||
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes("provider") ||
    message.includes("temporar") ||
    message.includes("unavailable") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("max_tokens") ||
    message.includes("more credits") ||
    message.includes("insufficient")
  );
}

function buildAiFallbackSummary(err: unknown) {
  const status = getErrorStatus(err);
  const message = getErrorMessage(err).toLowerCase();

  if (status === 401 || status === 403) {
    return "AcademicOS is temporarily using a fallback mission because the AI provider rejected the current API access. Your confirmed calendar items and assignments are still available.";
  }

  if (status === 429) {
    return "AcademicOS is temporarily using a fallback mission because the AI provider rate-limited the planning request. Your confirmed calendar items and assignments are still available.";
  }

  if (status === 402 || message.includes("more credits") || message.includes("insufficient")) {
    return "AcademicOS is temporarily using a fallback mission because the AI provider rejected the planning request for billing or account-availability reasons. Your confirmed calendar items and assignments are still available.";
  }

  if (message.includes("max_tokens")) {
    return "AcademicOS is temporarily using a fallback mission because the AI provider rejected the planning request size. Your confirmed calendar items and assignments are still available.";
  }

  return "AcademicOS is temporarily using a fallback mission because the AI planning request was rejected by the provider. Your confirmed calendar items and assignments are still available.";
}

function logAiFailure(stage: AiStage, model: string, err: unknown) {
  console.error("AcademicOS AI request failed", {
    stage,
    model,
    status: getErrorStatus(err),
    code: getErrorCode(err),
    type: getErrorType(err),
    requestId: getErrorRequestId(err) || getErrorHeader(err, "x-request-id"),
    provider: getErrorHeader(err, "x-openrouter-provider"),
    message: getErrorMessage(err),
  });
}

async function createAiCompletion({
  stage,
  maxTokens,
  messages,
}: {
  stage: AiStage;
  maxTokens: number;
  messages: Parameters<typeof client.chat.completions.create>[0]["messages"];
}) {
  try {
    return await client.chat.completions.create({
      model: PRIMARY_AI_MODEL,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages,
    });
  } catch (primaryError) {
    logAiFailure(stage, PRIMARY_AI_MODEL, primaryError);

    const canRetryWithFreeFallback =
      FALLBACK_AI_MODEL &&
      FALLBACK_AI_MODEL !== PRIMARY_AI_MODEL &&
      isRetryableAiProviderError(primaryError);

    if (!canRetryWithFreeFallback) {
      throw primaryError;
    }

    try {
      return await client.chat.completions.create({
        model: FALLBACK_AI_MODEL,
        max_tokens: maxTokens,
        messages,
      });
    } catch (fallbackError) {
      logAiFailure(stage, FALLBACK_AI_MODEL, fallbackError);
      throw fallbackError;
    }
  }
}

function buildAiFallbackMission(currentTime: string, state: StudentState, summary: string): Mission {
  const mission = buildOfflineMission(currentTime, state);
  return {
    ...mission,
    // The deterministic planner is already specific to the student's real
    // workload. Do not replace it with an opaque provider-error message.
    reason: summary,
  };
}

function buildFixedMissionScheduleForDay(state: StudentState, currentTime: string) {
  const { planningDayKey, planningStart, planningEnd, planningOffsetMinutes } = getPlanningWindow(currentTime);
  const basePlanEvents = buildDailyPlanEvents(state.dailyMissionPlan, currentTime)
    .filter((event) => isOnPlanningDay(event.startTime, planningDayKey, planningOffsetMinutes));
  const fixedCalendarEvents = state.calendar
    .filter(isFixedCalendarEvent)
    .filter((event) => isOnPlanningDay(event.startTime, planningDayKey, planningOffsetMinutes))
    .filter((event) => new Date(event.endTime).getTime() >= planningStart.getTime());

  return {
    planningDayKey,
    planningStart,
    planningEnd,
    planningOffsetMinutes,
    fixedEvents: constrainScheduleToPlanningDay(
      normalizeCalendarEvents([...basePlanEvents, ...fixedCalendarEvents]),
      planningStart,
      planningEnd,
      planningDayKey,
      planningOffsetMinutes,
    ),
  };
}

function deriveBurnoutRiskFromState(
  state: StudentState,
  assignments: MissionInputAssignment[],
  currentTime: string,
  plannedSchedule: CalendarEvent[] = [],
) {
  const mentalState = getAuthoritativeMentalState(state, currentTime);
  const activeAssignments = assignments.filter((assignment) => assignment.remainingMinutes && assignment.remainingMinutes > 0);
  const dueSoonCount = activeAssignments.filter((assignment) => {
    const daysUntilDue = assignment.daysUntilDue ?? getAssignmentDaysUntilDue(assignment, currentTime);
    return daysUntilDue <= 2;
  }).length;
  const remainingWorkMinutes = activeAssignments.reduce(
    (total, assignment) => total + Math.max(0, assignment.recommendedTodayMinutes || assignment.remainingMinutes || 0),
    0,
  );
  const scheduledStudyMinutes = plannedSchedule.reduce((total, event) => {
    if (event.type !== "study") return total;
    return total + Math.max(0, Math.round((new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60000));
  }, 0);
  const workloadPressure = Math.min(3, Math.round(remainingWorkMinutes / 90));
  const dueSoonPressure = Math.min(2, dueSoonCount);
  const schedulePressure = Math.min(1, Math.round(scheduledStudyMinutes / 180));

  return clampScore(
    mentalState.stressLevel * 0.5 +
      (11 - (state.status.energyLevel || 5)) * 0.25 +
      (11 - mentalState.focusScore) * 0.15 +
      workloadPressure +
      dueSoonPressure +
      schedulePressure,
  );
}

function buildOfflineMission(currentTime: string, state: StudentState): Mission {
  const { planningStart, planningEnd, fixedEvents, planningDayKey, planningOffsetMinutes } = buildFixedMissionScheduleForDay(state, currentTime);
  const manualMentalState = getAuthoritativeMentalState(state, currentTime);
  const assignmentLimit = manualMentalState.energyLevel === "high" ? 5 : manualMentalState.energyLevel === "low" ? 1 : 3;
  const missionAssignments = state.assignments
    .filter((assignment) => !assignment.completed)
    .filter((assignment) => !isPlaceholderAssignment({
      title: assignment.title,
      course: assignment.course,
      subject: assignment.subject,
      notes: assignment.notes,
    }))
    .map((assignment) => formatMissionAssignment({
      id: assignment.id,
      title: assignment.title,
      course: assignment.course,
      subject: assignment.subject,
      assessmentType: assignment.assessmentType,
      dueDate: assignment.dueDate,
      priority: assignment.priority,
      estimatedMinutes: assignment.estimatedMinutes,
      progressPercent: assignment.progress?.percentComplete,
      studyMinutesCompleted: assignment.progress?.studyMinutesCompleted,
      notes: assignment.notes,
    }, currentTime, state))
    .sort((a, b) => scoreAssignmentForToday(b, currentTime) - scoreAssignmentForToday(a, currentTime))
    .slice(0, assignmentLimit);
  const seedEvents = missionAssignments.map((assignment) =>
    buildStudyEvent(
      assignment,
      planningStart,
      getMissionAssignmentTargetMinutes(assignment, currentTime),
      isAssessmentAssignment(assignment) ? "Prepare for" : "Work on",
      currentTime,
      Math.max(7, Math.min(10, Math.round(scoreAssignmentForToday(assignment, currentTime) / 20))),
    ),
  );
  const plannedStudyEvents = packMissionScheduleForDay(
    seedEvents,
    fixedEvents,
    planningStart,
    planningEnd,
    missionAssignments,
    [],
  );
  const draftMission: Mission = {
    id: crypto.randomUUID(),
    createdAt: currentTime,
    currentTime,
    energyLevel: manualMentalState.energyLevel,
    focusScore: manualMentalState.focusScore,
    burnoutRisk: 1,
    expectedFinishTime: currentTime,
    summary: "AcademicOS built today's priority schedule from your confirmed events and current assignments.",
    schedule: [...fixedEvents, ...plannedStudyEvents],
    reason: "Deterministic mission planner",
  };

  adaptMissionForEnergy(draftMission, fixedEvents, missionAssignments, manualMentalState.energyMode, manualMentalState);
  draftMission.schedule = enforceAssignmentTimeBudgets(draftMission.schedule, missionAssignments);
  draftMission.schedule = addWeakSubjectStudyBlocks(draftMission.schedule, missionAssignments, state, currentTime);
  draftMission.schedule = closeMissionScheduleGaps(
    constrainScheduleToPlanningDay(
      draftMission.schedule,
      planningStart,
      planningEnd,
      planningDayKey,
      planningOffsetMinutes,
    ),
    planningStart,
    planningEnd,
    currentTime,
  );
  applyAuthoritativeMentalState(draftMission, state, missionAssignments, currentTime);
  draftMission.expectedFinishTime = draftMission.schedule.at(-1)?.endTime || currentTime;

  return sortMission(draftMission);
}

function isSameFixedEvent(event: CalendarEvent, fixedEvent: CalendarEvent) {
  const eventTitle = event.title.trim().toLowerCase();
  const fixedTitle = fixedEvent.title.trim().toLowerCase();

  return (
    eventTitle === fixedTitle ||
    (
      event.startTime === fixedEvent.startTime &&
      event.endTime === fixedEvent.endTime
    )
  );
}

function isFixedCalendarEvent(event: CalendarEvent) {
  return event.source !== "ai";
}

function isSpecificStudyEvent(
  event: CalendarEvent,
  assignments: MissionInputAssignment[],
  documents: MissionInputDocument[]
) {
  if (event.type !== "study") return true;

  const title = event.title.trim().toLowerCase();
  if (!title || title === "study" || title === "study time" || title === "focus time") {
    return false;
  }

  return assignments.some((assignment) => {
    const fields = [
      assignment.title,
      assignment.course,
      assignment.subject || "",
    ].map((field) => field.trim().toLowerCase()).filter(Boolean);

    return fields.some((field) => title.includes(field));
  }) || documents.some((document) => {
    const fields = [
      document.title,
      document.subject,
      ...(document.tags || []),
    ].map((field) => field.trim().toLowerCase()).filter(Boolean);

    return fields.some((field) => title.includes(field));
  });
}

function isGenericMissionWorkTitle(title: string) {
  const normalized = title.trim().toLowerCase();
  return [
    "focused work",
    "focused study",
    "focus block",
    "study block",
    "study",
    "study time",
    "focus time",
    "study session",
    "assignment work",
    "homework",
    "school work",
    "productivity",
    "catch up",
  ].includes(normalized);
}

function isAssessmentAssignment(assignment: MissionInputAssignment) {
  return (
    isAssessmentPrepType(assignment.assessmentType) ||
    /\b(test|quiz|exam)\b/i.test(assignment.title)
  );
}

function stripAssessmentWords(title: string) {
  return title.replace(/\b(test|quiz|exam)\b/gi, "").replace(/\s+/g, " ").trim();
}

function buildPrepTitle(assignment: MissionInputAssignment) {
  const cleaned = stripAssessmentWords(assignment.title) || assignment.title;
  return `Prepare for ${cleaned}`;
}

function isPlaceholderAssignment(assignment: Pick<MissionInputAssignment, "title" | "course" | "subject" | "notes">) {
  const combined = [
    assignment.title,
    assignment.course,
    assignment.subject || "",
    assignment.notes || "",
  ].join(" ").toLowerCase();

  return /\b(fake|demo|sample|example|placeholder|dummy|mock)\b/.test(combined);
}

function buildMissionAssignmentTitle(assignment: MissionInputAssignment) {
  return isAssessmentAssignment(assignment)
    ? buildPrepTitle(assignment)
    : `Work on ${assignment.title}`;
}

function getMissionAssignmentTargetMinutes(
  assignment: MissionInputAssignment,
  currentTime: string,
) {
  if (assignment.planningStyle === "assessment-prep" || isAssessmentAssignment(assignment)) {
    return assignment.suggestedStudyBlockMinutes ||
      getRecommendedAssessmentStudyBlockMinutes({
        assessmentType: assignment.assessmentType,
        completed: false,
        dueDate: assignment.dueDate,
        estimatedMinutes: assignment.estimatedMinutes,
        priority: assignment.priority as "low" | "medium" | "high",
        progress: {
          percentComplete: assignment.progressPercent || 0,
          completedSteps: [],
          remainingSteps: [],
          studyMinutesCompleted: assignment.studyMinutesCompleted || 0,
          lastUpdatedAt: currentTime,
        },
      }, currentTime);
  }

  if (assignment.shouldFinishToday) {
    return Math.max(15, assignment.remainingMinutes || assignment.estimatedMinutes || 45);
  }

  return Math.max(
    25,
    assignment.preferredWorkBlockMinutes ||
      assignment.recommendedTodayMinutes ||
      Math.min(assignment.remainingMinutes || assignment.estimatedMinutes || 45, 45),
  );
}

function getEventDurationMinutes(event: CalendarEvent) {
  return Math.max(
    15,
    Math.round((new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60000) || 45,
  );
}

function roundToNearestFive(minutes: number) {
  return Math.max(0, Math.round(minutes / 5) * 5);
}

function resolveRelatedAssignmentForEvent(
  event: CalendarEvent,
  assignments: MissionInputAssignment[],
) {
  if (event.relatedAssignmentId) {
    const exact = assignments.find((assignment) => assignment.id === event.relatedAssignmentId);
    if (exact) return exact;
  }

  const normalizedTitle = normalizeText(event.title);

  return assignments.find((assignment) => {
    const assignmentTitle = normalizeText(assignment.title);
    const prepTitle = normalizeText(buildPrepTitle(assignment));
    return (
      normalizedTitle.includes(assignmentTitle) ||
      assignmentTitle.includes(normalizedTitle) ||
      normalizedTitle.includes(prepTitle) ||
      prepTitle.includes(normalizedTitle)
    );
  }) || null;
}

function getConstrainedAssessmentEventDuration(
  originalDurationMinutes: number,
  assignment: MissionInputAssignment,
  scheduledMinutesSoFar: number,
  scheduledBlocksSoFar: number,
) {
  const minimumBlockMinutes = Math.max(15, assignment.minimumStudyBlockMinutes || 20);
  const maximumBlockMinutes = Math.max(
    minimumBlockMinutes,
    assignment.maximumStudyBlockMinutes || assignment.suggestedStudyBlockMinutes || 45,
  );
  const recommendedTodayMinutes = Math.max(
    minimumBlockMinutes,
    assignment.recommendedTodayMinutes || assignment.suggestedStudyBlockMinutes || maximumBlockMinutes,
  );
  const recommendedBlockCount = Math.max(1, assignment.recommendedBlockCount || 1);

  if (scheduledBlocksSoFar >= recommendedBlockCount) {
    return null;
  }

  const remainingTodayMinutes = recommendedTodayMinutes - scheduledMinutesSoFar;
  if (remainingTodayMinutes < minimumBlockMinutes) {
    return null;
  }

  const remainingBlockSlots = Math.max(0, recommendedBlockCount - scheduledBlocksSoFar - 1);
  const reservedMinutesForLaterBlocks = remainingBlockSlots * minimumBlockMinutes;
  const maxAllowedNow = Math.min(
    maximumBlockMinutes,
    remainingTodayMinutes - reservedMinutesForLaterBlocks,
  );

  if (maxAllowedNow < minimumBlockMinutes) {
    return null;
  }

  return Math.max(
    minimumBlockMinutes,
    Math.min(
      roundToNearestFive(originalDurationMinutes),
      maxAllowedNow,
    ),
  );
}

function getConstrainedTrackedWorkEventDuration(
  originalDurationMinutes: number,
  assignment: MissionInputAssignment,
  scheduledMinutesSoFar: number,
  scheduledBlocksSoFar: number,
) {
  const minimumBlockMinutes = Math.max(20, assignment.minimumStudyBlockMinutes || 25);
  const maximumBlockMinutes = Math.max(
    minimumBlockMinutes,
    assignment.maximumStudyBlockMinutes || assignment.preferredWorkBlockMinutes || assignment.remainingMinutes || 45,
  );
  const recommendedTodayMinutes = Math.max(
    minimumBlockMinutes,
    assignment.recommendedTodayMinutes || assignment.remainingMinutes || assignment.preferredWorkBlockMinutes || 45,
  );
  const recommendedBlockCount = Math.max(1, assignment.recommendedBlockCount || 1);

  if (scheduledBlocksSoFar >= recommendedBlockCount) {
    return null;
  }

  const remainingTodayMinutes = recommendedTodayMinutes - scheduledMinutesSoFar;
  if (remainingTodayMinutes < minimumBlockMinutes) {
    return null;
  }

  const remainingBlockSlots = Math.max(0, recommendedBlockCount - scheduledBlocksSoFar - 1);
  const reservedMinutesForLaterBlocks = remainingBlockSlots * minimumBlockMinutes;
  const maxAllowedNow = Math.min(
    maximumBlockMinutes,
    remainingTodayMinutes - reservedMinutesForLaterBlocks,
  );

  if (maxAllowedNow < minimumBlockMinutes) {
    return null;
  }

  const preferredDuration = assignment.shouldFinishToday
    ? originalDurationMinutes
    : assignment.preferredWorkBlockMinutes || originalDurationMinutes;

  return Math.max(
    minimumBlockMinutes,
    Math.min(
      roundToNearestFive(preferredDuration),
      maxAllowedNow,
    ),
  );
}

function getUpcomingMissionAssignments(
  assignments: MissionInputAssignment[],
  currentTime: string,
  windowDays = 7,
  excludedAssignmentIds?: Set<string>,
) {
  const now = new Date(currentTime);
  const end = new Date(now);
  end.setDate(end.getDate() + windowDays);

  return assignments
    .filter((assignment) => !isPlaceholderAssignment(assignment))
    .filter((assignment) => !excludedAssignmentIds?.has(assignment.id))
    .filter((assignment) => {
      const due = new Date(assignment.dueDate);
      return due.getTime() <= end.getTime();
    })
    .sort((a, b) => scoreAssignmentForToday(b, currentTime) - scoreAssignmentForToday(a, currentTime));
}

function pickReplacementAssignment(
  assignments: MissionInputAssignment[],
  schedule: CalendarEvent[],
  currentTime: string,
  excludedAssignmentIds?: Set<string>,
) {
  const scheduledAssignmentIds = new Set(
    schedule.map((event) => event.relatedAssignmentId).filter(Boolean),
  );
  const scheduledTitles = schedule.map((event) => normalizeText(event.title));

  return getUpcomingMissionAssignments(assignments, currentTime, 7, excludedAssignmentIds).find((assignment) => {
    const due = new Date(assignment.dueDate);
    const daysUntilDue = Math.ceil((due.getTime() - new Date(currentTime).getTime()) / (24 * 60 * 60 * 1000));
    const score = scoreAssignmentForToday(assignment, currentTime);
    if (daysUntilDue > 3 && score < 80) return false;

    if (scheduledAssignmentIds.has(assignment.id)) return false;

    const assignmentTitle = normalizeText(assignment.title);
    const prepTitle = normalizeText(buildPrepTitle(assignment));
    return !scheduledTitles.some((title) => title.includes(assignmentTitle) || title.includes(prepTitle));
  }) || null;
}

function buildAssignmentReplacementEvent(
  assignment: MissionInputAssignment,
  removedEvent: CalendarEvent,
  currentTime: string,
): CalendarEvent {
  const start = new Date(removedEvent.startTime);
  const end = new Date(removedEvent.endTime);
  const slotMinutes = Math.max(20, Math.round((end.getTime() - start.getTime()) / 60000));
  const durationMinutes = Math.max(20, Math.min(slotMinutes, getMissionAssignmentTargetMinutes(assignment, currentTime)));
  const title = buildMissionAssignmentTitle(assignment);

  return {
    id: crypto.randomUUID(),
    title,
    type: "study",
    startTime: start.toISOString(),
    endTime: addMinutes(start, durationMinutes).toISOString(),
    relatedAssignmentId: assignment.id,
    priority: Math.max(6, Math.min(10, Math.round(scoreAssignmentForToday(assignment, currentTime) / 20))),
    createdAt: currentTime,
    source: "ai",
  };
}

function removeGenericAiPlaceholders(
  schedule: CalendarEvent[],
) {
  return schedule.filter((event) => !(event.source === "ai" && isGenericMissionWorkTitle(event.title)));
}

function getActiveMissionSuppressedAssignmentIds(state: StudentState, currentTime: string) {
  const currentMissionDayKey = state.currentMission?.currentTime?.slice(0, 10);
  const requestedDayKey = currentTime.slice(0, 10);

  if (!currentMissionDayKey || currentMissionDayKey !== requestedDayKey) {
    return new Set<string>();
  }

  return new Set(state.missionSuppressedAssignmentIds || []);
}

function parsePlanningOffsetMinutes(currentTime: string) {
  const match = currentTime.match(/([+-])(\d{2}):(\d{2})$/);
  if (!match) return -new Date(currentTime).getTimezoneOffset();

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return sign * (hours * 60 + minutes);
}

function toDateKeyAtOffset(value: string | Date, offsetMinutes: number) {
  const date = typeof value === "string" ? new Date(value) : value;
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toPlanningDateTime(dateKey: string, clock: string, offsetMinutes: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = clock.split(":").map(Number);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMinutes * 60 * 1000;
  return new Date(timestamp);
}

function addDaysToDateKey(dateKey: string, days: number, offsetMinutes: number) {
  return toDateKeyAtOffset(
    new Date(toPlanningDateTime(dateKey, "12:00", offsetMinutes).getTime() + days * 24 * 60 * 60 * 1000),
    offsetMinutes,
  );
}

function getAssignmentDaysUntilDue(assignment: Pick<MissionInputAssignment, "dueDate">, currentTime: string) {
  const currentDateKey = currentTime.slice(0, 10);
  const currentUtc = Date.UTC(...currentDateKey.split("-").map((part, index) => index === 1 ? Number(part) - 1 : Number(part)) as [number, number, number]);
  const dueUtc = Date.UTC(...assignment.dueDate.split("-").map((part, index) => index === 1 ? Number(part) - 1 : Number(part)) as [number, number, number]);
  return Math.round((dueUtc - currentUtc) / (24 * 60 * 60 * 1000));
}

function getSleepTargetClock(state?: StudentState) {
  return state?.dailyMissionPlan?.sleepTarget || "22:30";
}

function getDayPlanningCapacityRange(dateKey: string, offsetMinutes: number, state: StudentState) {
  const midday = toPlanningDateTime(dateKey, "12:00", offsetMinutes);
  const dayOfWeek = midday.getDay();
  const sleepTarget = getSleepTargetClock(state);

  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    const schoolSkipped = state.dailyMissionPlan?.date === dateKey && state.dailyMissionPlan.schoolMode === "skip";
    return {
      start: toPlanningDateTime(dateKey, schoolSkipped ? "05:30" : "15:30", offsetMinutes),
      end: toPlanningDateTime(dateKey, sleepTarget, offsetMinutes),
    };
  }

  if (dayOfWeek === 6) {
    return {
      start: toPlanningDateTime(dateKey, "10:30", offsetMinutes),
      end: toPlanningDateTime(dateKey, sleepTarget, offsetMinutes),
    };
  }

  return {
    start: toPlanningDateTime(dateKey, "08:00", offsetMinutes),
    end: toPlanningDateTime(dateKey, sleepTarget, offsetMinutes),
  };
}

function estimateAvailableMinutesForDate(state: StudentState, dateKey: string, offsetMinutes: number) {
  const range = getDayPlanningCapacityRange(dateKey, offsetMinutes, state);
  const totalMinutes = Math.max(0, Math.floor((range.end.getTime() - range.start.getTime()) / 60000));
  if (!totalMinutes) return 0;

  const occupiedMinutes = normalizeCalendarEvents(state.calendar)
    .filter((event) => event.source !== "ai")
    .filter((event) => isOnPlanningDay(event.startTime, dateKey, offsetMinutes) || isOnPlanningDay(event.endTime, dateKey, offsetMinutes))
    .reduce((total, event) => {
      const start = Math.max(new Date(event.startTime).getTime(), range.start.getTime());
      const end = Math.min(new Date(event.endTime).getTime(), range.end.getTime());
      if (end <= start) return total;
      return total + Math.floor((end - start) / 60000);
    }, 0);

  return Math.max(0, totalMinutes - occupiedMinutes);
}

function getLookaheadAdjustment(
  assignment: MissionInputAssignment,
  state: StudentState,
  currentTime: string,
) {
  const daysUntilDue = getAssignmentDaysUntilDue(assignment, currentTime);
  const remainingMinutes = Math.max(0, assignment.remainingMinutes || assignment.estimatedMinutes || 0);

  if (remainingMinutes <= 0 || daysUntilDue <= 0) {
    return {
      extraTodayMinutes: 0,
      forceFinishToday: daysUntilDue <= 0,
      planningPressureScore: daysUntilDue <= 0 ? 80 : 0,
    };
  }

  const offsetMinutes = parsePlanningOffsetMinutes(currentTime);
  const todayKey = currentTime.slice(0, 10);
  let futureAvailableMinutes = 0;

  for (let dayOffset = 1; dayOffset <= Math.min(daysUntilDue, 13); dayOffset += 1) {
    const dateKey = addDaysToDateKey(todayKey, dayOffset, offsetMinutes);
    futureAvailableMinutes += estimateAvailableMinutesForDate(state, dateKey, offsetMinutes);
  }

  const shortageMinutes = Math.max(0, remainingMinutes - futureAvailableMinutes);
  const forceFinishToday = daysUntilDue <= 2 && futureAvailableMinutes < Math.max(60, Math.round(remainingMinutes * 0.75));
  const extraTodayMinutes = forceFinishToday
    ? remainingMinutes
    : shortageMinutes > 0
      ? Math.min(remainingMinutes, Math.max(30, Math.ceil(shortageMinutes / Math.max(1, daysUntilDue + 1) / 5) * 5))
      : futureAvailableMinutes < remainingMinutes * 1.5
        ? Math.min(remainingMinutes, 20)
        : 0;

  return {
    extraTodayMinutes,
    forceFinishToday,
    planningPressureScore: forceFinishToday ? 90 : shortageMinutes > 0 ? 45 : futureAvailableMinutes < remainingMinutes * 1.5 ? 20 : 0,
  };
}

function getPlanningWindow(currentTime: string) {
  const current = new Date(currentTime);
  const planningOffsetMinutes = parsePlanningOffsetMinutes(currentTime);
  const planningDayKey = currentTime.slice(0, 10);
  const planningStart = toPlanningDateTime(planningDayKey, "05:30", planningOffsetMinutes);
  if (current.getTime() > planningStart.getTime()) {
    planningStart.setTime(current.getTime());
  }

  // Keep the whole remaining day visible. A fixed Sleep block protects the
  // normal bedtime, while genuine late commitments can still occupy later time.
  const planningEnd = toPlanningDateTime(planningDayKey, "23:59", planningOffsetMinutes);

  return {
    planningDayKey,
    planningStart,
    planningEnd,
    planningOffsetMinutes,
  };
}

function isOnPlanningDay(date: string, planningDayKey: string, planningOffsetMinutes: number) {
  return toDateKeyAtOffset(date, planningOffsetMinutes) === planningDayKey;
}

function clampEventToPlanningDay(
  event: CalendarEvent,
  planningStart: Date,
  planningEnd: Date,
  planningDayKey: string,
  planningOffsetMinutes: number,
) {
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);

  if (
    !isOnPlanningDay(event.startTime, planningDayKey, planningOffsetMinutes) &&
    !isOnPlanningDay(event.endTime, planningDayKey, planningOffsetMinutes)
  ) {
    return null;
  }

  if (end.getTime() <= planningStart.getTime() || start.getTime() >= planningEnd.getTime()) {
    return null;
  }

  const clampedStart = new Date(Math.max(start.getTime(), planningStart.getTime()));
  const clampedEnd = new Date(Math.min(end.getTime(), planningEnd.getTime()));
  if (clampedEnd.getTime() <= clampedStart.getTime()) {
    return null;
  }

  return {
    ...event,
    startTime: clampedStart.toISOString(),
    endTime: clampedEnd.toISOString(),
  };
}

function constrainScheduleToPlanningDay(
  schedule: CalendarEvent[],
  planningStart: Date,
  planningEnd: Date,
  planningDayKey: string,
  planningOffsetMinutes: number,
) {
  return normalizeCalendarEvents(
    schedule
      .map((event) => clampEventToPlanningDay(event, planningStart, planningEnd, planningDayKey, planningOffsetMinutes))
      .filter((event): event is CalendarEvent => Boolean(event)),
  );
}

function getAssignmentTypePriorityWeight(type: MissionInputAssignment["assessmentType"]) {
  switch (type) {
    case "test":
      return 240;
    case "assignment":
    case "project":
      return 200;
    case "quiz":
      return 160;
    case "homework":
      return 120;
    default:
      return 180;
  }
}

function scoreAssignmentForToday(assignment: MissionInputAssignment, currentTime: string) {
  const now = new Date(currentTime);
  const due = new Date(assignment.dueDate);
  const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const typeWeight = getAssignmentTypePriorityWeight(assignment.assessmentType);
  const userPriorityWeight = assignment.priority === "high" ? 40 : assignment.priority === "medium" ? 20 : 0;
  const urgencyScore = daysUntilDue <= 0 ? 140 : daysUntilDue === 1 ? 110 : daysUntilDue <= 2 ? 90 : daysUntilDue <= 4 ? 60 : daysUntilDue <= 7 ? 30 : 10;
  const effortScore = Math.min(30, Math.round(getMissionAssignmentTargetMinutes(assignment, currentTime) / 5));
  const planningPressureScore = assignment.planningPressureScore || 0;

  return typeWeight + userPriorityWeight + urgencyScore + effortScore + planningPressureScore;
}

function formatMissionAssignment(
  assignment: MissionInputAssignment,
  currentTime: string,
  state?: StudentState,
): MissionInputAssignment {
  const planningStyle = isAssessmentAssignment(assignment) ? "assessment-prep" : "tracked-work";
  const assessmentFramework = planningStyle === "assessment-prep"
    ? buildAssessmentSliceFramework({
        assessmentType: assignment.assessmentType,
        completed: false,
        dueDate: assignment.dueDate,
        estimatedMinutes: assignment.estimatedMinutes,
        priority: assignment.priority as "low" | "medium" | "high",
        progress: {
          percentComplete: assignment.progressPercent || 0,
          completedSteps: [],
          remainingSteps: [],
          studyMinutesCompleted: assignment.studyMinutesCompleted || 0,
          lastUpdatedAt: currentTime,
        },
      }, currentTime)
    : null;
  const trackedWorkFramework = planningStyle === "tracked-work"
    ? buildTrackedWorkSliceFramework({
        assessmentType: assignment.assessmentType,
        completed: false,
        dueDate: assignment.dueDate,
        estimatedMinutes: assignment.estimatedMinutes,
        priority: assignment.priority as "low" | "medium" | "high",
        progress: {
          percentComplete: assignment.progressPercent || 0,
          completedSteps: [],
          remainingSteps: [],
          studyMinutesCompleted: assignment.studyMinutesCompleted || 0,
          lastUpdatedAt: currentTime,
        },
      }, currentTime)
    : null;
  const lookahead = state ? getLookaheadAdjustment({
    ...assignment,
    remainingMinutes: planningStyle === "tracked-work"
      ? trackedWorkFramework?.remainingMinutes
      : assessmentFramework?.remainingMinutes,
  }, state, currentTime) : {
    extraTodayMinutes: 0,
    forceFinishToday: false,
    planningPressureScore: 0,
  };
  const remainingMinutes = planningStyle === "tracked-work"
    ? trackedWorkFramework?.remainingMinutes ?? Math.max(
        15,
        Math.round((assignment.estimatedMinutes || 45) * ((100 - Math.max(0, Math.min(100, assignment.progressPercent || 0))) / 100)),
      )
    : assessmentFramework?.remainingMinutes ?? Math.max(0, (assignment.estimatedMinutes || 45) - Math.max(0, assignment.studyMinutesCompleted || 0));
  const suggestedStudyBlockMinutes = planningStyle === "assessment-prep"
    ? assessmentFramework?.preferredBlockMinutes ?? getRecommendedAssessmentStudyBlockMinutes({
        assessmentType: assignment.assessmentType,
        completed: false,
        dueDate: assignment.dueDate,
        estimatedMinutes: assignment.estimatedMinutes,
        priority: assignment.priority as "low" | "medium" | "high",
        progress: {
          percentComplete: assignment.progressPercent || 0,
          completedSteps: [],
          remainingSteps: [],
          studyMinutesCompleted: assignment.studyMinutesCompleted || 0,
          lastUpdatedAt: currentTime,
        },
      }, currentTime)
    : undefined;

  if (isAssessmentAssignment(assignment)) {
    const recommendedTodayMinutes = Math.min(
      remainingMinutes,
      Math.max(
        assessmentFramework?.recommendedTodayMinutes || suggestedStudyBlockMinutes || 0,
        lookahead.extraTodayMinutes || 0,
      ),
    );
    const assessmentScore = scoreAssignmentForToday({
      ...assignment,
      remainingMinutes,
      recommendedTodayMinutes,
      suggestedStudyBlockMinutes,
      planningPressureScore: lookahead.planningPressureScore,
    }, currentTime);

    return {
      ...assignment,
      title: buildPrepTitle(assignment),
      planningStyle,
      remainingMinutes,
      daysUntilDue: assessmentFramework?.daysUntilDue,
      availableStudyDays: assessmentFramework?.availableStudyDays,
      recommendedTodayMinutes,
      suggestedStudyBlockMinutes,
      recommendedBlockCount: Math.max(
        assessmentFramework?.recommendedBlockCount || 1,
        Math.ceil(Math.max(1, recommendedTodayMinutes) / Math.max(1, suggestedStudyBlockMinutes || 30)),
      ),
      minimumStudyBlockMinutes: assessmentFramework?.minimumBlockMinutes,
      maximumStudyBlockMinutes: assessmentFramework?.maximumBlockMinutes,
      planningPressureScore: lookahead.planningPressureScore,
      priority: assessmentScore >= 220 ? "high" : assessmentScore >= 160 ? "medium" : "low",
    };
  }

  const shouldFinishToday = Boolean(trackedWorkFramework?.shouldFinishToday || lookahead.forceFinishToday);
  const recommendedTodayMinutes = shouldFinishToday
    ? remainingMinutes
    : Math.min(
        remainingMinutes,
        Math.max(
          trackedWorkFramework?.recommendedTodayMinutes || trackedWorkFramework?.preferredBlockMinutes || 0,
          (trackedWorkFramework?.recommendedTodayMinutes || 0) + (lookahead.extraTodayMinutes || 0),
        ),
      );
  const recommendedBlockCount = shouldFinishToday
    ? Math.max(1, Math.ceil(Math.max(1, remainingMinutes) / Math.max(25, trackedWorkFramework?.preferredBlockMinutes || 45)))
    : Math.max(
        trackedWorkFramework?.recommendedBlockCount || 1,
        Math.ceil(Math.max(1, recommendedTodayMinutes) / Math.max(25, trackedWorkFramework?.preferredBlockMinutes || 45)),
      );
  const score = scoreAssignmentForToday({
    ...assignment,
    remainingMinutes,
    recommendedTodayMinutes,
    preferredWorkBlockMinutes: trackedWorkFramework?.preferredBlockMinutes,
    shouldFinishToday,
    planningPressureScore: lookahead.planningPressureScore,
  }, currentTime);
  return {
    ...assignment,
    planningStyle,
    remainingMinutes,
    daysUntilDue: trackedWorkFramework?.daysUntilDue,
    availableWorkDays: trackedWorkFramework?.availableWorkDays,
    recommendedTodayMinutes,
    suggestedStudyBlockMinutes,
    preferredWorkBlockMinutes: trackedWorkFramework?.preferredBlockMinutes,
    recommendedBlockCount,
    minimumStudyBlockMinutes: trackedWorkFramework?.minimumBlockMinutes,
    maximumStudyBlockMinutes: trackedWorkFramework?.maximumBlockMinutes,
    shouldFinishToday,
    planningPressureScore: lookahead.planningPressureScore,
    priority: score >= 220 ? "high" : score >= 160 ? "medium" : "low",
  };
}

function packMissionScheduleForDay(
  events: CalendarEvent[],
  fixedEvents: CalendarEvent[],
  planningStart: Date,
  planningEnd: Date,
  assignments: MissionInputAssignment[],
  documents: MissionInputDocument[],
) {
  const fixedIds = new Set(fixedEvents.map((event) => event.id));
  const scheduledAssignmentMinutes = new Map<string, number>();
  const scheduledAssignmentBlocks = new Map<string, number>();
  const scheduledAssessmentMinutes = new Map<string, number>();
  const scheduledAssessmentBlocks = new Map<string, number>();
  const sortedEvents = [...events]
    .filter((event) => !fixedIds.has(event.id))
    .filter((event) => isSpecificStudyEvent(event, assignments, documents))
    .sort((a, b) => b.priority - a.priority || new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const packed: CalendarEvent[] = [];
  let cursor = new Date(planningStart);

  for (const event of sortedEvents) {
    const relatedAssignment = resolveRelatedAssignmentForEvent(event, assignments);
    let durationMinutes = getEventDurationMinutes(event);

    if (relatedAssignment?.planningStyle === "assessment-prep") {
      const scheduledMinutesSoFar = scheduledAssessmentMinutes.get(relatedAssignment.id) || 0;
      const scheduledBlocksSoFar = scheduledAssessmentBlocks.get(relatedAssignment.id) || 0;
      const constrainedDuration = getConstrainedAssessmentEventDuration(
        durationMinutes,
        relatedAssignment,
        scheduledMinutesSoFar,
        scheduledBlocksSoFar,
      );

      if (!constrainedDuration) {
        continue;
      }

      durationMinutes = constrainedDuration;
    }

    if (relatedAssignment?.planningStyle === "tracked-work") {
      const scheduledMinutesSoFar = scheduledAssignmentMinutes.get(relatedAssignment.id) || 0;
      const scheduledBlocksSoFar = scheduledAssignmentBlocks.get(relatedAssignment.id) || 0;
      const constrainedDuration = getConstrainedTrackedWorkEventDuration(
        durationMinutes,
        relatedAssignment,
        scheduledMinutesSoFar,
        scheduledBlocksSoFar,
      );

      if (!constrainedDuration) {
        continue;
      }

      durationMinutes = constrainedDuration;
    }

    const start = findNextOpenStart(cursor, durationMinutes, fixedEvents);
    const end = addMinutes(start, durationMinutes);
    if (end.getTime() > planningEnd.getTime()) break;

    packed.push({
      ...event,
      title:
        relatedAssignment && isAssessmentAssignment(relatedAssignment)
          ? buildPrepTitle(relatedAssignment)
          : event.title,
      relatedAssignmentId: relatedAssignment?.id || event.relatedAssignmentId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      priority:
        relatedAssignment && isAssessmentAssignment(relatedAssignment)
          ? Math.max(event.priority, 8)
          : event.priority,
    });

    if (relatedAssignment?.planningStyle === "assessment-prep") {
      scheduledAssessmentMinutes.set(
        relatedAssignment.id,
        (scheduledAssessmentMinutes.get(relatedAssignment.id) || 0) + durationMinutes,
      );
      scheduledAssessmentBlocks.set(
        relatedAssignment.id,
        (scheduledAssessmentBlocks.get(relatedAssignment.id) || 0) + 1,
      );
    }

    if (relatedAssignment?.planningStyle === "tracked-work") {
      scheduledAssignmentMinutes.set(
        relatedAssignment.id,
        (scheduledAssignmentMinutes.get(relatedAssignment.id) || 0) + durationMinutes,
      );
      scheduledAssignmentBlocks.set(
        relatedAssignment.id,
        (scheduledAssignmentBlocks.get(relatedAssignment.id) || 0) + 1,
      );
    }

    cursor = addMinutes(end, 10);
  }

  const assessmentTopUpCandidates = assignments
    .filter((assignment) => assignment.planningStyle === "assessment-prep")
    .filter((assignment) => {
      const scheduledBlocks = scheduledAssessmentBlocks.get(assignment.id) || 0;
      return scheduledBlocks > 0 || (assignment.daysUntilDue ?? 99) <= 1;
    })
    .sort((a, b) => scoreAssignmentForToday(b, planningStart.toISOString()) - scoreAssignmentForToday(a, planningStart.toISOString()));

  for (const assignment of assessmentTopUpCandidates) {
    while (true) {
      const scheduledMinutesSoFar = scheduledAssessmentMinutes.get(assignment.id) || 0;
      const scheduledBlocksSoFar = scheduledAssessmentBlocks.get(assignment.id) || 0;
      const durationMinutes = getConstrainedAssessmentEventDuration(
        assignment.suggestedStudyBlockMinutes || 30,
        assignment,
        scheduledMinutesSoFar,
        scheduledBlocksSoFar,
      );

      if (!durationMinutes) {
        break;
      }

      const lastAssignmentBlock = [...packed]
        .filter((event) => event.relatedAssignmentId === assignment.id)
        .sort((a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime())
        .at(-1);
      const searchStart = lastAssignmentBlock
        ? addMinutes(new Date(lastAssignmentBlock.endTime), 10)
        : new Date(planningStart);
      const start = findNextOpenStart(searchStart, durationMinutes, [...fixedEvents, ...packed]);
      const end = addMinutes(start, durationMinutes);

      if (end.getTime() > planningEnd.getTime()) {
        break;
      }

      packed.push({
        id: crypto.randomUUID(),
        title: buildPrepTitle(assignment),
        type: "study",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        relatedAssignmentId: assignment.id,
        priority: Math.max(8, Math.min(10, Math.round(scoreAssignmentForToday(assignment, planningStart.toISOString()) / 20))),
        createdAt: planningStart.toISOString(),
        source: "ai",
      });

      scheduledAssessmentMinutes.set(assignment.id, scheduledMinutesSoFar + durationMinutes);
      scheduledAssessmentBlocks.set(assignment.id, scheduledBlocksSoFar + 1);
    }
  }

  const trackedWorkTopUpCandidates = assignments
    .filter((assignment) => assignment.planningStyle === "tracked-work")
    .filter((assignment) => {
      const scheduledMinutes = scheduledAssignmentMinutes.get(assignment.id) || 0;
      return scheduledMinutes > 0 || assignment.shouldFinishToday;
    })
    .sort((a, b) => scoreAssignmentForToday(b, planningStart.toISOString()) - scoreAssignmentForToday(a, planningStart.toISOString()));

  for (const assignment of trackedWorkTopUpCandidates) {
    while (true) {
      const scheduledMinutesSoFar = scheduledAssignmentMinutes.get(assignment.id) || 0;
      const scheduledBlocksSoFar = scheduledAssignmentBlocks.get(assignment.id) || 0;
      const remainingTargetMinutes = Math.max(
        0,
        (assignment.recommendedTodayMinutes || assignment.remainingMinutes || 0) - scheduledMinutesSoFar,
      );
      const seedDuration = assignment.shouldFinishToday
        ? Math.min(
            assignment.preferredWorkBlockMinutes || remainingTargetMinutes || 45,
            remainingTargetMinutes || assignment.remainingMinutes || 45,
          )
        : assignment.preferredWorkBlockMinutes || remainingTargetMinutes || 45;
      const durationMinutes = getConstrainedTrackedWorkEventDuration(
        seedDuration,
        assignment,
        scheduledMinutesSoFar,
        scheduledBlocksSoFar,
      );

      if (!durationMinutes) {
        break;
      }

      const lastAssignmentBlock = [...packed]
        .filter((event) => event.relatedAssignmentId === assignment.id)
        .sort((a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime())
        .at(-1);
      const searchStart = lastAssignmentBlock
        ? addMinutes(new Date(lastAssignmentBlock.endTime), 10)
        : new Date(planningStart);
      const start = findNextOpenStart(searchStart, durationMinutes, [...fixedEvents, ...packed]);
      const end = addMinutes(start, durationMinutes);

      if (end.getTime() > planningEnd.getTime()) {
        break;
      }

      packed.push({
        id: crypto.randomUUID(),
        title: `Work on ${assignment.title}`,
        type: "study",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        relatedAssignmentId: assignment.id,
        priority: Math.max(7, Math.min(10, Math.round(scoreAssignmentForToday(assignment, planningStart.toISOString()) / 20))),
        createdAt: planningStart.toISOString(),
        source: "ai",
      });

      scheduledAssignmentMinutes.set(assignment.id, scheduledMinutesSoFar + durationMinutes);
      scheduledAssignmentBlocks.set(assignment.id, scheduledBlocksSoFar + 1);
    }
  }

  return packed;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function buildStudyEvent(
  assignment: MissionInputAssignment,
  start: Date,
  minutes: number,
  titlePrefix: string,
  createdAt: string,
  priority: number
): CalendarEvent {
  return {
    id: crypto.randomUUID(),
    title: `${titlePrefix} ${assignment.title}`,
    type: "study",
    startTime: start.toISOString(),
    endTime: addMinutes(start, minutes).toISOString(),
    relatedAssignmentId: assignment.id,
    priority,
    createdAt,
    source: "ai",
  };
}

function overlapsFixedEvent(start: Date, end: Date, fixedEvents: CalendarEvent[]) {
  return fixedEvents.some((event) => {
    const fixedStart = new Date(event.startTime);
    const fixedEnd = new Date(event.endTime);
    return start < fixedEnd && end > fixedStart;
  });
}

function findNextOpenStart(start: Date, minutes: number, fixedEvents: CalendarEvent[]) {
  let cursor = new Date(start);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const end = addMinutes(cursor, minutes);
    const overlapping = fixedEvents.find((event) => {
      const fixedStart = new Date(event.startTime);
      const fixedEnd = new Date(event.endTime);
      return cursor < fixedEnd && end > fixedStart;
    });

    if (!overlapping) return cursor;
    cursor = addMinutes(new Date(overlapping.endTime), 10);
  }

  return cursor;
}

function buildRecoveryBreak(start: Date, minutes: number, createdAt: string): CalendarEvent {
  return {
    id: crypto.randomUUID(),
    title: minutes >= 30 ? "Rest / recovery block" : "Recovery break",
    type: "break",
    startTime: start.toISOString(),
    endTime: addMinutes(start, minutes).toISOString(),
    priority: 7,
    createdAt,
    source: "ai",
  };
}

function getGapDurationMinutes(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function buildGapFillEvent(
  start: Date,
  end: Date,
  createdAt: string,
  previousEvent?: CalendarEvent,
): CalendarEvent {
  const minutes = getGapDurationMinutes(start, end);
  const afterStudy = previousEvent?.type === "study";

  if (afterStudy && minutes <= 20) {
    return {
      id: crypto.randomUUID(),
      title: minutes >= 15 ? "Recovery break" : "Short reset",
      type: "break",
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      priority: 7,
      createdAt,
      source: "ai",
    };
  }

  return {
    id: crypto.randomUUID(),
    title: "Free time",
    type: "personal",
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    priority: 5,
    createdAt,
    source: "ai",
  };
}

function closeMissionScheduleGaps(
  schedule: CalendarEvent[],
  planningStart: Date,
  planningEnd: Date,
  createdAt: string,
) {
  const ordered = sortMissionSchedule(schedule).map((event) => ({ ...event }));
  const sealed: CalendarEvent[] = [];
  let cursor = new Date(planningStart);

  for (const originalEvent of ordered) {
    const event = { ...originalEvent };
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);

    if (end.getTime() <= cursor.getTime()) {
      continue;
    }

    if (start.getTime() > cursor.getTime()) {
      const gapStart = new Date(cursor);
      const gapEnd = new Date(start);
      const previous = sealed.at(-1);

      if (previous && isReplaceableMissionBlock(previous)) {
        previous.endTime = gapEnd.toISOString();
      } else if (isReplaceableMissionBlock(event)) {
        event.startTime = gapStart.toISOString();
      } else {
        sealed.push(buildGapFillEvent(gapStart, gapEnd, createdAt, previous));
      }
    } else if (start.getTime() < cursor.getTime()) {
      event.startTime = cursor.toISOString();
    }

    if (new Date(event.endTime).getTime() > new Date(event.startTime).getTime()) {
      sealed.push(event);
      cursor = new Date(event.endTime);
    }
  }

  if (cursor.getTime() < planningEnd.getTime()) {
    const previous = sealed.at(-1);
    if (previous && isReplaceableMissionBlock(previous)) {
      previous.endTime = planningEnd.toISOString();
    } else {
      sealed.push(buildGapFillEvent(cursor, planningEnd, createdAt, previous));
    }
  }

  return normalizeCalendarEvents(insertRequiredStudyBreaks(sealed, createdAt));
}

function insertRequiredStudyBreaks(schedule: CalendarEvent[], createdAt: string) {
  const requiredStudyMinutesBeforeBreak = 60;
  const breakMinutes = 5;
  const adjusted: CalendarEvent[] = [];
  let consecutiveStudyMinutes = 0;
  let previousEventEnd: number | null = null;
  let previousWasStudy = false;

  for (const event of sortMissionSchedule(schedule)) {
    const eventStart = new Date(event.startTime);
    const eventEnd = new Date(event.endTime);
    const durationMinutes = Math.max(0, Math.round((eventEnd.getTime() - eventStart.getTime()) / 60000));
    const continuesStudying = event.type === "study" && previousWasStudy && previousEventEnd === eventStart.getTime();

    if (event.type !== "study" || !continuesStudying) {
      consecutiveStudyMinutes = 0;
    }

    if (event.type !== "study" || durationMinutes <= 0) {
      adjusted.push(event);
      previousWasStudy = event.type === "study";
      previousEventEnd = eventEnd.getTime();
      continue;
    }

    let cursor = new Date(eventStart);
    let remainingWindowMinutes = durationMinutes;
    let segmentIndex = 0;

    while (remainingWindowMinutes > 0) {
      const minutesUntilBreak = requiredStudyMinutesBeforeBreak - consecutiveStudyMinutes;
      const studyMinutes = Math.min(remainingWindowMinutes, minutesUntilBreak);

      if (studyMinutes > 0) {
        const segmentEnd = addMinutes(cursor, studyMinutes);
        adjusted.push({
          ...event,
          id: segmentIndex === 0 && studyMinutes === durationMinutes
            ? event.id
            : `${event.id}:study:${segmentIndex}:${crypto.randomUUID()}`,
          startTime: cursor.toISOString(),
          endTime: segmentEnd.toISOString(),
        });
        cursor = segmentEnd;
        remainingWindowMinutes -= studyMinutes;
        consecutiveStudyMinutes += studyMinutes;
        segmentIndex += 1;
      }

      if (consecutiveStudyMinutes < requiredStudyMinutesBeforeBreak || remainingWindowMinutes <= 0) {
        continue;
      }

      // A tiny tail at the end of a completed session does not need a break
      // after it, because the student is no longer continuing to study.
      if (remainingWindowMinutes <= breakMinutes) {
        const segmentEnd = addMinutes(cursor, remainingWindowMinutes);
        adjusted.push({
          ...event,
          id: `${event.id}:study:${segmentIndex}:${crypto.randomUUID()}`,
          startTime: cursor.toISOString(),
          endTime: segmentEnd.toISOString(),
        });
        consecutiveStudyMinutes += remainingWindowMinutes;
        remainingWindowMinutes = 0;
        continue;
      }

      const actualBreakMinutes = Math.min(breakMinutes, remainingWindowMinutes);
      adjusted.push({
        id: `study-break:${crypto.randomUUID()}`,
        title: "Short study break",
        type: "break",
        startTime: cursor.toISOString(),
        endTime: addMinutes(cursor, actualBreakMinutes).toISOString(),
        priority: 7,
        createdAt,
        source: "ai",
      });
      cursor = addMinutes(cursor, actualBreakMinutes);
      remainingWindowMinutes -= actualBreakMinutes;
      consecutiveStudyMinutes = 0;
    }

    previousWasStudy = true;
    previousEventEnd = eventEnd.getTime();
  }

  return adjusted;
}

function mergeQuickUpdateIntoExistingMission(
  nextSchedule: CalendarEvent[],
  previousSchedule: CalendarEvent[] | undefined,
  fixedEvents: CalendarEvent[],
  planningStart: Date,
  planningEnd: Date,
  planningDayKey: string,
  planningOffsetMinutes: number,
) {
  const fixedIds = new Set(fixedEvents.map((event) => event.id));
  const preservedSchedule = (previousSchedule || [])
    .filter((event) => !fixedIds.has(event.id))
    .filter((event) => isOnPlanningDay(event.startTime, planningDayKey, planningOffsetMinutes));
  const preservedBySignature = new Set(preservedSchedule.map((event) => calendarEventSignature(event)));

  const candidate = [...nextSchedule]
    .filter((event) => !fixedIds.has(event.id))
    .filter((event) => isOnPlanningDay(event.startTime, planningDayKey, planningOffsetMinutes))
    .filter((event) => !preservedBySignature.has(calendarEventSignature(event)))
    .sort((a, b) => b.priority - a.priority || new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .at(0);

  if (!candidate) {
    return preservedSchedule;
  }

  const durationMinutes = Math.max(
    15,
    Math.round((new Date(candidate.endTime).getTime() - new Date(candidate.startTime).getTime()) / 60000) || 45,
  );
  const occupiedEvents = [...fixedEvents, ...preservedSchedule];
  const start = findNextOpenStart(new Date(candidate.startTime), durationMinutes, occupiedEvents);
  const end = addMinutes(start, durationMinutes);

  if (end.getTime() > planningEnd.getTime()) {
    return preservedSchedule;
  }

  const inserted = {
    ...candidate,
    id: candidate.id || crypto.randomUUID(),
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    title: candidate.title,
    priority: candidate.priority,
  };

  return [...preservedSchedule, inserted];
}

function isReplaceableMissionBlock(event: CalendarEvent) {
  return event.type === "break" || /(?:free time|open time|wind down|wind-down|buffer|break|recovery)/i.test(event.title);
}

function extractQuickUpdateDurationMinutes(input: string) {
  const normalized = input.toLowerCase();
  const hourMatch = normalized.match(/\b(\d+)\s*(?:hours?|hrs?|hr)\b/);
  if (hourMatch) return Number(hourMatch[1]) * 60;

  const minuteMatch = normalized.match(/\b(\d+)\s*(?:minutes?|mins?|min)\b/);
  if (minuteMatch) return Number(minuteMatch[1]);

  if (/\b(an?|one)\s+hour\b/.test(normalized)) return 60;
  if (/\bhalf an hour\b/.test(normalized) || /\bhalf hour\b/.test(normalized)) return 30;

  return null;
}

function isGenericQuickUpdateRequest(input: string) {
  const normalized = input.toLowerCase();
  return (
    normalized.includes("homework") ||
    normalized.includes("assignment") ||
    normalized.includes("study")
  );
}

function extractQuickUpdateTitle(input: string) {
  const normalized = input.toLowerCase();

  if (normalized.includes("personal project")) return "Personal Project";
  if (/(?:personal\s+prject|personal\s+projct|personal\s+projet|personal\s+pr[o0]?j[a-z]*ct)/i.test(normalized)) {
    return "Personal Project";
  }
  if (normalized.includes("project")) return "Personal Project";
  if (normalized.includes("homework")) return "Homework";
  if (normalized.includes("assignment")) return "Assignment Work";
  if (normalized.includes("study")) return "Study Session";

  const cleaned = input
    .replace(/\b(?:for|before|after)\b[\s\S]*$/i, "")
    .replace(/\b(?:an?|one)\s+hour\b/i, "")
    .replace(/\b\d+\s*(?:hours?|hrs?|hr|minutes?|mins?|min)\b/i, "")
    .replace(/\b(?:work on|focus on|do|handle|finish|complete|start)\b/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function resolveQuickUpdateAssignment(
  input: string,
  assignments: MissionInputAssignment[],
  schedule: CalendarEvent[],
  currentTime: string,
  excludedAssignmentIds?: Set<string>,
) {
  if (!isGenericQuickUpdateRequest(input)) return null;

  const normalized = input.toLowerCase();
  const scheduledAssignmentIds = new Set(
    schedule.map((event) => event.relatedAssignmentId).filter(Boolean),
  );

  const courseFiltered = getUpcomingMissionAssignments(assignments, currentTime, 7, excludedAssignmentIds).filter((assignment) => {
    if (scheduledAssignmentIds.has(assignment.id)) return false;

    const haystack = `${assignment.title} ${assignment.course} ${assignment.subject || ""}`.toLowerCase();
    const mentionsContext =
      (assignment.course && normalized.includes(assignment.course.toLowerCase())) ||
      (assignment.subject && normalized.includes(assignment.subject.toLowerCase()));

    return mentionsContext || haystack.split(/\s+/).some((token) => token.length > 4 && normalized.includes(token));
  });

  if (courseFiltered.length) {
    return courseFiltered[0];
  }

  return pickReplacementAssignment(assignments, schedule, currentTime, excludedAssignmentIds);
}

function extractQuickUpdateAnchorKeywords(input: string) {
  const normalized = input.toLowerCase();
  const keywords: string[] = [];

  if (normalized.includes("before")) {
    if (normalized.includes("getting ready")) {
      keywords.push("get ready", "prep", "training", "practice");
    }
    if (normalized.includes("practice")) {
      keywords.push("practice", "training", "session");
    }
    if (normalized.includes("referee")) {
      keywords.push("referee", "practice", "session");
    }
  }

  if (normalized.includes("after")) {
    if (normalized.includes("practice")) {
      keywords.push("practice", "recovery", "wind down");
    }
  }

  return [...new Set(keywords)];
}

function normalizeAnchorText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAnchorTerms(anchorPhrase: string) {
  const normalized = normalizeAnchorText(anchorPhrase);
  const terms = new Set<string>();

  if (!normalized) {
    return [];
  }

  terms.add(normalized);
  terms.add(normalized.replace(/\bthe\b/g, "").replace(/\s+/g, " ").trim());

  if (normalized.includes("getting ready")) {
    terms.add("get ready for training");
    terms.add("get ready to referee");
    terms.add("get ready");
    terms.add("prep");
  }

  if (normalized.includes("shower and recovery") || normalized.includes("recovery")) {
    terms.add("shower and recovery");
    terms.add("recovery");
  }

  if (normalized.includes("wind down")) {
    terms.add("wind down");
  }

  if (normalized.includes("practice") || normalized.includes("training")) {
    terms.add("football practice");
    terms.add("practice");
    terms.add("training");
    terms.add("session");
  }

  if (normalized.includes("free time")) {
    terms.add("free time");
  }

  return [...terms].filter(Boolean);
}

function extractQuickUpdateAnchorPreference(input: string) {
  const normalized = input.toLowerCase();
  const relationMatch = normalized.match(/\b(before|after)\b\s+(.+)$/i);

  if (!relationMatch) {
    return {
      relation: null as "before" | "after" | null,
      terms: extractQuickUpdateAnchorKeywords(input),
    };
  }

  const relation = relationMatch[1].toLowerCase() as "before" | "after";
  const anchorPhrase = relationMatch[2]
    .replace(/\b(?:today|tonight|this morning|this afternoon|this evening)\b/gi, "")
    .trim();

  return {
    relation,
    terms: buildAnchorTerms(anchorPhrase),
  };
}

function findQuickUpdateAnchorEvent(schedule: CalendarEvent[], input: string, currentTime: string) {
  const currentMillis = new Date(currentTime).getTime();
  const anchorPreference = extractQuickUpdateAnchorPreference(input);
  const ordered = sortMissionSchedule(schedule).filter((event) => new Date(event.endTime).getTime() > currentMillis);

  for (const term of anchorPreference.terms) {
    const exactMatch = ordered.find((event) => normalizeAnchorText(event.title) === term);
    if (exactMatch) {
      return {
        relation: anchorPreference.relation,
        event: exactMatch,
      };
    }
  }

  for (const term of anchorPreference.terms) {
    const containsMatch = ordered.find((event) => {
      const title = normalizeAnchorText(event.title);
      return title.includes(term) || term.includes(title);
    });
    if (containsMatch) {
      return {
        relation: anchorPreference.relation,
        event: containsMatch,
      };
    }
  }

  return {
    relation: anchorPreference.relation,
    event: ordered.find((event) => !isReplaceableMissionBlock(event)) || null,
  };
}

function findInsertionWindow(
  schedule: CalendarEvent[],
  durationMinutes: number,
  currentTime: string,
  planningStart: Date,
  planningEnd: Date,
  anchorEvent: CalendarEvent | null,
  relation: "before" | "after" | null,
  requireFullDuration = false,
) {
  const current = new Date(currentTime);
  const occupied = sortMissionSchedule(schedule);
  const earliest = new Date(Math.max(current.getTime(), planningStart.getTime()));
  const anchorStart = anchorEvent ? new Date(anchorEvent.startTime) : null;
  const anchorEnd = anchorEvent ? new Date(anchorEvent.endTime) : null;
  const minimumUsefulMinutes = 20;
  const minimumRequiredMinutes = requireFullDuration ? durationMinutes : minimumUsefulMinutes;

  if (relation === "after" && anchorEnd) {
    const afterStart = new Date(Math.max(anchorEnd.getTime(), earliest.getTime()));
    const replaceableWindows = occupied.filter((event) => {
      if (!isReplaceableMissionBlock(event)) return false;
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return eventEnd > afterStart && eventStart <= planningEnd;
    });

    for (const event of replaceableWindows) {
      const eventStart = new Date(Math.max(new Date(event.startTime).getTime(), afterStart.getTime()));
      const eventEnd = new Date(Math.min(new Date(event.endTime).getTime(), planningEnd.getTime()));
      const availableMinutes = Math.max(0, Math.floor((eventEnd.getTime() - eventStart.getTime()) / 60000));
      if (availableMinutes < minimumRequiredMinutes) continue;

      const usedMinutes = requireFullDuration ? durationMinutes : Math.min(durationMinutes, availableMinutes);
      return {
        start: eventStart,
        end: addMinutes(eventStart, usedMinutes),
      };
    }

    let cursor = new Date(afterStart);
    for (const event of occupied) {
      const start = new Date(event.startTime);
      const end = new Date(event.endTime);
      if (end <= cursor) continue;
      const availableMinutes = Math.max(0, Math.floor((start.getTime() - cursor.getTime()) / 60000));
      if (availableMinutes >= minimumRequiredMinutes) {
        const usedMinutes = requireFullDuration ? durationMinutes : Math.min(durationMinutes, availableMinutes);
        return {
          start: cursor,
          end: addMinutes(cursor, usedMinutes),
        };
      }
      cursor = end > cursor ? end : cursor;
    }

    const remainingMinutes = Math.max(0, Math.floor((planningEnd.getTime() - cursor.getTime()) / 60000));
    if (remainingMinutes >= minimumRequiredMinutes) {
      const usedMinutes = requireFullDuration ? durationMinutes : Math.min(durationMinutes, remainingMinutes);
      return {
        start: cursor,
        end: addMinutes(cursor, usedMinutes),
      };
    }

    return null;
  }

  if (anchorStart) {
    const replaceableWindows = occupied.filter((event) => {
      if (!isReplaceableMissionBlock(event)) return false;
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return eventEnd > earliest && eventStart < anchorStart;
    });

    for (const event of [...replaceableWindows].reverse()) {
      const eventStart = new Date(Math.max(new Date(event.startTime).getTime(), earliest.getTime()));
      const eventEnd = new Date(Math.min(new Date(event.endTime).getTime(), anchorStart.getTime()));
      const availableMinutes = Math.max(0, Math.floor((eventEnd.getTime() - eventStart.getTime()) / 60000));
      if (availableMinutes < minimumRequiredMinutes) continue;

      const usedMinutes = requireFullDuration ? durationMinutes : Math.min(durationMinutes, availableMinutes);
      const latestStart = new Date(eventEnd.getTime() - usedMinutes * 60 * 1000);
      if (latestStart.getTime() >= eventStart.getTime()) {
        return {
          start: latestStart,
          end: addMinutes(latestStart, usedMinutes),
        };
      }
    }
  }

  const replaceableWindows = occupied.filter((event) => {
    if (!isReplaceableMissionBlock(event)) return false;
    const eventEnd = new Date(event.endTime);
    return eventEnd > earliest;
  });

  for (const event of replaceableWindows) {
    const eventStart = new Date(Math.max(new Date(event.startTime).getTime(), earliest.getTime()));
    const eventEnd = new Date(Math.min(new Date(event.endTime).getTime(), planningEnd.getTime()));
    const availableMinutes = Math.max(0, Math.floor((eventEnd.getTime() - eventStart.getTime()) / 60000));
    if (availableMinutes < minimumRequiredMinutes) continue;

    const usedMinutes = requireFullDuration ? durationMinutes : Math.min(durationMinutes, availableMinutes);
    return {
      start: eventStart,
      end: addMinutes(eventStart, usedMinutes),
    };
  }

  let cursor = new Date(earliest);
  for (const event of occupied) {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    if (end <= cursor) continue;
    const availableMinutes = Math.max(0, Math.floor((start.getTime() - cursor.getTime()) / 60000));
    if (availableMinutes >= minimumRequiredMinutes) {
      const usedMinutes = requireFullDuration ? durationMinutes : Math.min(durationMinutes, availableMinutes);
      return {
        start: cursor,
        end: addMinutes(cursor, usedMinutes),
      };
    }
    cursor = end > cursor ? end : cursor;
  }

  const remainingMinutes = Math.max(0, Math.floor((planningEnd.getTime() - cursor.getTime()) / 60000));
  if (remainingMinutes >= minimumRequiredMinutes) {
    const usedMinutes = requireFullDuration ? durationMinutes : Math.min(durationMinutes, remainingMinutes);
    return {
      start: cursor,
      end: addMinutes(cursor, usedMinutes),
    };
  }

  return null;
}

function applyQuickUpdateToSchedule(
  schedule: CalendarEvent[],
  input: string,
  currentTime: string,
  planningStart: Date,
  planningEnd: Date,
  planningDayKey: string,
  planningOffsetMinutes: number,
  assignments: MissionInputAssignment[],
  excludedAssignmentIds?: Set<string>,
) {
  const resolvedAssignment = resolveQuickUpdateAssignment(
    input,
    assignments,
    schedule,
    currentTime,
    excludedAssignmentIds,
  );
  const explicitDurationMinutes = extractQuickUpdateDurationMinutes(input);
  const title = resolvedAssignment ? buildMissionAssignmentTitle(resolvedAssignment) : extractQuickUpdateTitle(input);
  const durationMinutes = resolvedAssignment
    ? isAssessmentAssignment(resolvedAssignment)
      ? Math.max(25, explicitDurationMinutes ?? getMissionAssignmentTargetMinutes(resolvedAssignment, currentTime))
      : Math.max(
          15,
          explicitDurationMinutes
            ? Math.min(explicitDurationMinutes, getMissionAssignmentTargetMinutes(resolvedAssignment, currentTime))
            : getMissionAssignmentTargetMinutes(resolvedAssignment, currentTime),
        )
    : Math.max(20, explicitDurationMinutes ?? 30);
  if (!title) {
    return {
      schedule: constrainScheduleToPlanningDay(schedule, planningStart, planningEnd, planningDayKey, planningOffsetMinutes),
      inserted: null,
    };
  }
  if (!resolvedAssignment && isGenericMissionWorkTitle(title)) {
    return {
      schedule: constrainScheduleToPlanningDay(schedule, planningStart, planningEnd, planningDayKey, planningOffsetMinutes),
      inserted: null,
    };
  }
  const anchor = findQuickUpdateAnchorEvent(schedule, input, currentTime);
  const insertionWindow = findInsertionWindow(
    schedule,
    durationMinutes,
    currentTime,
    planningStart,
    planningEnd,
    anchor.event,
    anchor.relation,
    Boolean(explicitDurationMinutes || resolvedAssignment?.shouldFinishToday),
  );

  if (!insertionWindow) {
    return {
      schedule: constrainScheduleToPlanningDay(schedule, planningStart, planningEnd, planningDayKey, planningOffsetMinutes),
      inserted: null,
    };
  }

  const insertionStart = insertionWindow.start;
  const insertionEnd = insertionWindow.end;
  const ordered = sortMissionSchedule(schedule);
  const overlappingAiIds = new Set(
    ordered
      .filter((event) => event.source === "ai")
      .filter((event) => normalizeText(event.title) === normalizeText(title) || new Date(event.startTime).getTime() < insertionEnd.getTime())
      .filter((event) => new Date(event.startTime).getTime() < insertionEnd.getTime())
      .filter((event) => normalizeText(event.title) === normalizeText(title) || new Date(event.endTime).getTime() > insertionStart.getTime())
      .map((event) => event.id),
  );
  const replaceableIndex = ordered.findIndex((event) =>
    isReplaceableMissionBlock(event) &&
    new Date(event.startTime).getTime() <= insertionStart.getTime() &&
    new Date(event.endTime).getTime() >= insertionEnd.getTime()
  );

  const nextSchedule: CalendarEvent[] = [];
  let replacedEvent: CalendarEvent | null = null;
  const insertedEvent: CalendarEvent = {
    id: `manual-block:${crypto.randomUUID()}`,
    title,
    type: resolvedAssignment || /(?:study|assignment|homework|quiz|test|exam|review|read|write|paper|essay|project)/i.test(input) ? "study" : "personal",
    startTime: insertionStart.toISOString(),
    endTime: insertionEnd.toISOString(),
    relatedAssignmentId: resolvedAssignment?.id,
    priority: resolvedAssignment
      ? Math.max(6, Math.min(10, Math.round(scoreAssignmentForToday(resolvedAssignment, currentTime) / 20)))
      : 8,
    createdAt: currentTime,
    source: "ai",
    fixed: true,
    missionOnly: true,
  };

  for (const event of ordered) {
    if (overlappingAiIds.has(event.id)) {
      replacedEvent = event;
      continue;
    }

    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    const eventIdMatchesReplaceable = replaceableIndex >= 0 && event.id === ordered[replaceableIndex]?.id;
    if (!eventIdMatchesReplaceable) {
      nextSchedule.push(event);
      continue;
    }

    replacedEvent = event;
    if (start.getTime() < insertionStart.getTime()) {
      nextSchedule.push({
        ...event,
        id: `${event.id}:left`,
        endTime: insertionStart.toISOString(),
      });
    }

    nextSchedule.push(insertedEvent);

    if (end.getTime() > insertionEnd.getTime()) {
      nextSchedule.push({
        ...event,
        id: `${event.id}:right`,
        startTime: insertionEnd.toISOString(),
      });
    }

    // copy over the rest of the schedule as-is
    for (const remainingEvent of ordered.slice(ordered.indexOf(event) + 1)) {
      if (overlappingAiIds.has(remainingEvent.id)) {
        continue;
      }
      nextSchedule.push(remainingEvent);
    }

    break;
  }

  if (!replacedEvent) {
    nextSchedule.push(insertedEvent);
  }

  return {
    schedule: constrainScheduleToPlanningDay(nextSchedule, planningStart, planningEnd, planningDayKey, planningOffsetMinutes),
    inserted: insertedEvent,
  };
}

function mergeQuickUpdateSourceSchedules(
  dailyPlanSchedule: CalendarEvent[],
  missionSchedule: CalendarEvent[],
  planningDayKey: string,
  planningStart: Date,
  planningEnd: Date,
  planningOffsetMinutes: number,
) {
  const seen = new Set<string>();

  return constrainScheduleToPlanningDay(
    [...dailyPlanSchedule, ...missionSchedule
    // The current daily-plan baseline is authoritative. Never carry an old
    // school routine into a quick update after the student chose "No school".
    .filter((event) => !event.id.startsWith("daily-plan:") || !event.id.includes(":baseline:"))]
    .filter((event) => isOnPlanningDay(event.startTime, planningDayKey, planningOffsetMinutes))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .filter((event) => {
      const signature = calendarEventSignature(event);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    }),
    planningStart,
    planningEnd,
    planningDayKey,
    planningOffsetMinutes,
  );
}

function isSchoolDayBaselineEvent(event: CalendarEvent) {
  return [
    "morning run",
    "get ready for school",
    "bus to school",
    "school",
    "hang out with friends",
    "bus home",
  ].includes(normalizeText(event.title));
}

function getStudyMinutes(schedule: CalendarEvent[], fixedEvents: CalendarEvent[]) {
  const fixedIds = new Set(fixedEvents.map((event) => event.id));
  return schedule.reduce((total, event) => {
    if (event.type !== "study" || fixedIds.has(event.id)) return total;
    return total + getEventDurationMinutes(event);
  }, 0);
}

function enforceAssignmentTimeBudgets(
  schedule: CalendarEvent[],
  assignments: MissionInputAssignment[],
) {
  const scheduledMinutes = new Map<string, number>();
  const budgeted: CalendarEvent[] = [];

  for (const event of sortMissionSchedule(schedule)) {
    const assignment = resolveRelatedAssignmentForEvent(event, assignments);
    if (event.type !== "study" || !assignment) {
      budgeted.push(event);
      continue;
    }

    const alreadyScheduled = scheduledMinutes.get(assignment.id) || 0;
    const durationMinutes = getEventDurationMinutes(event);
    const targetMinutes = Math.max(0, assignment.remainingMinutes || 0);

    if (assignment.planningStyle !== "assessment-prep") {
      const allowedMinutes = Math.max(0, targetMinutes - alreadyScheduled);
      if (!allowedMinutes) continue;

      const appliedMinutes = Math.min(durationMinutes, allowedMinutes);
      budgeted.push({
        ...event,
        endTime: addMinutes(new Date(event.startTime), appliedMinutes).toISOString(),
      });
      scheduledMinutes.set(assignment.id, alreadyScheduled + appliedMinutes);
      continue;
    }

    const minutesBeforeTarget = Math.max(0, targetMinutes - alreadyScheduled);
    if (minutesBeforeTarget >= durationMinutes) {
      budgeted.push(event);
    } else if (minutesBeforeTarget > 0) {
      const targetEnd = addMinutes(new Date(event.startTime), minutesBeforeTarget);
      budgeted.push({ ...event, endTime: targetEnd.toISOString() });
      budgeted.push({
        ...event,
        id: `${event.id}:extra-prep`,
        startTime: targetEnd.toISOString(),
        priority: Math.min(event.priority, 3),
      });
    } else {
      budgeted.push({ ...event, priority: Math.min(event.priority, 3) });
    }
    scheduledMinutes.set(assignment.id, alreadyScheduled + durationMinutes);
  }

  return sortMissionSchedule(budgeted);
}

function addWeakSubjectStudyBlocks(
  schedule: CalendarEvent[],
  assignments: MissionInputAssignment[],
  state: StudentState,
  currentTime: string,
) {
  const isAutomaticWeakSubjectReview = (event: CalendarEvent) =>
    event.source === "ai" && state.grades.some(
      (grade) => normalizeText(event.title) === `review ${normalizeText(grade.subject)} weak topics`,
    );
  // The deterministic rules below own optional weak-subject review, even when AI produced a draft.
  const scheduleWithoutAutomaticWeakSubjectReviews = schedule.filter(
    (event) => !isAutomaticWeakSubjectReview(event),
  );
  const mentalState = getAuthoritativeMentalState(state, currentTime);
  const burnoutRisk = deriveBurnoutRiskFromState(
    state,
    assignments,
    currentTime,
    scheduleWithoutAutomaticWeakSubjectReviews,
  );
  if (mentalState.energyLevel === "low" || burnoutRisk > 5) {
    return scheduleWithoutAutomaticWeakSubjectReviews;
  }

  const scheduledMinutesByAssignment = new Map<string, number>();
  scheduleWithoutAutomaticWeakSubjectReviews.forEach((event) => {
    const assignment = resolveRelatedAssignmentForEvent(event, assignments);
    if (!assignment || event.type !== "study") return;
    scheduledMinutesByAssignment.set(
      assignment.id,
      (scheduledMinutesByAssignment.get(assignment.id) || 0) + getEventDurationMinutes(event),
    );
  });
  const higherPriorityWorkRemains = assignments.some((assignment) => {
    const requiredTodayMinutes = assignment.shouldFinishToday
      ? assignment.remainingMinutes || 0
      : assignment.recommendedTodayMinutes || 0;
    return (scheduledMinutesByAssignment.get(assignment.id) || 0) < requiredTodayMinutes;
  });
  if (higherPriorityWorkRemains) return scheduleWithoutAutomaticWeakSubjectReviews;

  const weakSubjects = state.grades
    .map((grade) => ({
      subject: grade.subject,
      average: calculateGradeAverage(grade),
      target: grade.targetAverage,
    }))
    .filter((grade) => grade.average < grade.target)
    .sort((a, b) => (a.average - a.target) - (b.average - b.target));
  if (!weakSubjects.length) return scheduleWithoutAutomaticWeakSubjectReviews;

  const maxBlocks = mentalState.energyLevel === "high" && mentalState.focusScore >= 7 && mentalState.stressLevel <= 4
    ? 2
    : 1;
  let nextSchedule = sortMissionSchedule(scheduleWithoutAutomaticWeakSubjectReviews);
  let addedBlocks = 0;

  for (const weakSubject of weakSubjects) {
    if (addedBlocks >= maxBlocks) break;
    const title = `Review ${weakSubject.subject} weak topics`;
    if (nextSchedule.some((event) => normalizeText(event.title).includes(normalizeText(weakSubject.subject)))) continue;

    const replaceable = nextSchedule.find((event) =>
      isReplaceableMissionBlock(event) &&
      new Date(event.endTime).getTime() > new Date(currentTime).getTime() &&
      getEventDurationMinutes(event) >= 30,
    );
    if (!replaceable) break;

    const start = new Date(Math.max(new Date(replaceable.startTime).getTime(), new Date(currentTime).getTime()));
    const durationMinutes = Math.min(35, Math.floor((new Date(replaceable.endTime).getTime() - start.getTime()) / 60000));
    if (durationMinutes < 30) continue;
    const end = addMinutes(start, durationMinutes);
    const before = new Date(replaceable.startTime).getTime() < start.getTime()
      ? [{ ...replaceable, id: `${replaceable.id}:before:${crypto.randomUUID()}`, endTime: start.toISOString() }]
      : [];
    const after = new Date(replaceable.endTime).getTime() > end.getTime()
      ? [{ ...replaceable, id: `${replaceable.id}:after:${crypto.randomUUID()}`, startTime: end.toISOString() }]
      : [];

    nextSchedule = sortMissionSchedule([
      ...nextSchedule.filter((event) => event.id !== replaceable.id),
      ...before,
      {
        id: `weak-subject:${crypto.randomUUID()}`,
        title,
        type: "study",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        priority: 2,
        createdAt: currentTime,
        source: "ai",
      },
      ...after,
    ]);
    addedBlocks += 1;
  }

  return nextSchedule;
}

function addHighEnergyPriorityWork(
  schedule: CalendarEvent[],
  fixedEvents: CalendarEvent[],
  assignments: MissionInputAssignment[],
  currentTime: string,
  targetMinutes: number,
) {
  let requiredMinutes = Math.max(0, targetMinutes - getStudyMinutes(schedule, fixedEvents));
  if (!requiredMinutes) return schedule;

  const candidates = [...assignments]
    .filter((assignment) => (assignment.remainingMinutes || 0) > 0)
    .sort((a, b) => scoreAssignmentForToday(b, currentTime) - scoreAssignmentForToday(a, currentTime));
  if (!candidates.length) return schedule;

  let nextSchedule = sortMissionSchedule(schedule);
  while (requiredMinutes >= 25) {
    const replaceable = nextSchedule.find((event) => {
      if (!isReplaceableMissionBlock(event)) return false;
      if (new Date(event.endTime).getTime() <= new Date(currentTime).getTime()) return false;
      return getEventDurationMinutes(event) >= 25;
    });
    if (!replaceable) break;

    const scheduledByAssignment = new Map<string, number>();
    nextSchedule.forEach((event) => {
      const relatedAssignment = resolveRelatedAssignmentForEvent(event, candidates);
      if (!relatedAssignment || event.type !== "study") return;
      scheduledByAssignment.set(
        relatedAssignment.id,
        (scheduledByAssignment.get(relatedAssignment.id) || 0) + getEventDurationMinutes(event),
      );
    });
    const assignment = [...candidates]
      .filter((candidate) =>
        candidate.planningStyle === "assessment-prep" ||
        (scheduledByAssignment.get(candidate.id) || 0) < (candidate.remainingMinutes || 0),
      )
      .sort((a, b) => {
        const aExtraPrep = a.planningStyle === "assessment-prep" && (scheduledByAssignment.get(a.id) || 0) >= (a.remainingMinutes || 0);
        const bExtraPrep = b.planningStyle === "assessment-prep" && (scheduledByAssignment.get(b.id) || 0) >= (b.remainingMinutes || 0);
        const aScore = scoreAssignmentForToday(a, currentTime) - (aExtraPrep ? 1000 : 0);
        const bScore = scoreAssignmentForToday(b, currentTime) - (bExtraPrep ? 1000 : 0);
        return bScore - aScore;
      })
      .at(0);
    if (!assignment) break;
    const blockLimit = assignment.planningStyle === "assessment-prep"
      ? Math.max(25, Math.min(75, assignment.suggestedStudyBlockMinutes || 60))
      : Math.max(25, Math.min(75, assignment.preferredWorkBlockMinutes || 60));
    const replaceableStart = new Date(replaceable.startTime);
    const start = new Date(Math.max(replaceableStart.getTime(), new Date(currentTime).getTime()));
    const availableMinutes = Math.floor((new Date(replaceable.endTime).getTime() - start.getTime()) / 60000);
    const trackedWorkRemainingMinutes = assignment.planningStyle === "assessment-prep"
      ? Number.POSITIVE_INFINITY
      : Math.max(0, (assignment.remainingMinutes || 0) - (scheduledByAssignment.get(assignment.id) || 0));
    const durationMinutes = Math.min(requiredMinutes, blockLimit, availableMinutes, trackedWorkRemainingMinutes);
    if (durationMinutes < 25) {
      nextSchedule = nextSchedule.filter((event) => event.id !== replaceable.id);
      continue;
    }

    const end = addMinutes(start, durationMinutes);
    const before = replaceableStart.getTime() < start.getTime()
      ? [{ ...replaceable, id: `${replaceable.id}:before:${crypto.randomUUID()}`, endTime: start.toISOString() }]
      : [];
    const after = new Date(replaceable.endTime).getTime() > end.getTime()
      ? [{ ...replaceable, id: `${replaceable.id}:after:${crypto.randomUUID()}`, startTime: end.toISOString() }]
      : [];
    const studyEvent = buildStudyEvent(
      assignment,
      start,
      durationMinutes,
      assignment.planningStyle === "assessment-prep" ? "Prepare for" : "Work on",
      currentTime,
      Math.max(8, Math.min(10, Math.round(scoreAssignmentForToday(assignment, currentTime) / 20))),
    );

    nextSchedule = sortMissionSchedule([
      ...nextSchedule.filter((event) => event.id !== replaceable.id),
      ...before,
      studyEvent,
      ...after,
    ]);
    requiredMinutes -= durationMinutes;
  }

  return nextSchedule;
}

function toManualMissionBlock(event: CalendarEvent) {
  return {
    id: event.id,
    title: event.title,
    type: event.type,
    startTime: event.startTime,
    endTime: event.endTime,
    relatedAssignmentId: event.relatedAssignmentId,
  };
}

function upsertDailyPlanManualBlock(
  plan: StudentState["dailyMissionPlan"],
  event: CalendarEvent,
  currentTime: string,
) {
  if (!plan || plan.date !== currentTime.slice(0, 10)) {
    return plan;
  }

  const nextBlock = toManualMissionBlock(event);
  const manualBlocks = Array.isArray(plan.manualBlocks) ? [...plan.manualBlocks] : [];
  const signature = calendarEventSignature(event);
  const existingIndex = manualBlocks.findIndex((block) =>
    calendarEventSignature({
      title: block.title,
      type: block.type,
      startTime: block.startTime,
      endTime: block.endTime,
    }) === signature ||
    block.id === event.id,
  );

  if (existingIndex >= 0) {
    manualBlocks[existingIndex] = {
      ...manualBlocks[existingIndex],
      ...nextBlock,
    };
  } else {
    manualBlocks.push(nextBlock);
  }

  return {
    ...plan,
    manualBlocks,
    updatedAt: new Date().toISOString(),
  };
}

function removeDailyPlanManualBlock(
  plan: StudentState["dailyMissionPlan"],
  eventId: string,
  currentTime: string,
) {
  if (!plan || plan.date !== currentTime.slice(0, 10) || !Array.isArray(plan.manualBlocks)) {
    return {
      plan,
      removedCalendarEventId: null as string | null,
      removed: false,
    };
  }

  const target = plan.manualBlocks.find((block) => block.id === eventId || block.calendarEventId === eventId);
  if (!target) {
    return {
      plan,
      removedCalendarEventId: null as string | null,
      removed: false,
    };
  }

  return {
    plan: {
      ...plan,
      manualBlocks: plan.manualBlocks.filter((block) => block.id !== target.id),
      updatedAt: new Date().toISOString(),
    },
    removedCalendarEventId: target.calendarEventId || null,
    removed: true,
  };
}

function shouldKeepUnderlyingMissionSource(event: CalendarEvent | undefined) {
  if (!event) return true;
  if (event.id.startsWith("manual-block:")) return false;
  if (event.id.startsWith("daily-plan:")) return true;
  if (event.source === "ai") return false;
  if (event.fixed === false) return false;
  return true;
}

function pruneRedundantBreaks(schedule: CalendarEvent[]) {
  const ordered = sortMissionSchedule(schedule);
  const cleaned: CalendarEvent[] = [];

  for (const [index, event] of ordered.entries()) {
    if (event.type !== "break") {
      cleaned.push(event);
      continue;
    }

    const breakStart = new Date(event.startTime).getTime();
    const breakEnd = new Date(event.endTime).getTime();
    const previousNonBreak = [...ordered.slice(0, index)].reverse().find((candidate) => candidate.type !== "break");

    if (!previousNonBreak || previousNonBreak.type !== "study") {
      continue;
    }

    const previousEnd = new Date(previousNonBreak.endTime).getTime();
    const gapFromStudy = breakStart - previousEnd;
    if (gapFromStudy < 0 || gapFromStudy > 20 * 60 * 1000) {
      continue;
    }

    const overlapsNonBreak = ordered.some((candidate, candidateIndex) => {
      if (candidateIndex === index || candidate.type === "break") return false;

      const candidateStart = new Date(candidate.startTime).getTime();
      const candidateEnd = new Date(candidate.endTime).getTime();
      return candidateStart < breakEnd && candidateEnd > breakStart;
    });

    if (overlapsNonBreak) {
      continue;
    }

    cleaned.push(event);
  }

  return cleaned;
}

function adaptMissionForEnergy(
  mission: Mission,
  fixedEvents: CalendarEvent[],
  assignments: MissionInputAssignment[],
  energyMode: EnergyMode,
  mentalState?: ReturnType<typeof getAuthoritativeMentalState>,
) {
  if (energyMode === "normal") return mission;

  const fixedIds = new Set(fixedEvents.map((event) => event.id));
  const fixedTitles = new Set(fixedEvents.map((event) => event.title.trim().toLowerCase()));
  const currentStudyEvents = mission.schedule
    .filter((event) => event.type === "study" && !fixedIds.has(event.id) && !fixedTitles.has(event.title.trim().toLowerCase()))
    .sort((a, b) => b.priority - a.priority);

  if (energyMode === "recovery") {
    const reducedStudyEvents = currentStudyEvents.slice(0, 1).map((event) => {
      const start = new Date(event.startTime);
      const originalEnd = new Date(event.endTime);
      const originalMinutes = Math.max(15, Math.round((originalEnd.getTime() - start.getTime()) / 60000));
      const reducedMinutes = Math.min(25, Math.max(15, Math.ceil(originalMinutes / 2)));

      return {
        ...event,
        title: event.title.includes("recovery pace") ? event.title : `${event.title} (recovery pace)`,
        endTime: addMinutes(start, reducedMinutes).toISOString(),
        priority: Math.max(event.priority, 8),
      };
    });
    const recoveryStart = reducedStudyEvents.length
      ? new Date(reducedStudyEvents[0].endTime)
      : addMinutes(new Date(mission.currentTime), 10);
    const recoveryBlocks = [buildRecoveryBreak(recoveryStart, reducedStudyEvents.length ? 30 : 45, mission.createdAt)];

    mission.energyLevel = "low";
    mission.focusScore = Math.min(mission.focusScore, 4);
    mission.burnoutRisk = Math.max(mission.burnoutRisk, 7);
    mission.summary = reducedStudyEvents.length
      ? "Recovery mode applied. AcademicOS kept only the most important work, shortened it, and added protected recovery time."
      : "Recovery mode applied. AcademicOS protected rest because there is no specific academic task available to schedule.";
    mission.schedule = [
      ...fixedEvents,
      ...reducedStudyEvents,
      ...recoveryBlocks.filter((event) => !overlapsFixedEvent(new Date(event.startTime), new Date(event.endTime), fixedEvents)),
    ].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  if (energyMode === "high-output") {
    const scheduledAssignmentIds = new Set(
      currentStudyEvents
        .map((event) => event.relatedAssignmentId)
        .filter(Boolean)
    );
    const nextAssignment = assignments.find((assignment) => !scheduledAssignmentIds.has(assignment.id));
    const expandedStudyEvents = currentStudyEvents.map((event) => {
      const start = new Date(event.startTime);
      const originalEnd = new Date(event.endTime);
      const originalMinutes = Math.max(25, Math.round((originalEnd.getTime() - start.getTime()) / 60000));
      const expandedMinutes = Math.min(75, Math.max(40, Math.ceil(originalMinutes * 1.25)));

      return {
        ...event,
        title: event.title.includes("deep work") ? event.title : `${event.title} (deep work)`,
        endTime: addMinutes(start, expandedMinutes).toISOString(),
        priority: Math.max(event.priority, 8),
      };
    });
    const retainedNonStudyEvents = mission.schedule.filter(
      (event) => !fixedIds.has(event.id) && event.type !== "study",
    );
    const highEnergyTargetMinutes = mentalState && mentalState.focusScore >= 8 && mentalState.stressLevel <= 3
      ? 180
      : 120;

    mission.energyLevel = "high";
    mission.focusScore = Math.max(mission.focusScore, 8);
    mission.burnoutRisk = Math.min(mission.burnoutRisk, 4);
    mission.summary = nextAssignment
      ? "High-output mode applied. AcademicOS extended focused work and added one get-ahead block so future low-energy days can be lighter."
      : "High-output mode applied. AcademicOS extended today's focused work without inventing extra assignments.";
    mission.schedule = addHighEnergyPriorityWork([
      ...fixedEvents,
      ...retainedNonStudyEvents,
      ...expandedStudyEvents,
    ], fixedEvents, assignments, mission.currentTime, highEnergyTargetMinutes);
  }

  const lastEvent = mission.schedule[mission.schedule.length - 1];
  mission.expectedFinishTime = lastEvent?.endTime || mission.currentTime;

  return mission;
}

function applyAuthoritativeMentalState(
  mission: Mission,
  state: StudentState,
  assignments: MissionInputAssignment[],
  currentTime: string,
) {
  const manualMentalState = getAuthoritativeMentalState(state, currentTime);

  mission.energyLevel = manualMentalState.energyLevel;
  mission.focusScore = manualMentalState.focusScore;
  mission.burnoutRisk = deriveBurnoutRiskFromState(state, assignments, currentTime, mission.schedule || []);

  return mission;
}

function emptyMission(currentTime: string, summary: string): Mission {
  return {
    id: crypto.randomUUID(),
    createdAt: currentTime,
    currentTime,
    energyLevel: "medium",
    focusScore: 5,
    burnoutRisk: 1,
    expectedFinishTime: currentTime,
    summary,
    schedule: [],
  };
}

function isCompleteMissionResponse(value: Mission | null): value is Mission {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.summary === "string" &&
      Array.isArray(value.schedule),
  );
}

export async function POST(req: Request) {
  let fallbackCurrentTime = new Date().toISOString();

  try {
    const { input, currentTime, timeZone, mode, action, eventId } = await req.json();
    fallbackCurrentTime = currentTime || fallbackCurrentTime;
    let state = getState();
    const requestMode = typeof mode === "string" ? mode : "replan";
    const manualMentalState = getAuthoritativeMentalState(state, fallbackCurrentTime);
    const energyMode = manualMentalState.energyMode;
    const hiddenMissionEventIds = new Set(state.missionHiddenEventIds || []);

    if (action === "delete-mission-item" || action === "hide-mission-item") {
      if (!eventId || typeof eventId !== "string") {
        return Response.json({ error: "Missing mission item id." }, { status: 400 });
      }

      let blockedRemovalMessage = "";
      const updated = updateState((state) => {
        const hiddenIds = new Set(state.missionHiddenEventIds || []);
        const suppressedAssignmentIds = getActiveMissionSuppressedAssignmentIds(
          state,
          state.currentMission?.currentTime || fallbackCurrentTime,
        );
        const removedEvent =
          state.currentMission?.schedule?.find((event) => event.id === eventId) ||
          state.calendar.find((event) => event.id === eventId);
        const keepUnderlyingSource = shouldKeepUnderlyingMissionSource(removedEvent);
        const currentTime = state.currentMission?.currentTime || fallbackCurrentTime;
        const formattedAssignments = state.assignments
          .filter((assignment) => !assignment.completed)
          .map((assignment) => formatMissionAssignment({
            id: assignment.id,
            title: assignment.title,
            course: assignment.course,
            subject: assignment.subject,
            assessmentType: assignment.assessmentType,
            dueDate: assignment.dueDate,
            priority: assignment.priority,
            estimatedMinutes: assignment.estimatedMinutes,
            progressPercent: assignment.progress?.percentComplete,
            studyMinutesCompleted: assignment.progress?.studyMinutesCompleted,
            notes: assignment.notes,
          }, currentTime, state));
        const removedAssignment = removedEvent
          ? resolveRelatedAssignmentForEvent(removedEvent, formattedAssignments)
          : null;
        const manualBlockRemoval = removeDailyPlanManualBlock(state.dailyMissionPlan, eventId, currentTime);
        const protectedTrackedWorkRemoval = Boolean(
          removedAssignment &&
          removedAssignment.planningStyle === "tracked-work" &&
          removedAssignment.shouldFinishToday,
        );

        if (protectedTrackedWorkRemoval && removedAssignment && state.currentMission) {
          blockedRemovalMessage = `${removedAssignment.title} is due by ${removedAssignment.dueDate} and still needs to be finished today, so AcademicOS kept it on the mission. Mark it complete or change its due date if it should leave today's plan.`;
          return {
            ...state,
            currentMission: sortMission({
              ...state.currentMission,
              summary: blockedRemovalMessage,
              reason: `Protected mission item kept: ${removedAssignment.title}`,
            }),
          };
        }

        if (keepUnderlyingSource) {
          hiddenIds.add(eventId);
        }
        if (removedAssignment?.id) {
          suppressedAssignmentIds.add(removedAssignment.id);
        }

        const remainingSchedule = removeGenericAiPlaceholders(
          (state.currentMission?.schedule || []).filter((event) => event.id !== eventId),
        );
        const replacementAssignment = removedEvent
          ? pickReplacementAssignment(formattedAssignments, remainingSchedule, currentTime, suppressedAssignmentIds)
          : null;
        const replacementEvent =
          removedEvent && replacementAssignment
            ? buildAssignmentReplacementEvent(replacementAssignment, removedEvent, currentTime)
            : null;
        const nextSchedule = sortMissionSchedule(
          replacementEvent ? [...remainingSchedule, replacementEvent] : remainingSchedule,
        );
        const { planningDayKey, planningStart, planningEnd, planningOffsetMinutes } = getPlanningWindow(currentTime);
        const sealedSchedule = closeMissionScheduleGaps(
          constrainScheduleToPlanningDay(
            nextSchedule,
            planningStart,
            planningEnd,
            planningDayKey,
            planningOffsetMinutes,
          ),
          planningStart,
          planningEnd,
          currentTime,
        );
        const retainedAiIds = new Set(
          sealedSchedule.filter((event) => event.source === "ai").map((event) => event.id),
        );

        return {
          ...state,
          dailyMissionPlan: manualBlockRemoval.plan,
          missionHiddenEventTitles: [],
          missionHiddenEventIds: [...hiddenIds],
          missionSuppressedAssignmentIds: [...suppressedAssignmentIds],
          calendar: keepUnderlyingSource
            ? state.calendar.filter(
                (event) =>
                  event.id !== manualBlockRemoval.removedCalendarEventId &&
                  (event.source !== "ai" || retainedAiIds.has(event.id)),
              )
            : state.calendar.filter(
                (event) =>
                  event.id !== eventId &&
                  event.id !== manualBlockRemoval.removedCalendarEventId &&
                  (event.source !== "ai" || retainedAiIds.has(event.id)),
              ),
          currentMission: state.currentMission
            ? sortMission({
                ...state.currentMission,
                summary: replacementEvent
                  ? `AcademicOS replaced the removed block with ${replacementEvent.title} based on upcoming work.`
                  : "AcademicOS removed the selected block and rebalanced the rest of today.",
                reason: replacementEvent
                  ? `Replaced removed item with ${replacementEvent.title}`
                  : "Removed selected mission item",
                schedule: sealedSchedule,
              })
            : state.currentMission,
        };
      });

      return Response.json(
        updated.currentMission ||
          emptyMission(
            fallbackCurrentTime,
            "Removed the selected item from the mission plan.",
          ),
      );
    }

    const { planningDayKey, planningStart, planningEnd, planningOffsetMinutes, fixedEvents: fixedCalendar } =
      buildFixedMissionScheduleForDay(state, currentTime);

    if (requestMode === "quick-update" && state.currentMission) {
      const suppressedAssignmentIds = getActiveMissionSuppressedAssignmentIds(state, currentTime);
      const schoolSkippedToday =
        state.dailyMissionPlan?.date === currentTime.slice(0, 10) &&
        state.dailyMissionPlan?.schoolMode === "skip";
      const currentMissionSchedule = mergeQuickUpdateSourceSchedules(
        fixedCalendar,
        state.currentMission.schedule || [],
        planningDayKey,
        planningStart,
        planningEnd,
        planningOffsetMinutes,
      )
        .filter((event) => event.type !== "break")
        .filter((event) => !(schoolSkippedToday && isSchoolDayBaselineEvent(event)))
        .filter((event) => !hiddenMissionEventIds.has(event.id));
      const quickUpdateTitle = normalizeText(extractQuickUpdateTitle(input || ""));
      const duplicateQuickUpdate = currentMissionSchedule.some(
        (event) =>
          event.source === "ai" &&
          normalizeText(event.title) === quickUpdateTitle,
      );

      if (duplicateQuickUpdate) {
        const sealedSchedule = closeMissionScheduleGaps(
          constrainScheduleToPlanningDay(
            currentMissionSchedule.filter((event) => event.type !== "break"),
            planningStart,
            planningEnd,
            planningDayKey,
            planningOffsetMinutes,
          ),
          planningStart,
          planningEnd,
          currentTime,
        );
        const sanitizedMission = sortMission({
          ...state.currentMission,
          currentTime,
          schedule: sealedSchedule,
          summary: "AcademicOS kept today's plan and removed redundant break blocks.",
          reason: "Quick update matched an existing mission item.",
        });

        updateState((state) => ({
          ...state,
          currentMission: sanitizedMission,
        }));

        return Response.json(sanitizedMission);
      }

      const amended = applyQuickUpdateToSchedule(
        currentMissionSchedule,
        input || "",
        currentTime,
        planningStart,
        planningEnd,
        planningDayKey,
        planningOffsetMinutes,
        state.assignments
          .filter((assignment) => !assignment.completed)
          .map((assignment) => formatMissionAssignment({
            id: assignment.id,
            title: assignment.title,
            course: assignment.course,
            subject: assignment.subject,
            assessmentType: assignment.assessmentType,
            dueDate: assignment.dueDate,
            priority: assignment.priority,
            estimatedMinutes: assignment.estimatedMinutes,
            progressPercent: assignment.progress?.percentComplete,
            studyMinutesCompleted: assignment.progress?.studyMinutesCompleted,
            notes: assignment.notes,
          }, currentTime, state)),
        suppressedAssignmentIds,
      );

      const baseMission = sortMission({
        ...(state.currentMission || emptyMission(currentTime, "Quick update")),
        currentTime,
        schedule: closeMissionScheduleGaps(
          constrainScheduleToPlanningDay(
            pruneRedundantBreaks(amended.schedule),
            planningStart,
            planningEnd,
            planningDayKey,
            planningOffsetMinutes,
          ),
          planningStart,
          planningEnd,
          currentTime,
        ),
      });

      const quickAssignments = state.assignments
        .filter((assignment) => !assignment.completed)
        .map((assignment) => formatMissionAssignment({
          id: assignment.id,
          title: assignment.title,
          course: assignment.course,
          subject: assignment.subject,
          assessmentType: assignment.assessmentType,
          dueDate: assignment.dueDate,
          priority: assignment.priority,
          estimatedMinutes: assignment.estimatedMinutes,
          progressPercent: assignment.progress?.percentComplete,
          studyMinutesCompleted: assignment.progress?.studyMinutesCompleted,
          notes: assignment.notes,
        }, currentTime, state));
      const quickUpdateSchedule = energyMode === "high-output"
        ? addHighEnergyPriorityWork(
            baseMission.schedule,
            fixedCalendar,
            quickAssignments,
            currentTime,
            manualMentalState.focusScore >= 8 && manualMentalState.stressLevel <= 3 ? 180 : 120,
          )
        : baseMission.schedule;
      const quickUpdateWithOptionalWeakSubjectReview = addWeakSubjectStudyBlocks(
        enforceAssignmentTimeBudgets(quickUpdateSchedule, quickAssignments),
        quickAssignments,
        state,
        currentTime,
      );
      const budgetedQuickUpdateSchedule = closeMissionScheduleGaps(
        constrainScheduleToPlanningDay(
          quickUpdateWithOptionalWeakSubjectReview,
          planningStart,
          planningEnd,
          planningDayKey,
          planningOffsetMinutes,
        ),
        planningStart,
        planningEnd,
        currentTime,
      );

      const finalMission = applyAuthoritativeMentalState({
        ...baseMission,
        schedule: budgetedQuickUpdateSchedule,
        expectedFinishTime: budgetedQuickUpdateSchedule.at(-1)?.endTime || baseMission.currentTime,
        summary: amended.inserted
          ? `AcademicOS kept today's plan, preserved fixed events, and added ${amended.inserted.title}.`
          : "AcademicOS kept today's existing mission plan.",
        reason: amended.inserted
          ? `Quick update added: ${amended.inserted.title}`
          : "Quick update kept the existing mission plan.",
      }, state, quickAssignments, currentTime);

      updateState((state) => {
        const nextSuppressedAssignmentIds = getActiveMissionSuppressedAssignmentIds(state, currentTime);
        if (amended.inserted?.title) {
          const insertedAssignment = resolveRelatedAssignmentForEvent(
            {
              id: "quick-update-inserted",
              title: amended.inserted.title,
              type: "study",
              startTime: amended.inserted.startTime,
              endTime: amended.inserted.endTime,
              priority: 1,
              createdAt: currentTime,
              source: "ai",
            },
            state.assignments
              .filter((assignment) => !assignment.completed)
              .map((assignment) => formatMissionAssignment({
                id: assignment.id,
                title: assignment.title,
                course: assignment.course,
                subject: assignment.subject,
                assessmentType: assignment.assessmentType,
                dueDate: assignment.dueDate,
                priority: assignment.priority,
                estimatedMinutes: assignment.estimatedMinutes,
                progressPercent: assignment.progress?.percentComplete,
                studyMinutesCompleted: assignment.progress?.studyMinutesCompleted,
                notes: assignment.notes,
              }, currentTime, state)),
          );
          if (insertedAssignment?.id) {
            nextSuppressedAssignmentIds.delete(insertedAssignment.id);
          }
        }
        const filteredCalendar = state.calendar.filter((event) => event.source !== "ai");
        const existingAiEvents = state.calendar.filter((event) => event.source === "ai");
        const existingById = new Map(existingAiEvents.map((event) => [event.id, event] as const));
        const existingBySignature = new Map(
          existingAiEvents.map((event) => [calendarEventSignature(event), event] as const),
        );

        const aiEvents = (finalMission.schedule || [])
          .filter((event) => !event.id.startsWith("manual-block:"))
          .filter((event) => !fixedCalendar.some((fixed) => isSameFixedEvent(event, fixed)))
          .map((event) => {
            const existing = existingById.get(event.id) || existingBySignature.get(calendarEventSignature(event));

            return {
              ...event,
              source: "ai" as const,
              externalId: existing?.externalId,
              missionId: finalMission.id,
              createdAt: existing?.createdAt || event.createdAt,
            };
          });

        return {
          ...state,
          dailyMissionPlan: amended.inserted
            ? upsertDailyPlanManualBlock(state.dailyMissionPlan, amended.inserted, currentTime)
            : state.dailyMissionPlan,
          currentMission: finalMission,
          missionHistory: state.currentMission
            ? [...state.missionHistory, state.currentMission].slice(-20)
            : state.missionHistory,
          missionSuppressedAssignmentIds: [...nextSuppressedAssignmentIds],
          status: {
            ...state.status,
            currentTime,
            burnoutRisk: finalMission.burnoutRisk,
          },
          calendar: [...filteredCalendar, ...aiEvents],
        };
      });

      return Response.json(finalMission);
    }

    let removals: string[] = [];

    if (requestMode !== "quick-update") {
      const deletion = await createAiCompletion({
        stage: "deletion",
        maxTokens: AI_OUTPUT_TOKEN_LIMITS.deletion,
        messages: [
          {
            role: "system",
            content: `
You detect whether the user is asking to remove calendar events.

Return ONLY valid JSON.

If the user asks to remove, delete, cancel, clear, or get rid of an event, return:
{
  "removeEvents": ["event title or keyword"]
}

If the user is not asking to remove an event, return:
{
  "removeEvents": []
}

Rules:
- Extract the shortest useful event title or keyword.
- "remove soccer" returns ["soccer"].
- "get rid of biology class" returns ["biology class"].
- Do not include study recommendations here.
            `
          },
          {
            role: "user",
            content: input || "",
          },
        ],
      });
      const deletionResult = parseAiJson<DeletionResult>(
        deletion.choices[0].message.content,
        {}
      );
      removals = deletionResult.removeEvents || [];
    }

    if (removals.length) {
      let removedCount = 0;
      const updated = updateState((state) => {
        const hiddenIds = new Set(state.missionHiddenEventIds || []);
        const sourceEvents = state.currentMission?.schedule?.length ? state.currentMission.schedule : state.calendar;
        const matchedEvents = sourceEvents.filter((event) =>
          removals.some((title) => normalizeText(event.title).includes(normalizeText(title)))
        );

        matchedEvents.forEach((event) => {
          hiddenIds.add(event.id);
        });
        removedCount = matchedEvents.length;

        return {
          ...state,
          missionHiddenEventTitles: [],
          missionHiddenEventIds: [...hiddenIds],
          currentMission: state.currentMission
            ? sortMission({
                ...state.currentMission,
                schedule: state.currentMission.schedule.filter((event) => !hiddenIds.has(event.id)),
              })
            : state.currentMission,
        };
      });

      return Response.json(
        updated.currentMission ||
          emptyMission(
            currentTime,
            removedCount
              ? `Removed ${removedCount} matching item${removedCount === 1 ? "" : "s"} from your mission plan.`
              : "I could not find a matching item to remove from the mission."
          ),
      );
    }

    const extraction = await createAiCompletion({
      stage: "extraction",
      maxTokens: AI_OUTPUT_TOKEN_LIMITS.extraction,
      messages: [
        {
          role: "system",
          content: `
    You extract calendar events from student messages.

Return ONLY valid JSON.

Rules:
- Detect any event the user mentions.
- If the user gives a time, that time is FIXED.
- Never guess a different time.
- Convert times into ISO format using the provided current date.
- Preserve the user's local timezone offset in returned ISO strings.
- If the user says "6pm", return 18:00 in the user's local timezone, not 18:00 UTC.
- "6pm" means 18:00.
- "7:30pm" means 19:30.
- If no end time is provided, assume 1 hour duration.

Current date/time:
${currentTime}

User timezone:
${timeZone || "local timezone"}

Return exactly:

{
  "calendarEvents": [
    {
      "title": "string",
      "type": "personal | school | study | break",
      "startTime": "ISO string",
      "endTime": "ISO string"
    }
  ]
}

If no event exists:

{
  "calendarEvents": []
}
    `
        },
        {
          role: "user",
          content: JSON.stringify({
            input,
            currentTime,
            timeZone
          })
        }
      ]
    });
    const extracted = parseAiJson<ExtractionResult>(
      extraction.choices[0].message.content,
      {}
    );
    const extractedEvents = extracted.calendarEvents || [];

    if (extractedEvents.length) {
      updateState((state) => ({
        ...state,
    
        calendar: [
          // remove old manual events with same title
          ...state.calendar.filter(
            event =>
              !extractedEvents.some(
                (newEvent) =>
                  event.title.toLowerCase() === newEvent.title.toLowerCase() &&
                  event.source === "manual"
              )
          ),
    
          // add new extracted events
          ...extractedEvents.map((e) => ({
            id: crypto.randomUUID(),
            title: e.title,
            type: e.type,
            startTime: e.startTime,
            endTime: e.endTime,
            priority: 1,
            createdAt: new Date().toISOString(),
            source: "manual" as const,
            fixed: true,
          })),
        ],
      }));
    
      state = getState();
    }

    state = updateState((currentState) => ({
      ...currentState,
      status: {
        ...currentState.status,
        currentTime,
      },
    }));

    const intelligence = buildAcademicIntelligenceSnapshot(state, currentTime);
    const suppressedAssignmentIds = getActiveMissionSuppressedAssignmentIds(state, currentTime);
    const missionAssignments = getUpcomingMissionAssignments(
      state.assignments
      .filter((a) => !a.completed)
      .filter((assignment) => !isPlaceholderAssignment({
        title: assignment.title,
        course: assignment.course,
        subject: assignment.subject,
        notes: assignment.notes,
      }))
      .map((a) => formatMissionAssignment({
        id: a.id,
        title: a.title,
        course: a.course,
        subject: a.subject,
        assessmentType: a.assessmentType,
        dueDate: a.dueDate,
        priority: a.priority,
        estimatedMinutes: a.estimatedMinutes,
        progressPercent: a.progress?.percentComplete,
        studyMinutesCompleted: a.progress?.studyMinutesCompleted,
        notes: a.notes,
      }, currentTime, state)),
      currentTime,
      14,
      suppressedAssignmentIds,
    )
      .slice(0, 6);
    const hasAcademicMaterial = missionAssignments.length > 0 || state.documents.length > 0;
    const missionDocuments = state.documents.map(document => ({
      title: document.title,
      type: document.type,
      subject: document.subject,
      tags: document.tags,
    }));

    const completion = await createAiCompletion({
      stage: "mission",
      maxTokens: AI_OUTPUT_TOKEN_LIMITS.mission,
      messages: [
        {
          role: "system",
          content: `
You are AcademicOS, a personal student planning AI.

The current date and time is:
${currentTime}

The user's timezone is:
${timeZone || "local timezone"}

Always assume this is the user's real current time.

All times in the response must preserve the user's local timezone offset.

Your job is to build the BEST possible schedule from the current time until the user finishes their day.

This plan is for today only.
Do not schedule anything before 6:00 AM local time.
Do not schedule anything after the end of today.
If a block would land outside today's window, move it into the nearest valid open slot today.

The calendar contains EXISTING events.

These events are already scheduled.

You MUST treat every calendar event as FIXED.

Never move them.

Never change their times.

Never overlap them.

Study sessions and breaks must be scheduled around them only when there is a real assignment, subject, document, or confirmed academic task to work on.

If a calendar event starts at 6:00 PM, it MUST appear in the mission schedule beginning at exactly 6:00 PM.

The returned schedule MUST include every calendar event exactly as provided.

You MUST follow these rules:

1. Only use information explicitly provided by the user.
2. Do NOT invent assignments, subjects, tests, or deadlines.
3. If information is missing, do NOT create a general productivity plan. Return an empty schedule except for fixed calendar events, and use the summary to say what information AcademicOS needs.
4. Never schedule anything before the current time.
5. Prioritize:
   - grades
   - upcoming deadlines
   - mental health
   - workload balance
   - improvement in weak subjects
6. Include breaks when appropriate.
7. Output ONLY valid JSON in this exact format:

{
  "id": "string",
  "createdAt": "string",
  "currentTime": "string",

  "energyLevel": "low | medium | high",
  "focusScore": 1,
  "burnoutRisk": 1,
  "expectedFinishTime": "string",
  "summary": "string",

  "schedule": [
    {
      "id": "string",
      "title": "string",
      "type": "study | break | school | personal",
      "startTime": "string (ISO format)",
      "endTime": "string (ISO format)",
      "priority": 1
    }
  ]
}
8. You must schedule tasks sequentially starting from currentTime.
9. Every event MUST have valid startTime and endTime in ISO format.
10. Events must NOT overlap.
11. You must always move forward in time (no backward scheduling).
12. Include realistic breaks only between real scheduled work blocks.
13. If you cannot fit a task into the remaining day, do NOT include it.
14. When extracting events from user input:
- Always detect explicit times (e.g. 19:30, 7pm, tomorrow at 3)
- Treat them as fixed calendar events
- Do not optimize over them
15. If the user mentions a specific time for an event, you MUST:
1. Insert it exactly at that time
2. NEVER move it
3. NEVER reschedule it
4. NEVER approximate it
5. NEVER ignore it

16. Fixed calendar events provided in the calendar data are already confirmed.
You may schedule around them, but you cannot modify their title, startTime, or endTime.

17. Use academicIntelligence to reduce decisions for the student.
If it contains deadline risk, weak subject, or burnout risk signals, the mission should reflect them.

17.5. The user's energyLevel, focusScore, and stressLevel are already set manually outside the AI.
They are authoritative.
Do not reinterpret them.
Do not raise or lower them.
Build the schedule around them.
Burnout risk should reflect those manual values plus workload pressure.

18. Never create vague blocks like "Study", "Study time", "Focus time", "Homework", or "Productivity".
Every study block must name the exact assignment, course, document, or subject being studied and say how long it lasts.

19. Do not invent scheduled events, classes, practices, errands, tests, or appointments. Only include fixed events from existingCalendar or events explicitly extracted from the current user input.

20. If assignments is empty and documents is empty, do not create study blocks.

21. If you recommend studying, the title must be specific, such as "Work on English Essay draft" or "Review Biology Chapter 5 notes", never just "Study".

22. Each assignment includes planning metadata:
- planningStyle = "tracked-work" means there is finishable work left
- remainingMinutes tells you how much tracked work is left
- shouldFinishToday = true means the assignment must be fully completed today
- recommendedTodayMinutes is how much tracked work belongs today
- preferredWorkBlockMinutes is the preferred size of one tracked-work block
- planningStyle = "assessment-prep" means this is test or quiz preparation, not finishable task progress
- recommendedTodayMinutes is how much total prep time belongs today
- suggestedStudyBlockMinutes is the preferred size of one prep block
- recommendedBlockCount is the maximum number of prep blocks that item should get today
- minimumStudyBlockMinutes and maximumStudyBlockMinutes are hard guardrails for one focused work block

23. For tracked-work assignments with shouldFinishToday = true, schedule the full remainingMinutes today, either in one block or multiple blocks.

24. For tracked-work assignments with shouldFinishToday = false, keep the total work you schedule today close to recommendedTodayMinutes, use no more than recommendedBlockCount blocks, and keep block sizes close to preferredWorkBlockMinutes.

24.5. Tracked-work means assignments, homework, and projects. Their total scheduled minutes must never exceed remainingMinutes. Once that amount is scheduled, choose another real assignment or leave the time as non-work; never add another block for the completed tracked work.

25. For assessment-prep items, the user's estimatedMinutes is the TOTAL prep target across multiple days, not one session.

26. For assessment-prep items, keep the total study time you schedule today close to recommendedTodayMinutes, split into no more than recommendedBlockCount blocks, and keep each block between minimumStudyBlockMinutes and maximumStudyBlockMinutes.

27. Do not front-load the entire prep target into one day unless the test is due today or tomorrow and the metadata clearly allows it.

27.5. Tests and quizzes are assessment-prep, not finishable tracked work. Their estimatedMinutes is a study target, not a hard maximum. You may schedule extra preparation after that target, but only after all unfinished assignments, homework, and projects with meaningful priority have been considered. Extra prep beyond the target is low priority.

27.75. A course below its target average may receive a specific low-priority review block only when every provided assignment, homework, project, test, and quiz has its required work for today scheduled. Use genuinely spare time only, never displace real deadline work, and only when the manual energy level is medium or high and burnout risk permits it. Name the exact course, such as "Review Chemistry weak topics"; never use a vague study block.

28. When the user asks generally to "work on an assignment", "do homework", or "work on a project", choose the assignment with the strongest combination of urgency, priority, and remaining work. Do not choose a low-value task over a more urgent due-soon task.

29. If the user says they are tired, exhausted, stressed, overwhelmed, or low energy, you must change the actual schedule:
- reduce workload
- keep only the most important academic work
- shorten study sessions to 15-25 minutes
- add recovery breaks
- do not merely tell the user to consider managing time

30. If the user says they have high energy, feel productive, motivated, locked in, or can do more, you must change the actual schedule:
- extend useful study blocks when they are tied to real assignments/documents
- optionally add one get-ahead task from assignments due later
- do not invent any work
- preserve future sustainability by not overloading the day

31. Required work comes before optional get-ahead work. First make overdue work safe, protect work due soon, prepare upcoming tests, make reasonable progress on large assignments, and provide any eligible weak-subject review. Only then look ahead up to roughly two weeks for real known tests, large assignments/projects, weaker subjects, or smaller upcoming assignments. Do not fill every free hour and do not invent future material.

32. Prefer uninterrupted focused work: use 45-75 minute blocks by default and 60-90 minutes for substantial work or deep studying. Use a 20-30 minute block only when little work remains, the open window is genuinely short, energy is low, or the task is genuinely short. Do not split a meaningful session into several short blocks without a scheduling reason.

33. Default to active practice. For math, physics, and calculation-heavy chemistry: solve problems, check answers, analyze mistakes, then try harder or mixed problems. For knowledge-heavy subjects: recall from memory, answer questions, check, review mistakes, and recall again later. For English and writing: plan, write, evaluate, and revise against the rubric. Do not make passive rereading the default study method.

34. Space meaningful test preparation across days whenever earlier preparation is possible. Start large assignments early and use lower grades as a tie-breaker between otherwise similar academic work. Deadlines and major assessments always override this tie-breaker.

35. After every 60 minutes of uninterrupted study, include a five-minute "Short study break" before more study continues. This is mandatory for consecutive study, but do not add a redundant break when the student is switching to free time, a fixed event, or another non-study activity.

      `
        },
        {
          role: "user",
          content: JSON.stringify({
            input,
            currentTime,
            planningStart: planningStart.toISOString(),
            planningEnd: planningEnd.toISOString(),

            now: currentTime,
          
            hasAcademicMaterial,

            assignments: missionAssignments,
          
            grades: state.grades,

            energyMode,

            manualMentalState: {
              energyLevel: manualMentalState.energyLevel,
              focusScore: manualMentalState.focusScore,
              stressLevel: manualMentalState.stressLevel,
            },

            documents: missionDocuments,
          
            existingCalendar: fixedCalendar.map(e => ({
              title: e.title,
              type: e.type,
              startTime: e.startTime,
              endTime: e.endTime,
              locked: true,
            })),
            calendar: fixedCalendar.map(e => ({
              title: e.title,
              type: e.type,
              startTime: e.startTime,
              endTime: e.endTime,
            })),

            academicIntelligence: intelligence,
          })
        },
      ],
    });

    const text = completion.choices[0].message.content;

    const parsedMission = parseAiJson<Mission | null>(text, null);
    const mission = isCompleteMissionResponse(parsedMission)
      ? parsedMission
      : buildOfflineMission(currentTime, state);

    const fixedEvents = fixedCalendar;
    const previousMissionSchedule = (state.currentMission?.schedule || []).filter(
      (event) => !hiddenMissionEventIds.has(event.id),
    );
    const missionSchedule = (mission.schedule || []).filter(
      (event) => !hiddenMissionEventIds.has(event.id),
    );
    const shouldAmendExistingMission = requestMode === "quick-update" && Boolean(input?.trim()) && Boolean(state.currentMission);
    const packedDynamicEvents = shouldAmendExistingMission
      ? mergeQuickUpdateIntoExistingMission(
          missionSchedule,
          previousMissionSchedule,
          fixedEvents,
          planningStart,
          planningEnd,
          planningDayKey,
          planningOffsetMinutes,
        )
      : packMissionScheduleForDay(
          missionSchedule,
          fixedEvents,
          planningStart,
          planningEnd,
          missionAssignments,
          missionDocuments,
        );

    mission.schedule = closeMissionScheduleGaps(
      constrainScheduleToPlanningDay(
        [
          ...fixedEvents,
          ...packedDynamicEvents,
        ],
        planningStart,
        planningEnd,
        planningDayKey,
        planningOffsetMinutes,
      ),
      planningStart,
      planningEnd,
      currentTime,
    );

    adaptMissionForEnergy(mission, fixedEvents, missionAssignments, energyMode, manualMentalState);
    mission.schedule = enforceAssignmentTimeBudgets(mission.schedule, missionAssignments);
    mission.schedule = addWeakSubjectStudyBlocks(mission.schedule, missionAssignments, state, currentTime);
    applyAuthoritativeMentalState(mission, state, missionAssignments, currentTime);
    mission.schedule = closeMissionScheduleGaps(
      constrainScheduleToPlanningDay(
        mission.schedule,
        planningStart,
        planningEnd,
        planningDayKey,
        planningOffsetMinutes,
      ),
      planningStart,
      planningEnd,
      currentTime,
    );
    const sortedMission = sortMission(mission);
    const finalMission = {
      ...sortedMission,
      expectedFinishTime: sortedMission.schedule.at(-1)?.endTime || sortedMission.currentTime,
    };
    const missionWithReason = {
      ...finalMission,
      reason: input ? `Replanned from user input: ${input}` : "Replanned from shared academic data",
    };

    updateState((state) => {
      // 1. Remove old AI-generated events
      const filteredCalendar = state.calendar.filter(
        (event) => event.source !== "ai"
      );

      const existingAiEvents = state.calendar.filter((event) => event.source === "ai");
      const existingById = new Map(existingAiEvents.map((event) => [event.id, event] as const));
      const existingBySignature = new Map(
        existingAiEvents.map((event) => [calendarEventSignature(event), event] as const)
      );

      // 2. Convert mission schedule to AI calendar events
      const aiEvents = (finalMission.schedule || [])
        .filter((event) => !fixedEvents.some((fixed) => isSameFixedEvent(event, fixed)))
        .map((event) => {
          const existing = existingById.get(event.id) || existingBySignature.get(calendarEventSignature(event));

          return {
            ...event,
            source: "ai" as const,
            externalId: existing?.externalId,
            missionId: finalMission.id,
            createdAt: existing?.createdAt || event.createdAt,
          };
        });
      return {
        ...state,
        currentMission: missionWithReason,
        missionHistory: state.currentMission
          ? [...state.missionHistory, state.currentMission].slice(-20)
          : state.missionHistory,
        missionSuppressedAssignmentIds:
          state.currentMission?.currentTime?.slice(0, 10) === currentTime.slice(0, 10)
            ? state.missionSuppressedAssignmentIds
            : [],
        academicSignals: intelligence.signals,
        dailyBriefings: [
          intelligence.briefing,
          ...state.dailyBriefings.filter((briefing) => briefing.id !== intelligence.briefing.id),
        ].slice(0, 14),
        status: {
          ...state.status,
          currentTime,
          burnoutRisk: missionWithReason.burnoutRisk,
        },
    
        // 3. Clean overwrite instead of stacking
        calendar: [...filteredCalendar, ...aiEvents],
      };
    });

    return Response.json(missionWithReason);
  } catch (err: unknown) {
    if (isRetryableAiProviderError(err) || isOpenRouterCreditError(err)) {
      const mission = sortMission(
        buildAiFallbackMission(
          fallbackCurrentTime,
          getState(),
          buildAiFallbackSummary(err),
        ),
      );

      updateState((state) => ({
        ...state,
        currentMission: mission,
        missionHistory: state.currentMission
          ? [...state.missionHistory, state.currentMission].slice(-20)
          : state.missionHistory,
        status: {
          ...state.status,
          currentTime: fallbackCurrentTime,
          burnoutRisk: mission.burnoutRisk,
        },
      }));

      return Response.json(mission);
    }

    if (isAiConnectionError(err)) {
      logAiFailure("mission", PRIMARY_AI_MODEL, err);
      const mission = sortMission(buildOfflineMission(fallbackCurrentTime, getState()));

      updateState((state) => ({
        ...state,
        currentMission: mission,
        missionHistory: state.currentMission
          ? [...state.missionHistory, state.currentMission].slice(-20)
          : state.missionHistory,
        status: {
          ...state.status,
          currentTime: fallbackCurrentTime,
          burnoutRisk: mission.burnoutRisk,
        },
      }));

      return Response.json(mission);
    }

    const message = err instanceof Error ? err.message : "Server error";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
