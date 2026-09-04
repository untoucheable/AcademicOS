import { syncCalendarFollowUps } from "@/lib/calendar-followups";
import { updateState } from "@/lib/server-state";

export async function POST() {
  try {
    const now = new Date().toISOString();
    const updated = await updateState((state) => syncCalendarFollowUps(state, now));
    return Response.json({ items: updated.calendarFollowUpQueue, count: updated.calendarFollowUpQueue.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Calendar follow-up sync failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
