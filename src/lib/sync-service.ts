import { Assignment } from "./assignment";
import { CalendarEvent } from "./calendar";
import { emitDomainEvent } from "./domain-events";
import { SchoolDocument } from "./documents";
import { IntegrationConnection, Course } from "./academic-graph";
import { StudentState } from "./student-state";
import { generateId } from "./storage/helpers";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function ensureSubject(state: StudentState, subject: string): StudentState {
  const normalized = subject.trim();
  if (!normalized) return state;

  if (state.profile.subjects.some((item) => normalize(item) === normalize(normalized))) {
    return state;
  }

  return {
    ...state,
    profile: {
      ...state.profile,
      subjects: [...state.profile.subjects, normalized],
    },
  };
}

function buildDeadlineEvent(assignment: Assignment): CalendarEvent {
  const sourceProvider = assignment.source?.provider || "manual";

  return {
    id: `deadline-${assignment.id}`,
    title: `${assignment.title} deadline`,
    type: "school",
    startTime: assignment.dueDate,
    endTime: assignment.dueDate,
    relatedAssignmentId: assignment.id,
    relatedCourseId: assignment.courseId || assignment.course,
    fixed: true,
    priority: assignment.priority === "high" ? 10 : assignment.priority === "medium" ? 7 : 5,
    createdAt: assignment.updatedAt,
    source: sourceProvider,
  };
}

function buildPrepBlock(assignment: Assignment): CalendarEvent | null {
  const due = new Date(assignment.dueDate);
  if (Number.isNaN(due.getTime())) return null;

  const prepStart = new Date(due);
  prepStart.setDate(prepStart.getDate() - 1);
  prepStart.setHours(17, 0, 0, 0);
  const prepEnd = new Date(prepStart.getTime() + 45 * 60 * 1000);

  return {
    id: `prep-${assignment.id}`,
    title: `${assignment.title} prep`,
    type: "study",
    startTime: prepStart.toISOString(),
    endTime: prepEnd.toISOString(),
    relatedAssignmentId: assignment.id,
    relatedCourseId: assignment.courseId || assignment.course,
    fixed: false,
    priority: assignment.priority === "high" ? 9 : 6,
    createdAt: assignment.updatedAt,
    source: "ai",
  };
}

function upsertCalendarEvent(events: CalendarEvent[], nextEvent: CalendarEvent) {
  const existingIndex = events.findIndex((event) => event.id === nextEvent.id);
  if (existingIndex >= 0) {
    return events.map((event) => (event.id === nextEvent.id ? nextEvent : event));
  }
  return [...events, nextEvent];
}

export function syncAssignmentGraph(state: StudentState, assignment: Assignment) {
  let nextState = ensureSubject(state, assignment.course || assignment.subject || "");
  const deadlineEvent = buildDeadlineEvent(assignment);
  const prepBlock = buildPrepBlock(assignment);

  nextState = {
    ...nextState,
    assignments: nextState.assignments.map((item) => (item.id === assignment.id ? assignment : item)),
    calendar: upsertCalendarEvent(nextState.calendar, deadlineEvent),
  };

  if (prepBlock && !assignment.completed) {
    nextState = {
      ...nextState,
      calendar: upsertCalendarEvent(nextState.calendar, prepBlock),
    };
  }

  if (assignment.completed) {
    nextState = {
      ...nextState,
      calendar: nextState.calendar.filter((event) => event.id !== `prep-${assignment.id}`),
    };
  }

  emitDomainEvent("calendar.event.updated", {
    assignmentId: assignment.id,
    deadlineEventId: deadlineEvent.id,
  });
  emitDomainEvent("mission.regeneration.requested", {
    reason: `Assignment synced: ${assignment.title}`,
    assignmentId: assignment.id,
  });

  return nextState;
}

export function syncDocumentGraph(state: StudentState, document: SchoolDocument) {
  const nextState = ensureSubject(state, document.subject);

  emitDomainEvent("document.imported", {
    documentId: document.id,
    subject: document.subject,
    source: document.source?.provider || "manual",
  });
  emitDomainEvent("mission.regeneration.requested", {
    reason: `Document synced: ${document.title}`,
    documentId: document.id,
  });

  return nextState;
}

export function syncIntegrationConnection(
  state: StudentState,
  provider: string,
  summary: string,
  itemCount: number,
  status: "success" | "error" = "success",
  connected = true,
) {
  const record = {
    id: generateId(),
    syncedAt: new Date().toISOString(),
    status,
    summary,
    itemCount,
  };

  const existing = state.integrations.find((item) => item.provider === provider);
  const nextConnection: IntegrationConnection = {
    provider,
    connected,
    lastSyncAt: record.syncedAt,
    syncStatus: status,
    permissions: existing?.permissions || [],
    importedItemCount: (existing?.importedItemCount || 0) + itemCount,
    error: status === "error" ? summary : undefined,
    syncHistory: [record, ...(existing?.syncHistory || [])].slice(0, 10),
  };

  emitDomainEvent("integration.synced", {
    provider,
    status,
    itemCount,
    summary,
  });

  return {
    ...state,
    integrations: [
      ...state.integrations.filter((item) => item.provider !== provider),
      nextConnection,
    ],
  };
}

export function syncCourseArtifacts(state: StudentState, course: Course) {
  return ensureSubject(state, course.subject);
}
