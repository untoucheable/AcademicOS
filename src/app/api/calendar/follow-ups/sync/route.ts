import { syncCalendarFollowUps } from "@/lib/calendar-followups";
import { updateState } from "@/lib/server-state";

export async function POST() {
  const now = new Date().toISOString();
  const updated = updateState((state) => syncCalendarFollowUps(state, now));

  return Response.json({
    items: updated.calendarFollowUpQueue,
    count: updated.calendarFollowUpQueue.length,
  });
}
