import { getState } from "@/lib/server-state";

export async function GET() {
  const state = getState();

  return Response.json({
    items: state.ingestionReviewQueue,
  });
}
