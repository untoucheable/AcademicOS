import { getFollowUpLabel, resolveCalendarFollowUp } from "@/lib/calendar-followups";
import { getState, updateState } from "@/lib/server-state";

export async function GET() {
  const state = getState();

  return Response.json({
    items: state.calendarFollowUpQueue,
    count: state.calendarFollowUpQueue.length,
    labels: state.calendarFollowUpQueue.map((item) => ({
      id: item.id,
      label: getFollowUpLabel(item),
    })),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const followUpId = typeof body.followUpId === "string" ? body.followUpId : "";
    const action = body.action === "finished" || body.action === "reschedule" ? body.action : "";
    const currentTime = typeof body.currentTime === "string" ? body.currentTime : new Date().toISOString();

    if (!followUpId || !action) {
      return Response.json(
        { error: "followUpId and action are required." },
        { status: 400 },
      );
    }

    const updated = updateState((state) => resolveCalendarFollowUp(state, followUpId, action, currentTime));

    return Response.json({
      items: updated.calendarFollowUpQueue,
      calendar: updated.calendar,
      resolvedCount: updated.resolvedCalendarEventKeys.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Calendar follow-up update failed.";

    return Response.json(
      { error: message },
      { status: 500 },
    );
  }
}
