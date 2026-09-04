import { AcademicSourceProvider, SourceConfidence } from "./academic-core";

export type CalendarEventType =
  | "study"
  | "break"
  | "school"
  | "exercise"
  | "personal";

export type CalendarEvent = {
  id: string;
  title: string;
  type: CalendarEventType;
  startTime: string;
  endTime: string;
  externalId?: string;
  relatedAssignmentId?: string;
  relatedCourseId?: string;
  missionId?: string;
  fixed?: boolean;
  missionOnly?: boolean;
  priority: number;
  createdAt: string;
  source?: "ai" | "manual" | AcademicSourceProvider;
  confidence?: SourceConfidence;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function getCalendarEventDedupKey(event: Pick<CalendarEvent, "id" | "source" | "externalId">) {
  return `${event.source || "manual"}:${event.externalId || event.id}`;
}

export function dedupeCalendarEvents(events: CalendarEvent[]) {
  const seen = new Map<string, CalendarEvent>();

  for (const event of [...events].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime() ||
      normalize(a.title).localeCompare(normalize(b.title)),
  )) {
    const key = getCalendarEventDedupKey(event);
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, event);
      continue;
    }

    if (existing.fixed && !event.fixed) {
      continue;
    }

    if (!existing.fixed && event.fixed) {
      seen.set(key, event);
      continue;
    }

    if (existing.createdAt <= event.createdAt) {
      seen.set(key, event);
    }
  }

  return [...seen.values()].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime() ||
      new Date(a.endTime).getTime() - new Date(b.endTime).getTime() ||
      normalize(a.title).localeCompare(normalize(b.title)),
  );
}

export function ensureUniqueCalendarEventIds(events: CalendarEvent[]) {
  const seen = new Map<string, number>();

  return events.map((event) => {
    const currentCount = seen.get(event.id) || 0;
    const nextCount = currentCount + 1;
    seen.set(event.id, nextCount);

    if (currentCount === 0) {
      return event;
    }

    return {
      ...event,
      id: `${event.id}-${nextCount}`,
    };
  });
}

export function normalizeCalendarEvents(events: CalendarEvent[]) {
  return ensureUniqueCalendarEventIds(dedupeCalendarEvents(events));
}
