import { getState } from "@/lib/server-state";

export async function GET() {
  try {
    const state = await getState();
    return Response.json({ items: state.ingestionReviewQueue });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Review queue load failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
