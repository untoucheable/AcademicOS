import { CalendarEvent } from "./calendar";
import { sortMission } from "./mission";
import { StudentState } from "./student-state";

export type EventRemovalResult = {
  state: StudentState;
  removedEvents: CalendarEvent[];
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isProtectedExternalEvent(event: CalendarEvent) {
  return Boolean(event.fixed && event.source !== "ai" && event.source !== "manual");
}

export function removeCalendarEventById(
  state: StudentState,
  eventId: string
): EventRemovalResult {
  const target = state.calendar.find((event) => event.id === eventId);
  if (!target || isProtectedExternalEvent(target)) {
    return {
      state,
      removedEvents: [],
    };
  }

  const removedEvents = state.calendar.filter((event) => event.id === eventId);
  const removedTitles = new Set(removedEvents.map((event) => normalize(event.title)));

  return {
    removedEvents,
    state: {
      ...state,
      calendar: state.calendar.filter((event) => event.id !== eventId),
      currentMission: state.currentMission
        ? sortMission({
            ...state.currentMission,
            schedule: state.currentMission.schedule.filter(
              (event) => event.id !== eventId && !removedTitles.has(normalize(event.title))
            ),
          })
        : state.currentMission,
    },
  };
}

export function removeCalendarEventsByTitle(
  state: StudentState,
  titleQuery: string
): EventRemovalResult {
  const query = normalize(titleQuery);

  if (!query) {
    return {
      state,
      removedEvents: [],
    };
  }

  const removedEvents = state.calendar.filter(
    (event) => normalize(event.title).includes(query) && !isProtectedExternalEvent(event)
  );
  const removedTitles = new Set(removedEvents.map((event) => normalize(event.title)));

  return {
    removedEvents,
    state: {
      ...state,
      calendar: state.calendar.filter((event) => !normalize(event.title).includes(query)),
      currentMission: state.currentMission
        ? sortMission({
            ...state.currentMission,
            schedule: state.currentMission.schedule.filter(
              (event) => !removedTitles.has(normalize(event.title))
            ),
          })
        : state.currentMission,
    },
  };
}
