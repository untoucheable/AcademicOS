import { Mission, sortMission, sortMissionSchedule } from "@/lib/mission";
import { CalendarEvent, CalendarEventType } from "@/lib/calendar";
import { calendarEventSignature } from "@/lib/calendar-signature";
import { buildAcademicIntelligenceSnapshot } from "@/lib/intelligence";
import { toDateKey } from "@/lib/date";
import { StudentState } from "@/lib/student-state";
import { buildDailyPlanEvents, buildMajorUpdateCandidates, getDailyPlanTemplate } from "@/lib/daily-plans";

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
  notes?: string;
};

type MissionInputDocument = {
  title: string;
  type: string;
  subject: string;
  tags?: string[];
};

type EnergyMode = "recovery" | "normal" | "high-output";

function resolveEnergyMode(input: string, dailyPlanEnergyLevel?: "low" | "medium" | "high"): EnergyMode {
  const detected = detectEnergyMode(input);
  if (detected !== "normal") return detected;

  if (dailyPlanEnergyLevel === "low") return "recovery";
  if (dailyPlanEnergyLevel === "high") return "high-output";
  return "normal";
}

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
});

function parseAiJson<T>(content: string | null | undefined, fallback: T): T {
  if (!content?.trim()) return fallback;

  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fencedMatch ? fencedMatch[1].trim() : trimmed;

  return JSON.parse(jsonText) as T;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function matchesHiddenTitle(title: string, hiddenTitles: string[]) {
  const normalizedTitle = normalizeText(title);
  return hiddenTitles.some((hidden) => {
    const normalizedHidden = normalizeText(hidden);
    return normalizedTitle.includes(normalizedHidden) || normalizedHidden.includes(normalizedTitle);
  });
}

function mergeDailyPlanMajorUpdates(existing?: string, incoming?: string) {
  const combined = [existing, incoming]
    .flatMap((value) => value?.split(/\n+/g) || [])
    .map((value) => value.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const merged: string[] = [];

  for (const item of combined) {
    const normalized = normalizeText(item);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(item);
  }

  return merged.join("\n");
}

function isAiConnectionError(err: unknown) {
  return err instanceof Error && err.message.toLowerCase().includes("connection error");
}

function buildOfflineMission(currentTime: string, state: StudentState): Mission {
  const { planningDayKey } = getPlanningWindow(currentTime);
  const dailyPlanEvents = buildDailyPlanEvents(state.dailyMissionPlan, currentTime);
  const dailyPlanTemplate = state.dailyMissionPlan
    ? getDailyPlanTemplate(state.dailyMissionPlan.templateId)
    : null;
  const fixedEvents = state.calendar
    .filter(isFixedCalendarEvent)
    .filter((event) => isOnPlanningDay(event.startTime, planningDayKey))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const allFixedEvents = [...fixedEvents, ...dailyPlanEvents].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  const lastEvent = allFixedEvents.at(-1);

  return {
    id: crypto.randomUUID(),
    createdAt: currentTime,
    currentTime,
    energyLevel: "medium",
    focusScore: 5,
    burnoutRisk: Math.max(1, Math.min(10, state.status.burnoutRisk || 1)),
    expectedFinishTime: lastEvent?.endTime || currentTime,
    summary: state.dailyMissionPlan
      ? `AcademicOS kept your ${dailyPlanTemplate?.name || "daily base plan"} and confirmed calendar items available. AI-generated study blocks will appear when the AI service connection is available.`
      : "AcademicOS kept your confirmed calendar items and review findings available. AI-generated study blocks will appear when the AI service connection is available.",
    schedule: allFixedEvents,
    reason: "Offline fallback mission",
  };
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

function detectEnergyMode(input: string): EnergyMode {
  const normalized = input.toLowerCase();
  const lowEnergy = [
    "tired",
    "exhausted",
    "burnt out",
    "burned out",
    "drained",
    "low energy",
    "no energy",
    "overwhelmed",
    "stressed",
    "sick",
  ].some((phrase) => normalized.includes(phrase));

  if (lowEnergy) return "recovery";

  const highEnergy = [
    "a lot of energy",
    "lots of energy",
    "high energy",
    "feeling productive",
    "very productive",
    "motivated",
    "locked in",
    "i can do more",
    "extra energy",
  ].some((phrase) => normalized.includes(phrase));

  if (highEnergy) return "high-output";

  return "normal";
}

function isSpecificStudyEvent(
  event: CalendarEvent,
  assignments: MissionInputAssignment[],
  documents: MissionInputDocument[]
) {
  if ((event as CalendarEvent & { missionOnly?: boolean }).missionOnly) return true;
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

function isAssessmentAssignment(assignment: MissionInputAssignment) {
  return (
    assignment.assessmentType === "test" ||
    assignment.assessmentType === "quiz" ||
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

function getPlanningWindow(currentTime: string) {
  const current = new Date(currentTime);
  const planningStart = new Date(current);
  planningStart.setHours(6, 0, 0, 0);
  if (current.getTime() > planningStart.getTime()) {
    planningStart.setTime(current.getTime());
  }

  const planningEnd = new Date(current);
  planningEnd.setHours(23, 59, 59, 999);

  return {
    planningDayKey: currentTime.slice(0, 10) || toDateKey(current),
    planningStart,
    planningEnd,
  };
}

function isOnPlanningDay(date: string, planningDayKey: string) {
  return toDateKey(new Date(date)) === planningDayKey;
}

function scoreAssignmentForToday(assignment: MissionInputAssignment, currentTime: string) {
  const now = new Date(currentTime);
  const due = new Date(assignment.dueDate);
  const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const basePriority = assignment.priority === "high" ? 100 : assignment.priority === "medium" ? 60 : 30;
  const urgencyScore = daysUntilDue <= 0 ? 100 : daysUntilDue === 1 ? 85 : daysUntilDue <= 3 ? 70 : daysUntilDue <= 7 ? 40 : 10;
  const effortScore = Math.min(30, Math.round((assignment.estimatedMinutes || 45) / 5));
  const assessmentBonus = isAssessmentAssignment(assignment) ? 10 : 0;

  return basePriority + urgencyScore + effortScore + assessmentBonus;
}

function formatMissionAssignment(assignment: MissionInputAssignment, currentTime: string): MissionInputAssignment {
  if (isAssessmentAssignment(assignment)) {
    return {
      ...assignment,
      title: buildPrepTitle(assignment),
      priority: scoreAssignmentForToday(assignment, currentTime) >= 120 ? "high" : "medium",
    };
  }

  const score = scoreAssignmentForToday(assignment, currentTime);
  return {
    ...assignment,
    priority: score >= 120 ? "high" : score >= 80 ? "medium" : "low",
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
  const sortedEvents = [...events]
    .filter((event) => !fixedIds.has(event.id))
    .filter((event) => isSpecificStudyEvent(event, assignments, documents))
    .sort((a, b) => b.priority - a.priority || new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const packed: CalendarEvent[] = [];
  let cursor = new Date(planningStart);

  for (const event of sortedEvents) {
    const durationMinutes = Math.max(
      15,
      Math.round((new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60000) || 45,
    );
    const start = findNextOpenStart(cursor, durationMinutes, fixedEvents);
    const end = addMinutes(start, durationMinutes);
    if (end.getTime() > planningEnd.getTime()) break;

    const relatedAssignment = event.relatedAssignmentId
      ? assignments.find((assignment) => assignment.id === event.relatedAssignmentId)
      : assignments.find((assignment) =>
          normalizeText(event.title).includes(normalizeText(assignment.title)) ||
          normalizeText(assignment.title).includes(normalizeText(event.title)),
        );

    packed.push({
      ...event,
      title:
        relatedAssignment && isAssessmentAssignment(relatedAssignment)
          ? buildPrepTitle(relatedAssignment)
          : event.title,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      priority:
        relatedAssignment && isAssessmentAssignment(relatedAssignment)
          ? Math.max(event.priority, 8)
          : event.priority,
    });

    cursor = addMinutes(end, 10);
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

function adaptMissionForEnergy(
  mission: Mission,
  fixedEvents: CalendarEvent[],
  assignments: MissionInputAssignment[],
  energyMode: EnergyMode
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
    const lastScheduled = [...fixedEvents, ...expandedStudyEvents]
      .sort((a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime())
      .at(-1);
    const extraStartBase = lastScheduled
      ? addMinutes(new Date(lastScheduled.endTime), 15)
      : addMinutes(new Date(mission.currentTime), 10);
    const extraStart = findNextOpenStart(extraStartBase, 35, fixedEvents);
    const extraStudy = nextAssignment
      ? [buildStudyEvent(nextAssignment, extraStart, 35, "Get ahead on", mission.createdAt, 6)]
      : [];

    mission.energyLevel = "high";
    mission.focusScore = Math.max(mission.focusScore, 8);
    mission.burnoutRisk = Math.min(mission.burnoutRisk, 4);
    mission.summary = nextAssignment
      ? "High-output mode applied. AcademicOS extended focused work and added one get-ahead block so future low-energy days can be lighter."
      : "High-output mode applied. AcademicOS extended today's focused work without inventing extra assignments.";
    mission.schedule = [
      ...fixedEvents,
      ...expandedStudyEvents,
      ...extraStudy,
    ].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  const lastEvent = mission.schedule[mission.schedule.length - 1];
  mission.expectedFinishTime = lastEvent?.endTime || mission.currentTime;

  return mission;
}

function getAssignmentHorizonDays(energyMode: EnergyMode) {
  if (energyMode === "recovery") return 1;
  if (energyMode === "high-output") return 7;
  return 3;
}

function isWithinAssignmentHorizon(assignment: MissionInputAssignment, currentTime: string, horizonDays: number) {
  const now = new Date(currentTime);
  const due = new Date(assignment.dueDate);
  const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  return daysUntilDue <= horizonDays;
}

function getStudyDurationMinutes(assignment: MissionInputAssignment, energyMode: EnergyMode) {
  const estimate = assignment.estimatedMinutes || 45;

  if (energyMode === "recovery") {
    return Math.min(25, Math.max(15, Math.ceil(estimate / 3)));
  }

  if (energyMode === "high-output") {
    return Math.min(75, Math.max(35, Math.ceil(estimate * 0.8)));
  }

  return Math.min(60, Math.max(25, Math.ceil(estimate / 1.2)));
}

function buildMissionGapBlock(
  start: Date,
  end: Date,
  createdAt: string,
  energyMode: EnergyMode,
  hasAcademicWork: boolean,
): CalendarEvent {
  const minutes = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000));
  const title =
    energyMode === "recovery"
      ? minutes >= 20
        ? "Recovery break"
        : "Pause"
      : hasAcademicWork && minutes >= 30
        ? "Open study buffer"
        : minutes >= 20
          ? "Open time"
          : "Pause";

  return {
    id: crypto.randomUUID(),
    title,
    type: energyMode === "recovery" ? "break" : "personal",
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    priority: energyMode === "recovery" ? 8 : 4,
    createdAt,
    source: "ai",
  };
}

function isFlexibleBaseBlockTitle(title: string) {
  return /(?:free time|open time|open study buffer|study buffer|wind down|downtime|buffer time|flex time|free slot|open slot)/i.test(
    normalizeText(title),
  );
}

function isFlexibleBaseBlock(event: CalendarEvent) {
  return Boolean(event.missionOnly) && isFlexibleBaseBlockTitle(event.title);
}

function getEventDurationMinutes(event: CalendarEvent) {
  return Math.max(15, Math.round((new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60000) || 45);
}

function placeCandidatesIntoFlexibleBlocks(
  flexibleBlocks: CalendarEvent[],
  candidateEvents: CalendarEvent[],
) {
  const orderedBlocks = [...flexibleBlocks].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  const cursors = orderedBlocks.map((block) => new Date(block.startTime));
  const placed: CalendarEvent[] = [];
  const consumed = new Set<string>();

  const orderedCandidates = [...candidateEvents].sort(
    (a, b) => b.priority - a.priority || new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  for (const candidate of orderedCandidates) {
    const durationMinutes = getEventDurationMinutes(candidate);
    let placedInBlock = false;

    for (let index = 0; index < orderedBlocks.length; index += 1) {
      const block = orderedBlocks[index];
      const blockStart = new Date(block.startTime);
      const blockEnd = new Date(block.endTime);
      const cursor = cursors[index].getTime() > blockStart.getTime() ? cursors[index] : blockStart;
      const start = cursor;
      const end = addMinutes(start, durationMinutes);

      if (end.getTime() > blockEnd.getTime()) continue;

      placed.push({
        ...candidate,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      consumed.add(candidate.id);
      cursors[index] = addMinutes(end, 10);
      placedInBlock = true;
      break;
    }

    if (!placedInBlock) continue;
  }

  return {
    placed,
    consumed,
  };
}

function buildContiguousMissionSchedule(
  fixedEvents: CalendarEvent[],
  candidateEvents: CalendarEvent[],
  planningStart: Date,
  planningEnd: Date,
  currentTime: string,
  energyMode: EnergyMode,
  assignments: MissionInputAssignment[],
  documents: MissionInputDocument[],
) {
  const flexibleBlocks = fixedEvents.filter(isFlexibleBaseBlock);
  const hardFixedEvents = fixedEvents.filter((event) => !isFlexibleBaseBlock(event));
  const flexiblePlacement = placeCandidatesIntoFlexibleBlocks(flexibleBlocks, candidateEvents);
  const remainingCandidates = candidateEvents.filter((event) => !flexiblePlacement.consumed.has(event.id));
  const packed = packMissionScheduleForDay(
    remainingCandidates,
    [...hardFixedEvents, ...flexiblePlacement.placed],
    planningStart,
    planningEnd,
    assignments,
    documents,
  );
  const baseSchedule = [...hardFixedEvents, ...flexiblePlacement.placed, ...packed].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const filled: CalendarEvent[] = [];
  let cursor = new Date(planningStart);

  for (const event of baseSchedule) {
    const eventStart = new Date(event.startTime);
    const eventEnd = new Date(event.endTime);

    if (eventStart.getTime() > cursor.getTime()) {
      filled.push(
        buildMissionGapBlock(
          cursor,
          eventStart,
          currentTime,
          energyMode,
          candidateEvents.some((candidate) => candidate.type === "study"),
        ),
      );
    }

    filled.push(event);
    if (eventEnd.getTime() > cursor.getTime()) {
      cursor = new Date(eventEnd);
    }
  }

  if (cursor.getTime() < planningEnd.getTime()) {
    filled.push(
      buildMissionGapBlock(
        cursor,
        planningEnd,
        currentTime,
        energyMode,
        candidateEvents.some((candidate) => candidate.type === "study"),
      ),
    );
  }

  return sortMissionSchedule(filled);
}

function buildAcademicMissionCandidates(
  assignments: MissionInputAssignment[],
  documents: MissionInputDocument[],
  currentTime: string,
  energyMode: EnergyMode,
) {
  const maxStudyBlocks = energyMode === "recovery" ? 1 : energyMode === "high-output" ? 4 : 2;
  const assignmentCandidates = assignments.slice(0, maxStudyBlocks).map((assignment) =>
    buildStudyEvent(
      assignment,
      new Date(currentTime),
      getStudyDurationMinutes(assignment, energyMode),
      isAssessmentAssignment(assignment) ? "Prepare for" : "Work on",
      currentTime,
      scoreAssignmentForToday(assignment, currentTime),
    ),
  );

  const remainingSlots = Math.max(0, maxStudyBlocks - assignmentCandidates.length);
  const documentCandidates = documents.slice(0, remainingSlots).map((document, index) => ({
    id: crypto.randomUUID(),
    title: `Review ${document.title}`,
    type: "study" as const,
    startTime: new Date(currentTime).toISOString(),
    endTime: addMinutes(
      new Date(currentTime),
      energyMode === "recovery" ? 20 : energyMode === "high-output" ? 45 : 30 + index * 5,
    ).toISOString(),
    relatedCourseId: undefined,
    priority: energyMode === "high-output" ? 7 : 5,
    createdAt: currentTime,
    source: "ai" as const,
  }));

  return [...assignmentCandidates, ...documentCandidates];
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

export async function POST(req: Request) {
  let fallbackCurrentTime = new Date().toISOString();

  try {
    const { input, currentTime, timeZone } = await req.json();
    fallbackCurrentTime = currentTime || fallbackCurrentTime;
    let state = getState();
    const dailyPlan = state.dailyMissionPlan;
    const effectiveDailyPlan = dailyPlan
      ? {
          ...dailyPlan,
          majorUpdates: mergeDailyPlanMajorUpdates(dailyPlan.majorUpdates, input || ""),
        }
      : null;
    const planningContext = [input || "", effectiveDailyPlan?.majorUpdates || ""].filter(Boolean).join("\n");
    const energyMode = resolveEnergyMode(planningContext, effectiveDailyPlan?.energyLevel || "medium");
    const dailyPlanEvents = buildDailyPlanEvents(effectiveDailyPlan, currentTime || fallbackCurrentTime);
    const majorUpdateCandidates = buildMajorUpdateCandidates(effectiveDailyPlan, currentTime || fallbackCurrentTime);
    const deletion = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
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
          content: planningContext || "",
        },
      ],
    });
    const deletionResult = parseAiJson<DeletionResult>(
      deletion.choices[0].message.content,
      {}
    );
    const removals = deletionResult.removeEvents || [];

    if (removals.length) {
      let removedCount = 0;
      const updated = updateState((state) => {
        const hiddenIds = new Set(state.missionHiddenEventIds || []);
        const hiddenTitles = new Set(state.missionHiddenEventTitles || []);
        const sourceEvents = state.currentMission?.schedule?.length ? state.currentMission.schedule : state.calendar;
        const matchedEvents = sourceEvents.filter((event) =>
          removals.some((title) => normalizeText(event.title).includes(normalizeText(title)))
        );

        matchedEvents.forEach((event) => hiddenIds.add(event.id));
        matchedEvents.forEach((event) => hiddenTitles.add(event.title));
        removedCount = matchedEvents.length;

        return {
          ...state,
          missionHiddenEventIds: [...hiddenIds],
          missionHiddenEventTitles: [...hiddenTitles],
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
              ? `Hidden ${removedCount} matching item${removedCount === 1 ? "" : "s"} from your mission plan.`
              : "I could not find a matching item to hide from the mission."
          ),
      );
    }

    const extraction = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
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
            input: planningContext,
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

    if (energyMode !== "normal") {
      updateState((state) => ({
        ...state,
        status: {
          ...state.status,
          currentTime,
          energyLevel: energyMode === "recovery" ? 2 : 8,
          stressLevel: energyMode === "recovery"
            ? Math.max(state.status.stressLevel, 7)
            : Math.min(state.status.stressLevel, 4),
          burnoutRisk: energyMode === "recovery"
            ? Math.max(state.status.burnoutRisk, 7)
            : Math.min(state.status.burnoutRisk, 3),
        },
      }));

      state = getState();
    }

    const { planningDayKey, planningStart, planningEnd } = getPlanningWindow(currentTime);
    const hiddenTitles = state.missionHiddenEventTitles || [];
    const fixedCalendar = state.calendar
      .filter(isFixedCalendarEvent)
      .filter((event) => isOnPlanningDay(event.startTime, planningDayKey))
      .filter((event) => new Date(event.endTime).getTime() >= planningStart.getTime())
      .filter((event) => !matchesHiddenTitle(event.title, hiddenTitles));
    const filteredDailyPlanEvents = dailyPlanEvents.filter(
      (event) => !overlapsFixedEvent(new Date(event.startTime), new Date(event.endTime), fixedCalendar),
    );
    const allFixedEvents = [...fixedCalendar, ...filteredDailyPlanEvents].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    const intelligence = buildAcademicIntelligenceSnapshot(state, currentTime);
    const assignmentHorizonDays = getAssignmentHorizonDays(energyMode);
    const missionAssignments = state.assignments
      .filter((a) => !a.completed)
      .filter((assignment) => isWithinAssignmentHorizon(assignment, currentTime, assignmentHorizonDays))
      .filter((assignment) => !matchesHiddenTitle(assignment.title, hiddenTitles))
      .sort((a, b) => scoreAssignmentForToday(b as MissionInputAssignment, currentTime) - scoreAssignmentForToday(a as MissionInputAssignment, currentTime))
      .slice(0, energyMode === "high-output" ? 8 : energyMode === "recovery" ? 3 : 5)
      .map((a) => formatMissionAssignment({
        id: a.id,
        title: a.title,
        course: a.course,
        subject: a.subject,
        assessmentType: a.assessmentType,
        dueDate: a.dueDate,
        priority: a.priority,
        estimatedMinutes: a.estimatedMinutes,
        notes: a.notes,
      }, currentTime));
    const hasAcademicMaterial = missionAssignments.length > 0 || state.documents.length > 0;
    const missionDocuments = state.documents.map(document => ({
      title: document.title,
      type: document.type,
      subject: document.subject,
      tags: document.tags,
    }));

    const completion = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
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

The user may also have a base daily plan for today.
Treat those blocks as fixed for the day too, but keep them out of the persistent calendar database.

Never move them.

Never change their times.

Never overlap them.

Flexible base blocks like "Free time", "Open time", "Open study buffer", "Wind down", and similar buffer slots are the places where new major updates and work periods should be inserted first.
If the user adds a major update or extra work, prefer those flexible blocks before using any other open time.

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

18. Never create vague blocks like "Study", "Study time", "Focus time", "Homework", or "Productivity".
Every study block must name the exact assignment, course, document, or subject being studied and say how long it lasts.

19. Do not invent scheduled events, classes, practices, errands, tests, or appointments. Only include fixed events from existingCalendar or events explicitly extracted from the current user input.
20. If the user has a base daily plan, schedule around it and do not place study work inside the fixed routine unless there is no other option.

21. If assignments is empty and documents is empty, do not create study blocks.

22. If you recommend studying, the title must be specific, such as "Work on English Essay draft" or "Review Biology Chapter 5 notes", never just "Study".

23. If the user says they are tired, exhausted, stressed, overwhelmed, or low energy, you must change the actual schedule:
- reduce workload
- keep only the most important academic work
- shorten study sessions to 15-25 minutes
- add recovery breaks
- do not merely tell the user to consider managing time

24. If the user says they have high energy, feel productive, motivated, locked in, or can do more, you must change the actual schedule:
- extend useful study blocks when they are tied to real assignments/documents
- optionally add one get-ahead task from assignments due later
- do not invent any work
- preserve future sustainability by not overloading the day

      `
        },
        {
          role: "user",
          content: JSON.stringify({
            input: planningContext,
            currentTime,
            planningStart: planningStart.toISOString(),
            planningEnd: planningEnd.toISOString(),

            now: currentTime,
          
            hasAcademicMaterial,

            assignments: missionAssignments,
          
            grades: state.grades,

            energyMode,
            dailyPlan: effectiveDailyPlan
              ? {
                  ...effectiveDailyPlan,
                  templateBlocks: buildDailyPlanEvents(effectiveDailyPlan, currentTime || fallbackCurrentTime).map((event) => ({
                    title: event.title,
                    type: event.type,
                    startTime: event.startTime,
                    endTime: event.endTime,
                  })),
                  majorUpdateBlocks: majorUpdateCandidates.map((event) => ({
                    title: event.title,
                    type: event.type,
                    startTime: event.startTime,
                    endTime: event.endTime,
                    priority: event.priority,
                  })),
                }
              : null,

            documents: missionDocuments,
          
            existingCalendar: allFixedEvents.map((e) => ({
              title: e.title,
              type: e.type,
              startTime: e.startTime,
              endTime: e.endTime,
              locked: true,
            })),
            calendar: allFixedEvents.map((e) => ({
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

    const mission = parseAiJson<Mission>(
      text,
      emptyMission(currentTime, "AcademicOS could not generate a mission from the AI response."),
    );

    const fixedEvents = allFixedEvents;
    const deterministicSchedule = effectiveDailyPlan
      ? buildContiguousMissionSchedule(
          fixedEvents,
          [
            ...majorUpdateCandidates,
            ...buildAcademicMissionCandidates(missionAssignments, missionDocuments, currentTime, energyMode),
          ],
          planningStart,
          planningEnd,
          currentTime,
          energyMode,
          missionAssignments,
          missionDocuments,
        )
      : null;
    const packedDynamicEvents = effectiveDailyPlan
      ? []
      : packMissionScheduleForDay(
          mission.schedule || [],
          fixedEvents,
          planningStart,
          planningEnd,
          missionAssignments,
          missionDocuments,
        );

    mission.schedule = effectiveDailyPlan
      ? deterministicSchedule || fixedEvents
      : [
          ...fixedEvents,
          ...packedDynamicEvents,
        ].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    if (!effectiveDailyPlan) {
      adaptMissionForEnergy(mission, fixedEvents, missionAssignments, energyMode);
    } else {
      const taskCount = [
        ...majorUpdateCandidates,
        ...buildAcademicMissionCandidates(missionAssignments, missionDocuments, currentTime, energyMode),
      ]
        .filter((event) => event.type === "study").length;
      mission.energyLevel = effectiveDailyPlan.energyLevel;
      mission.focusScore = energyMode === "recovery" ? 4 : energyMode === "high-output" ? 8 : 6;
      mission.burnoutRisk = energyMode === "recovery" ? 7 : energyMode === "high-output" ? 4 : 5;
      mission.summary = taskCount
        ? "Daily plan locked in. AcademicOS filled the open spaces around your base day with the highest-value work it could fit."
        : "Daily plan locked in. AcademicOS kept the base routine and used the open spaces as recovery and buffer time.";
    }

    const sortedMission = sortMission(mission);
    const dailyPlanTemplate = effectiveDailyPlan ? getDailyPlanTemplate(effectiveDailyPlan.templateId) : null;
    const dailyPlanNote = effectiveDailyPlan
      ? [
          `Base plan: ${dailyPlanTemplate?.name || "Daily Plan"}.`,
          `Energy check: ${effectiveDailyPlan.energyLevel}.`,
          effectiveDailyPlan.majorUpdates.trim() ? `Major updates: ${effectiveDailyPlan.majorUpdates.trim()}.` : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "";
    const finalMission = {
      ...sortedMission,
      expectedFinishTime: sortedMission.schedule.at(-1)?.endTime || sortedMission.currentTime,
      summary: effectiveDailyPlan ? `${sortedMission.summary} ${dailyPlanNote}`.trim() : sortedMission.summary,
    };
    const missionWithReason = {
      ...finalMission,
      reason: [
        input ? `Replanned from user input: ${input}` : "Replanned from shared academic data",
        effectiveDailyPlan ? `Daily plan updated: ${dailyPlanTemplate?.name || "Daily Plan"}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
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
        .filter((event) => !event.missionOnly)
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
        dailyMissionPlan: effectiveDailyPlan || state.dailyMissionPlan,
        missionHistory: state.currentMission
          ? [...state.missionHistory, state.currentMission].slice(-20)
          : state.missionHistory,
        academicSignals: intelligence.signals,
        dailyBriefings: [
          intelligence.briefing,
          ...state.dailyBriefings.filter((briefing) => briefing.id !== intelligence.briefing.id),
        ].slice(0, 14),
    
        // 3. Clean overwrite instead of stacking
        calendar: [...filteredCalendar, ...aiEvents],
      };
    });

    return Response.json(missionWithReason);
  } catch (err: unknown) {
    if (isAiConnectionError(err)) {
      const mission = sortMission(buildOfflineMission(fallbackCurrentTime, getState()));

      updateState((state) => ({
        ...state,
        currentMission: mission,
        missionHistory: state.currentMission
          ? [...state.missionHistory, state.currentMission].slice(-20)
          : state.missionHistory,
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
