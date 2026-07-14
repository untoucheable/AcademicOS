import { importMockWebsiteScan } from "@/lib/integrations/mock-website-scan";
import { updateState } from "@/lib/server-state";
import { syncIntegrationConnection } from "@/lib/sync-service";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const currentTime = body.currentTime || new Date().toISOString();
    const updated = updateState((state) =>
      syncIntegrationConnection(importMockWebsiteScan(state, currentTime), "website-scanner", "Mock website scan complete", 1, "success")
    );

    return Response.json({
      reviewItems: updated.ingestionReviewQueue.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Website scan failed";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
