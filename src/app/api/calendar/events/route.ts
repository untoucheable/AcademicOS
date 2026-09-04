import crypto from "node:crypto";

import { normalizeCalendarEvents, type CalendarEventType } from "@/lib/calendar";
import { removeCalendarEventById } from "@/lib/calendar-actions";
import { getState, updateState } from "@/lib/server-state";

export async function GET() {
  const state = getState();

  return Response.json({
    events: state.calendar,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const startTime = typeof body.startTime === "string" ? body.startTime : "";
    const endTime = typeof body.endTime === "string" ? body.endTime : "";
    const type = ["study", "break", "school", "exercise", "personal"].includes(body.type)
      ? (body.type as CalendarEventType)
      : "personal";
    const relatedAssignmentId =
      typeof body.relatedAssignmentId === "string" && body.relatedAssignmentId.trim()
        ? body.relatedAssignmentId.trim()
        : undefined;

    if (!title || !startTime || !endTime) {
      return Response.json(
        { error: "title, startTime, and endTime are required." },
        { status: 400 },
      );
    }

    if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
      return Response.json(
        { error: "endTime must be after startTime." },
        { status: 400 },
      );
    }

    const event = {
      id: `manual-event:${crypto.randomUUID()}`,
      title,
      type,
      startTime,
      endTime,
      relatedAssignmentId,
      priority: 10,
      createdAt: new Date().toISOString(),
      source: "manual" as const,
      fixed: true,
    };

    const updated = updateState((state) => ({
      ...state,
      calendar: normalizeCalendarEvents([...state.calendar, event]),
    }));

    return Response.json({
      event,
      events: updated.calendar,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Event creation failed.";

    return Response.json(
      { error: message },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { eventId } = await req.json();

    if (!eventId || typeof eventId !== "string") {
      return Response.json(
        { error: "eventId is required." },
        { status: 400 }
      );
    }

    const existing = getState().calendar.find((event) => event.id === eventId);
    let removedCount = 0;
    const updated = updateState((state) => {
      const result = removeCalendarEventById(state, eventId);
      removedCount = result.removedEvents.length;
      return result.state;
    });

    if (!removedCount && existing) {
      return Response.json(
        { error: "This calendar event is managed externally and cannot be removed directly." },
        { status: 403 }
      );
    }

    return Response.json({
      removedCount,
      mission: updated.currentMission,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Event removal failed.";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
