import {
  ingestAssignmentWithReview,
  ingestCalendarEventWithReview,
  ingestDocumentWithReview,
  ingestFromCommand,
} from "@/lib/intake-pipeline";
import { updateState } from "@/lib/server-state";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const kind = body.kind as string | undefined;

    if (typeof body.message === "string" && body.message.trim()) {
      const command = ingestFromCommand(body.message);
      return Response.json({ command });
    }

    if (kind === "assignment") {
      const result = await updateState((state) => ingestAssignmentWithReview(state, body.payload).state);
      return Response.json({
        state: result,
      });
    }

    if (kind === "calendar-event") {
      const result = await updateState((state) => ingestCalendarEventWithReview(state, body.payload).state);
      return Response.json({
        state: result,
      });
    }

    if (kind === "document") {
      const result = await updateState((state) => ingestDocumentWithReview(state, body.payload).state);
      return Response.json({
        state: result,
      });
    }

    return Response.json(
      { error: "kind or message is required." },
      { status: 400 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Intake failed.";

    return Response.json(
      { error: message },
      { status: 500 },
    );
  }
}
