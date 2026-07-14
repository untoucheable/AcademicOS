import { importMockTeacherEmail } from "@/lib/integrations/mock-email";
import { updateState } from "@/lib/server-state";
import { syncIntegrationConnection } from "@/lib/sync-service";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const currentTime = body.currentTime || new Date().toISOString();
    const updated = updateState((state) =>
      syncIntegrationConnection(importMockTeacherEmail(state, currentTime), "gmail", "Mock email sync complete", 1, "success")
    );

    return Response.json({
      importedAssignments: updated.assignments.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Email import failed";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
