import { AcademicSource, SourceConfidence } from "./academic-core";
import { Assignment, AssignmentPriority } from "./assignment";
import { CalendarEvent, CalendarEventType } from "./calendar";
import { SchoolDocument } from "./documents";
import { emitDomainEvent } from "./domain-events";
import { StudentState } from "./student-state";
import { syncAssignmentGraph, syncDocumentGraph } from "./sync-service";

type IngestedBase = {
  source: AcademicSource;
};

export type IngestedAssignment = IngestedBase & {
  title: string;
  course: string;
  subject?: string;
  dueDate: string;
  priority?: AssignmentPriority;
  notes?: string;
  description?: string;
  estimatedMinutes?: number;
};

export type IngestedCalendarEvent = IngestedBase & {
  title: string;
  type: CalendarEventType;
  startTime: string;
  endTime: string;
  priority?: number;
  relatedAssignmentId?: string;
};

export type IngestedDocument = IngestedBase & {
  title: string;
  type: SchoolDocument["type"];
  subject: string;
  content: string;
  tags?: string[];
};

export type IngestionReviewItem = {
  id: string;
  kind: "assignment" | "calendar-event" | "document";
  title: string;
  reason: string;
  confidence: SourceConfidence;
  payload: IngestedAssignment | IngestedCalendarEvent | IngestedDocument;
  createdAt: string;
};

function generateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function isSameAssignment(a: Assignment, b: IngestedAssignment) {
  const sameSource =
    a.source?.provider === b.source.provider &&
    a.source?.externalId &&
    a.source.externalId === b.source.externalId;

  return Boolean(
    sameSource ||
      (
        a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
        a.course.trim().toLowerCase() === b.course.trim().toLowerCase() &&
        a.dueDate === b.dueDate &&
        (a.subject || a.course).trim().toLowerCase() === (b.subject || b.course).trim().toLowerCase()
      )
  );
}

function isSameEvent(a: CalendarEvent, b: IngestedCalendarEvent) {
  const sameSource =
    a.confidence &&
    a.source === b.source.provider &&
    b.source.externalId &&
    a.id.includes(b.source.externalId);

  return Boolean(
    sameSource ||
      (
        a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
        a.startTime === b.startTime &&
        a.endTime === b.endTime &&
        (a.relatedAssignmentId || "") === (b.relatedAssignmentId || "")
      )
  );
}

export function ingestAssignment(state: StudentState, data: IngestedAssignment): StudentState {
  const now = new Date().toISOString();
  const existing = state.assignments.find((assignment) => isSameAssignment(assignment, data));
  const assignment: Assignment = {
    id: existing?.id || generateId("assignment"),
    title: data.title,
    course: data.course,
    subject: data.subject || data.course,
    description: data.description,
    notes: data.notes,
    dueDate: data.dueDate,
    priority: data.priority || "medium",
    status: existing?.status || "todo",
    completed: existing?.completed || false,
    estimatedMinutes: data.estimatedMinutes || existing?.estimatedMinutes,
    source: data.source,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const nextState = {
    ...state,
    assignments: existing
      ? state.assignments.map((item) => (item.id === existing.id ? assignment : item))
      : [...state.assignments, assignment],
  };

  emitDomainEvent(existing ? "assignment.updated" : "assignment.created", {
    assignmentId: assignment.id,
    title: assignment.title,
    course: assignment.course,
    source: assignment.source?.provider || "manual",
  });

  return syncAssignmentGraph(nextState, assignment);
}

export function ingestCalendarEvent(
  state: StudentState,
  data: IngestedCalendarEvent
): StudentState {
  const now = new Date().toISOString();
  const existing = state.calendar.find((event) => isSameEvent(event, data));
  const event: CalendarEvent = {
    id: existing?.id || generateId(`event-${data.source.externalId || data.source.provider}`),
    title: data.title,
    type: data.type,
    startTime: data.startTime,
    endTime: data.endTime,
    externalId: data.source.externalId,
    relatedAssignmentId: data.relatedAssignmentId,
    priority: data.priority || 5,
    createdAt: existing?.createdAt || now,
    source: data.source.provider,
    confidence: data.source.confidence,
    fixed: true,
  };

  emitDomainEvent(existing ? "calendar.event.updated" : "calendar.event.created", {
    calendarEventId: event.id,
    title: event.title,
    source: event.source,
  });

  return {
    ...state,
    calendar: existing
      ? state.calendar.map((item) => (item.id === existing.id ? event : item))
      : [...state.calendar, event],
  };
}

export function ingestDocument(state: StudentState, data: IngestedDocument): StudentState {
  const now = new Date().toISOString();
  const existing = state.documents.find(
    (document) =>
      document.source?.provider === data.source.provider &&
      document.source.externalId &&
      document.source.externalId === data.source.externalId
  );
  const document: SchoolDocument = {
    id: existing?.id || generateId("document"),
    title: data.title,
    type: data.type,
    subject: data.subject,
    content: data.content,
    uploadedAt: existing?.uploadedAt || now,
    lastUsedAt: existing?.lastUsedAt,
    tags: data.tags,
    ingestionStatus: "ready",
    generatedStudyMaterial: existing?.generatedStudyMaterial,
    source: data.source,
  };

  const nextState = {
    ...state,
    documents: existing
      ? state.documents.map((item) => (item.id === existing.id ? document : item))
      : [...state.documents, document],
  };

  return syncDocumentGraph(nextState, document);
}

export function createReviewItem(
  title: string,
  reason: string,
  payload: IngestionReviewItem["payload"]
) {
  return {
    id: generateId("review"),
    kind: "dueDate" in payload ? "assignment" as const : "startTime" in payload ? "calendar-event" as const : "document" as const,
    title,
    reason,
    confidence: payload.source.confidence,
    payload,
    createdAt: new Date().toISOString(),
  };
}

export function approveReviewItem(state: StudentState, reviewId: string): StudentState {
  const item = state.ingestionReviewQueue.find((review) => review.id === reviewId);
  if (!item) return state;

  const stateWithoutReview = {
    ...state,
    ingestionReviewQueue: state.ingestionReviewQueue.filter((review) => review.id !== reviewId),
  };

  if (item.kind === "assignment") {
    const nextState = ingestAssignment(stateWithoutReview, item.payload as IngestedAssignment);
    emitDomainEvent("review.item.approved", { reviewId, kind: item.kind });
    return nextState;
  }

  if (item.kind === "calendar-event") {
    const nextState = ingestCalendarEvent(stateWithoutReview, item.payload as IngestedCalendarEvent);
    emitDomainEvent("review.item.approved", { reviewId, kind: item.kind });
    return nextState;
  }

  const nextState = ingestDocument(stateWithoutReview, item.payload as IngestedDocument);
  emitDomainEvent("review.item.approved", { reviewId, kind: item.kind });
  return nextState;
}

export function dismissReviewItem(state: StudentState, reviewId: string): StudentState {
  emitDomainEvent("review.item.dismissed", { reviewId });
  return {
    ...state,
    ingestionReviewQueue: state.ingestionReviewQueue.filter((review) => review.id !== reviewId),
  };
}
