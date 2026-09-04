import type { CalendarEvent } from "./calendar";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function calendarEventSignature(event: Pick<CalendarEvent, "title" | "startTime" | "endTime" | "type">) {
  return [normalize(event.title), event.startTime, event.endTime, event.type].join("|");
}
