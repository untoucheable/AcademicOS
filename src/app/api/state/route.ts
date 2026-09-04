import { mergeWithDefaultState } from "@/lib/default-state";
import { getState, updateState } from "@/lib/server-state";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  return Response.json({
    state: getState(),
  });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const incoming = body.state || body;

    if (!isPlainObject(incoming)) {
      return Response.json(
        { error: "State payload must be an object." },
        { status: 400 },
      );
    }

    const nextState = mergeWithDefaultState(incoming);

    const updated = updateState(() => nextState);

    return Response.json({
      state: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "State update failed.";

    return Response.json(
      { error: message },
      { status: 500 },
    );
  }
}
