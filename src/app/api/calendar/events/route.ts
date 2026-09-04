import { removeCalendarEventById } from "@/lib/calendar-actions";
import { dedupeCalendarEvents } from "@/lib/calendar";
import { getState, updateState } from "@/lib/server-state";

export async function GET() {
  const state = getState();

  return Response.json({
    events: dedupeCalendarEvents(state.calendar),
  });
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
