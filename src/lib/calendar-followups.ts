import { dedupeCalendarEvents } from "./calendar";
import type { CalendarEvent } from "./calendar";
import type { StudentState } from "./student-state";

export type CalendarFollowUpAction = "finished" | "reschedule";

export type CalendarFollowUpItem = {
  id: string;
  eventKey: string;
  eventId: string;
  title: string;
  source?: CalendarEvent["source"];
  externalId?: string;
  originalStartTime: string;
  originalEndTime: string;
  createdAt: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function getCalendarEventKey(event: Pick<CalendarEvent, "id" | "externalId" | "source">) {
  return `${event.source || "manual"}:${event.externalId || event.id}`;
}

function getResolvedEventKeys(state: StudentState) {
  return new Set(state.resolvedCalendarEventKeys || []);
}

function getFollowUpItemId(event: CalendarEvent) {
  return `followup:${getCalendarEventKey(event)}`;
}

function isFollowUpEligible(event: CalendarEvent) {
  if (event.source === "ai") return false;
  if (event.type === "break") return false;
  return true;
}

function isPastEvent(event: CalendarEvent, currentTime: string) {
  return new Date(event.endTime).getTime() < new Date(currentTime).getTime();
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function findNextOpenStart(start: Date, minutes: number, events: CalendarEvent[]) {
  let cursor = new Date(start);

  for (let attempt = 0; attempt < 72; attempt += 1) {
    const end = addMinutes(cursor, minutes);
    const conflict = events.find((event) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return cursor < eventEnd && end > eventStart;
    });

    if (!conflict) return cursor;
    cursor = addMinutes(new Date(conflict.endTime), 10);
  }

  return cursor;
}

export function syncCalendarFollowUps(state: StudentState, currentTime: string) {
  const resolvedKeys = getResolvedEventKeys(state);
  const now = new Date(currentTime);
  const eligibleEvents = dedupeCalendarEvents(state.calendar)
    .filter(isFollowUpEligible)
    .filter((event) => isPastEvent(event, currentTime));

  const nextQueue = [...state.calendarFollowUpQueue];
  const existingIds = new Set(nextQueue.map((item) => item.id));

  for (const event of eligibleEvents) {
    const eventKey = getCalendarEventKey(event);
    if (resolvedKeys.has(eventKey)) continue;

    const itemId = getFollowUpItemId(event);
    if (existingIds.has(itemId)) continue;

    nextQueue.push({
      id: itemId,
      eventKey,
      eventId: event.id,
      title: event.title,
      source: event.source,
      externalId: event.externalId,
      originalStartTime: event.startTime,
      originalEndTime: event.endTime,
      createdAt: now.toISOString(),
    });
    existingIds.add(itemId);
  }

  return {
    ...state,
    calendarFollowUpQueue: nextQueue.sort(
      (a, b) => new Date(a.originalEndTime).getTime() - new Date(b.originalEndTime).getTime(),
    ),
  };
}

export function resolveCalendarFollowUp(
  state: StudentState,
  followUpId: string,
  action: CalendarFollowUpAction,
  currentTime: string,
) {
  const item = state.calendarFollowUpQueue.find((entry) => entry.id === followUpId);
  if (!item) return state;

  const resolvedKeys = new Set(state.resolvedCalendarEventKeys || []);
  resolvedKeys.add(item.eventKey);

  const remainingQueue = state.calendarFollowUpQueue.filter((entry) => entry.id !== followUpId);
  const targetEvent = state.calendar.find((event) => event.id === item.eventId || getCalendarEventKey(event) === item.eventKey);

  if (action === "finished") {
    return {
      ...state,
      calendar: state.calendar.filter(
        (event) => event.id !== item.eventId && getCalendarEventKey(event) !== item.eventKey,
      ),
      calendarFollowUpQueue: remainingQueue,
      resolvedCalendarEventKeys: [...resolvedKeys],
    };
  }

  if (!targetEvent) {
    return {
      ...state,
      calendarFollowUpQueue: remainingQueue,
      resolvedCalendarEventKeys: [...resolvedKeys],
    };
  }

  const durationMinutes = Math.max(
    15,
    Math.round((new Date(targetEvent.endTime).getTime() - new Date(targetEvent.startTime).getTime()) / 60000) || 45,
  );
  const start = findNextOpenStart(new Date(currentTime), durationMinutes, state.calendar);
  const end = addMinutes(start, durationMinutes);

  const rescheduledEvent: CalendarEvent = {
    ...targetEvent,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    fixed: true,
  };

  const remainingCalendar = state.calendar.map((event) =>
    event.id === targetEvent.id ? rescheduledEvent : event,
  );

  return {
    ...state,
    calendar: remainingCalendar,
    calendarFollowUpQueue: remainingQueue,
    resolvedCalendarEventKeys: [...resolvedKeys],
  };
}

export function getFollowUpLabel(item: CalendarFollowUpItem) {
  const date = new Date(item.originalStartTime);
  return `${item.title} on ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function isSameFollowUpTitle(a: CalendarFollowUpItem, b: CalendarFollowUpItem) {
  return normalize(a.title) === normalize(b.title) && a.eventKey === b.eventKey;
}
