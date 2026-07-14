import { importMockClassroom } from "@/lib/integrations/mock-classroom";
import { updateState } from "@/lib/server-state";
import { syncIntegrationConnection } from "@/lib/sync-service";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const currentTime = body.currentTime || new Date().toISOString();
    const next = updateState((state) =>
      syncIntegrationConnection(
        importMockClassroom(state, currentTime),
        "google-classroom",
        "Mock classroom sync complete",
        3,
        "success",
      )
    );

    return Response.json({
      importedAssignments: next.assignments.length,
      importedCalendarEvents: next.calendar.filter((event) => event.source !== "ai").length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Import failed";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
