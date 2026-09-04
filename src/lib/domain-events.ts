import { appendDomainEvent, readDatabase } from "./database";

export type DomainEventType =
  | "assignment.created"
  | "assignment.updated"
  | "assignment.completed"
  | "calendar.event.created"
  | "calendar.event.updated"
  | "grade.recorded"
  | "document.imported"
  | "integration.synced"
  | "status.energy.updated"
  | "mission.regeneration.requested"
  | "mission.generated"
  | "review.item.approved"
  | "review.item.dismissed";

export type DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  type: DomainEventType;
  occurredAt: string;
  payload: TPayload;
};

type EventHandler = (event: DomainEvent) => void;

const handlers = new Set<EventHandler>();

export function onDomainEvent(handler: EventHandler) {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emitDomainEvent<TPayload extends Record<string, unknown>>(
  type: DomainEventType,
  payload: TPayload,
) {
  const event: DomainEvent<TPayload> = {
    id: crypto.randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    payload,
  };

  appendDomainEvent(event);

  for (const handler of handlers) {
    handler(event);
  }

  return event;
}

export function readDomainEvents() {
  return readDatabase().events;
}

