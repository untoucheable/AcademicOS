import type { Assignment } from "@/lib/assignment";
import type { CalendarEvent } from "@/lib/calendar";
import type { SchoolDocument } from "@/lib/documents";
import { classifyAcademicMessage } from "@/lib/command-center";
import {
  createReviewItem,
  ingestAssignment,
  ingestCalendarEvent,
  ingestDocument,
  type IngestionReviewItem,
  type IngestedAssignment,
  type IngestedCalendarEvent,
  type IngestedDocument,
} from "@/lib/ingestion";
import type { SourceConfidence } from "@/lib/academic-core";
import type { StudentState } from "@/lib/student-state";

type IntakeKind = "assignment" | "calendar-event" | "document";

export type IntakeOutcome =
  | { outcome: "imported"; kind: IntakeKind; id: string }
  | { outcome: "review"; kind: IntakeKind; reviewId: string }
  | { outcome: "classified"; commandType: ReturnType<typeof classifyAcademicMessage>["type"] };

const DEFAULT_REVIEW_THRESHOLD = 0.8;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isSameAssignment(existing: Assignment, incoming: IngestedAssignment) {
  return Boolean(
    existing.source?.provider === incoming.source.provider &&
      existing.source.externalId &&
      existing.source.externalId === incoming.source.externalId,
  ) || Boolean(
    normalize(existing.title) === normalize(incoming.title) &&
      normalize(existing.course) === normalize(incoming.course) &&
      existing.dueDate === incoming.dueDate,
  );
}

function isSameCalendarEvent(existing: CalendarEvent, incoming: IngestedCalendarEvent) {
  return Boolean(
    existing.externalId &&
      incoming.source.externalId &&
      existing.source === incoming.source.provider &&
      existing.externalId === incoming.source.externalId,
  ) || Boolean(
    normalize(existing.title) === normalize(incoming.title) &&
      existing.startTime === incoming.startTime &&
      existing.endTime === incoming.endTime &&
      (existing.relatedAssignmentId || "") === (incoming.relatedAssignmentId || ""),
  );
}

function isSameDocument(existing: SchoolDocument, incoming: IngestedDocument) {
  return Boolean(
    existing.source?.provider === incoming.source.provider &&
      existing.source.externalId &&
      existing.source.externalId === incoming.source.externalId,
  ) || Boolean(
    normalize(existing.title) === normalize(incoming.title) &&
      normalize(existing.subject) === normalize(incoming.subject) &&
      existing.content.slice(0, 120).trim() === incoming.content.slice(0, 120).trim(),
  );
}

function shouldReview(confidence: SourceConfidence, threshold = DEFAULT_REVIEW_THRESHOLD) {
  return confidence.needsConfirmation || confidence.score < threshold;
}

function upsertReviewItem(state: StudentState, item: IngestionReviewItem) {
  const targetExternalId = item.payload.source.externalId;
  const filtered = state.ingestionReviewQueue.filter((existing) => {
    const existingExternalId = existing.payload.source.externalId;
    if (targetExternalId && existingExternalId) {
      return !(
        existing.kind === item.kind &&
        existing.payload.source.provider === item.payload.source.provider &&
        existingExternalId === targetExternalId
      );
    }

    return !(
      existing.kind === item.kind &&
      normalize(existing.title) === normalize(item.title) &&
      existing.payload.source.provider === item.payload.source.provider
    );
  });

  return {
    ...state,
    ingestionReviewQueue: [item, ...filtered],
  };
}

function queueCandidate(
  state: StudentState,
  title: string,
  reason: string,
  payload: IngestedAssignment | IngestedCalendarEvent | IngestedDocument,
) {
  return upsertReviewItem(state, createReviewItem(title, reason, payload));
}

export function ingestAssignmentWithReview(state: StudentState, data: IngestedAssignment) {
  const existing = state.assignments.find((assignment) => isSameAssignment(assignment, data));
  if (existing) {
    const next = ingestAssignment(state, data);
    return { state: next, imported: true as const, duplicate: true as const, id: existing.id };
  }

  if (shouldReview(data.source.confidence)) {
    const queued = queueCandidate(state, data.title, data.source.confidence.reason, data);
    return {
      state: queued,
      imported: false as const,
      reviewId: queued.ingestionReviewQueue[0]?.id || "",
    };
  }

  const next = ingestAssignment(state, data);
  return {
    state: next,
    imported: true as const,
    duplicate: false as const,
    id: next.assignments.find((assignment) => isSameAssignment(assignment, data))?.id || "",
  };
}

export function ingestCalendarEventWithReview(state: StudentState, data: IngestedCalendarEvent) {
  const existing = state.calendar.find((event) => isSameCalendarEvent(event, data));
  if (existing) {
    const next = ingestCalendarEvent(state, data);
    return { state: next, imported: true as const, duplicate: true as const, id: existing.id };
  }

  if (shouldReview(data.source.confidence)) {
    const queued = queueCandidate(state, data.title, data.source.confidence.reason, data);
    return {
      state: queued,
      imported: false as const,
      reviewId: queued.ingestionReviewQueue[0]?.id || "",
    };
  }

  const next = ingestCalendarEvent(state, data);
  return {
    state: next,
    imported: true as const,
    duplicate: false as const,
    id: next.calendar.find((event) => isSameCalendarEvent(event, data))?.id || "",
  };
}

export function ingestDocumentWithReview(state: StudentState, data: IngestedDocument) {
  const existing = state.documents.find((document) => isSameDocument(document, data));
  if (existing) {
    const next = ingestDocument(state, data);
    return { state: next, imported: true as const, duplicate: true as const, id: existing.id };
  }

  if (shouldReview(data.source.confidence)) {
    const queued = queueCandidate(state, data.title, data.source.confidence.reason, data);
    return {
      state: queued,
      imported: false as const,
      reviewId: queued.ingestionReviewQueue[0]?.id || "",
    };
  }

  const next = ingestDocument(state, data);
  return {
    state: next,
    imported: true as const,
    duplicate: false as const,
    id: next.documents.find((document) => isSameDocument(document, data))?.id || "",
  };
}

export function ingestFromCommand(input: string) {
  return classifyAcademicMessage(input);
}
