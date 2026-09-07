import type { CalendarEvent, CalendarEventType } from "./calendar";
import type { DailyMissionPlan, DailyPlanTemplateId, EnergyLevel, MissionManualBlock } from "./types";

type DailyPlanBlock = {
  id: string;
  title: string;
  type: CalendarEventType;
  start: string;
  end: string;
};

type DailyPlanTemplate = {
  id: DailyPlanTemplateId;
  name: string;
  description: string;
  blocks: DailyPlanBlock[];
};

type MajorUpdateCandidate = Pick<CalendarEvent, "id" | "title" | "type" | "startTime" | "endTime" | "priority" | "createdAt" | "source"> & {
  missionOnly?: boolean;
};

const TEMPLATE_DEFINITIONS: DailyPlanTemplate[] = [
  {
    id: "training-day",
    name: "Evening Training",
    description: "Adds the evening training commitment and leaves the rest of the day flexible.",
    blocks: [
      { id: "prep", title: "Get ready for training", type: "personal", start: "17:45", end: "18:00" },
      { id: "session", title: "Football practice", type: "exercise", start: "18:00", end: "21:30" },
      { id: "recovery", title: "Shower & recovery", type: "personal", start: "21:30", end: "22:30" },
    ],
  },
  {
    id: "refereeing-day",
    name: "Refereeing",
    description: "Adds the evening refereeing commitment and keeps the day open for planning.",
    blocks: [
      { id: "prep", title: "Get ready to referee", type: "personal", start: "17:45", end: "18:00" },
      { id: "session", title: "Refereeing", type: "personal", start: "18:00", end: "21:00" },
      { id: "recovery", title: "Shower & recovery", type: "personal", start: "21:00", end: "22:00" },
    ],
  },
  {
    id: "late-practice-day",
    name: "Late Training",
    description: "Adds the earlier-evening training block and keeps the rest of the day flexible.",
    blocks: [
      { id: "prep", title: "Get ready for training", type: "personal", start: "16:15", end: "16:30" },
      { id: "session", title: "Football practice", type: "exercise", start: "16:30", end: "20:00" },
      { id: "recovery", title: "Shower & recovery", type: "personal", start: "20:00", end: "21:00" },
    ],
  },
  {
    id: "early-practice-day",
    name: "Early Training",
    description: "Adds the early training block and keeps the rest of the day flexible.",
    blocks: [
      { id: "prep", title: "Get ready for training", type: "personal", start: "15:45", end: "16:00" },
      { id: "session", title: "Football practice", type: "exercise", start: "16:00", end: "19:30" },
      { id: "recovery", title: "Shower & recovery", type: "personal", start: "19:30", end: "20:30" },
    ],
  },
];

function getLocalDateKey(currentTime: string) {
  return currentTime.slice(0, 10);
}

function parseOffsetMinutes(currentTime: string) {
  const offsetMatch = currentTime.match(/([+-])(\d{2}):(\d{2})$/);
  if (!offsetMatch) return 0;

  const sign = offsetMatch[1] === "-" ? -1 : 1;
  const hours = Number(offsetMatch[2]);
  const minutes = Number(offsetMatch[3]);

  return sign * (hours * 60 + minutes);
}

function toIsoAtLocalTime(dateKey: string, clock: string, currentTime: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = clock.split(":").map(Number);
  const offsetMinutes = parseOffsetMinutes(currentTime);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMinutes * 60 * 1000;
  return new Date(timestamp).toISOString();
}

function getDayOfWeek(dateKey: string, currentTime: string) {
  return new Date(toIsoAtLocalTime(dateKey, "12:00", currentTime)).getDay();
}

function energyToMissionLevel(energyLevel: EnergyLevel) {
  return energyLevel === "low" ? "recovery" : energyLevel === "high" ? "high-output" : "normal";
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function isCancellationUpdate(text: string) {
  return /(?:cancel(?:led|ed)?|called off|not happening|no longer|moved|postponed|rescheduled|skipped)/i.test(text);
}

function shouldRemovePracticeBlock(text: string) {
  return /(?:practice|training|football|soccer|session|game|match|refereeing)/i.test(text);
}

function parseExplicitDurationMinutes(text: string) {
  const normalized = normalizeText(text);

  const hourAndMinuteMatch = normalized.match(/for\s+(\d+)\s+hours?(?:\s+and\s+(\d+)\s+minutes?)?/i);
  if (hourAndMinuteMatch) {
    return Number(hourAndMinuteMatch[1]) * 60 + Number(hourAndMinuteMatch[2] || 0);
  }

  const halfHourMatch = normalized.match(/for\s+(\d+)\s+and\s+a\s+half\s+hours?/i);
  if (halfHourMatch) {
    return Number(halfHourMatch[1]) * 60 + 30;
  }

  const simpleHourMatch = normalized.match(/for\s+(an?\s+)?hour(s)?\b/i);
  if (simpleHourMatch) {
    return 60;
  }

  const minuteMatch = normalized.match(/for\s+(\d+)\s+minutes?/i);
  if (minuteMatch) {
    return Number(minuteMatch[1]);
  }

  return 0;
}

function describeMajorUpdateTask(text: string) {
  const trimmed = text.trim().replace(/[.;:]+$/g, "");
  const lowered = normalizeText(trimmed);
  const match =
    lowered.match(/(?:need to|have to|got to|must|should|need|want to|have a|got a|work on|study for|study|finish|complete|prepare for|prep for|review|read|write)\s+(.*)$/i) ||
    lowered.match(/^(?:today|tonight|this afternoon|this morning)\s*[:,-]\s*(.*)$/i);

  const body = (match?.[1] || trimmed)
    .replace(/\b(my|the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!body) return "";

  const words = body.split(" ");
  const shortBody = words.length > 10 ? `${words.slice(0, 10).join(" ")}...` : body;
  return shortBody.charAt(0).toUpperCase() + shortBody.slice(1);
}

function getMajorUpdateDurationMinutes(text: string, energyLevel: EnergyLevel) {
  const explicitDuration = parseExplicitDurationMinutes(text);
  if (explicitDuration > 0) return explicitDuration;
  if (isCancellationUpdate(text)) return 0;
  if (energyLevel === "low") return 20;
  if (energyLevel === "high") return 45;
  return 30;
}

function getMajorUpdatePriority(text: string) {
  if (/(?:test|quiz|exam|deadline|due|submit|assignment|homework|project|essay|paper)/i.test(text)) {
    return 9;
  }

  if (/(?:practice|training|game|match|refereeing|work shift|job)/i.test(text)) {
    return 8;
  }

  return 7;
}

function extractMajorUpdateSentences(majorUpdates: string) {
  return majorUpdates
    .split(/[\n.;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function shouldConvertMajorUpdateToTask(text: string) {
  return /(?:need to|have to|got to|must|should|work on|study for|study|finish|complete|prepare for|prep for|review|read|write|assignment|homework|quiz|test|exam|project|essay|paper|worksheet|chapter|notes|practice)/i.test(text);
}

export function getRemovedTemplateBlockIdsForMajorUpdates(
  plan: DailyMissionPlan | null | undefined,
  majorUpdates: string | undefined,
) {
  if (!plan || !majorUpdates?.trim()) return new Set<string>();

  const removed = new Set<string>();
  const sentences = extractMajorUpdateSentences(majorUpdates);
  const cancellationMatched = sentences.some((sentence) => isCancellationUpdate(sentence) && shouldRemovePracticeBlock(sentence));

  if (!cancellationMatched) return removed;

  const templateId = plan.templateId;
  if (templateId === "training-day" || templateId === "late-practice-day" || templateId === "early-practice-day") {
    removed.add("prep");
    removed.add("session");
    removed.add("recovery");
  }

  if (templateId === "refereeing-day") {
    removed.add("prep");
    removed.add("session");
    removed.add("recovery");
  }

  return removed;
}

export function buildMajorUpdateCandidates(
  plan: DailyMissionPlan | null | undefined,
  currentTime: string,
): MajorUpdateCandidate[] {
  if (!plan?.majorUpdates?.trim()) return [];

  const sentences = extractMajorUpdateSentences(plan.majorUpdates);
  const candidates: MajorUpdateCandidate[] = [];

  sentences.forEach((sentence, index) => {
    if (!shouldConvertMajorUpdateToTask(sentence) || isCancellationUpdate(sentence)) return;

    const title = describeMajorUpdateTask(sentence);
    if (!title) return;

    const minutes = getMajorUpdateDurationMinutes(sentence, plan.energyLevel);
    if (minutes <= 0) return;

    const now = new Date(currentTime);
    candidates.push({
      id: `major-update:${now.toISOString()}:${index}`,
      title: title.startsWith("Handle ") ? title : `Handle ${title}`,
      type: "study",
      startTime: currentTime,
      endTime: new Date(now.getTime() + minutes * 60 * 1000).toISOString(),
      priority: getMajorUpdatePriority(sentence),
      createdAt: currentTime,
      source: "ai",
      missionOnly: true,
    });
  });

  return candidates;
}

export function getDailyPlanTemplates() {
  return TEMPLATE_DEFINITIONS.map(({ id, name, description }) => ({ id, name, description }));
}

export function getDailyPlanTemplate(templateId: DailyPlanTemplateId) {
  return TEMPLATE_DEFINITIONS.find((template) => template.id === templateId) || TEMPLATE_DEFINITIONS[0];
}

export function getDefaultDailyPlanTemplateId(energyLevel: EnergyLevel = "medium"): DailyPlanTemplateId {
  if (energyLevel === "low") return "refereeing-day";
  if (energyLevel === "high") return "early-practice-day";
  return "training-day";
}

function mapManualBlockToEvent(block: MissionManualBlock): CalendarEvent {
  return {
    id: block.id,
    title: block.title,
    type: block.type,
    startTime: block.startTime,
    endTime: block.endTime,
    relatedAssignmentId: block.relatedAssignmentId,
    priority: 10,
    createdAt: block.startTime,
    source: "manual",
    fixed: true,
    missionOnly: !block.calendarEventId,
  };
}

function addMinutesToClock(clock: string, minutesToAdd: number) {
  const [hours, minutes] = clock.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function buildWeekBaselineEvents(
  plan: DailyMissionPlan | null | undefined,
  currentTime: string,
  options?: { saturdayWakeTime?: string },
) {
  const dateKey = getLocalDateKey(currentTime);
  // A school weekday has a baseline even before the student has opened the
  // day-plan editor. Only today's explicit "No school" choice can remove it.
  const effectivePlan: DailyMissionPlan = plan?.date === dateKey
    ? plan
    : {
        date: dateKey,
        templateId: "training-day",
        energyLevel: "medium",
        majorUpdates: "",
        schoolMode: "auto",
        sleepTarget: "22:30",
        manualBlocks: [],
        updatedAt: currentTime,
      };
  const dayOfWeek = getDayOfWeek(dateKey, currentTime);
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

  const blocks: DailyPlanBlock[] = [];

  if (isWeekday) {
    if (effectivePlan.schoolMode !== "skip") {
      blocks.push(
        { id: "weekday-run", title: "Morning run", type: "exercise", start: "05:30", end: "06:00" },
        { id: "school-prep", title: "Get ready for school", type: "personal", start: "06:00", end: "07:30" },
        { id: "bus-to-school", title: "Bus to school", type: "personal", start: "07:30", end: "08:00" },
        { id: "school", title: "School", type: "school", start: "08:00", end: "14:20" },
        { id: "friends", title: "Hang out with friends", type: "personal", start: "14:20", end: "14:30" },
        { id: "bus-home", title: "Bus home", type: "personal", start: "14:30", end: "15:30" },
      );
    }
  } else if (dayOfWeek === 6) {
    const saturdayWakeTime = options?.saturdayWakeTime || "10:00";
    blocks.push({
      id: "saturday-sleep-in",
      title: "Sleep in",
      type: "personal",
      start: "05:30",
      end: saturdayWakeTime,
    });
    blocks.push({
      id: "saturday-wake",
      title: "Wake up",
      type: "personal",
      start: saturdayWakeTime,
      end: addMinutesToClock(saturdayWakeTime, 30),
    });
  } else {
    blocks.push(
      { id: "sunday-sleep", title: "Sleep", type: "personal", start: "05:30", end: "08:00" },
      { id: "sunday-church-prep", title: "Get ready for church", type: "personal", start: "08:00", end: "10:00" },
      { id: "sunday-church", title: "Church", type: "personal", start: "10:00", end: "13:00" },
    );
  }

  // Sleep is a protected part of the day, not an unlabelled stretch of free time.
  blocks.push({ id: "sleep", title: "Sleep", type: "personal", start: effectivePlan.sleepTarget || "22:30", end: "23:59" });

  return blocks.map((block) => ({
    id: `daily-plan:${dateKey}:baseline:${block.id}`,
    title: block.title,
    type: block.type,
    startTime: toIsoAtLocalTime(dateKey, block.start, currentTime),
    endTime: toIsoAtLocalTime(dateKey, block.end, currentTime),
    priority: 10,
    createdAt: currentTime,
    source: "manual" as const,
    fixed: true,
    missionOnly: true,
  }) satisfies CalendarEvent);
}

export function buildDailyPlanEvents(
  plan: DailyMissionPlan | null | undefined,
  currentTime: string,
  options?: { saturdayWakeTime?: string },
) {
  const baselineEvents = buildWeekBaselineEvents(plan, currentTime, options);
  const currentDateKey = getLocalDateKey(currentTime);
  const manualBlocks = plan?.date === currentDateKey && Array.isArray(plan.manualBlocks)
    ? plan.manualBlocks.map(mapManualBlockToEvent)
    : [];

  return [...baselineEvents, ...manualBlocks]
    .filter((event) => new Date(event.endTime).getTime() > new Date(currentTime).getTime());
}

export function buildDailyPlanPreview(plan: DailyMissionPlan | null | undefined) {
  if (!plan) return null;

  const template = getDailyPlanTemplate(plan.templateId);
  return {
    ...plan,
    templateName: template.name,
    templateDescription: template.description,
    energyMode: energyToMissionLevel(plan.energyLevel),
  };
}
