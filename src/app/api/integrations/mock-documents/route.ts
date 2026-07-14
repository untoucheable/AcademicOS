import { importMockDocument } from "@/lib/integrations/mock-documents";
import { updateState } from "@/lib/server-state";
import { syncIntegrationConnection } from "@/lib/sync-service";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const currentTime = body.currentTime || new Date().toISOString();
    const updated = updateState((state) =>
      syncIntegrationConnection(importMockDocument(state, currentTime), "google-drive", "Mock document sync complete", 1, "success")
    );

    return Response.json({
      importedDocuments: updated.documents.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Document import failed";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
