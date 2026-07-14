import { approveReviewItem, dismissReviewItem } from "@/lib/ingestion";
import { updateState } from "@/lib/server-state";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  try {
    const { reviewId } = await params;
    const { action } = await req.json();

    if (action !== "approve" && action !== "dismiss") {
      return Response.json(
        { error: "Action must be approve or dismiss." },
        { status: 400 }
      );
    }

    const updated = updateState((state) =>
      action === "approve"
        ? approveReviewItem(state, reviewId)
        : dismissReviewItem(state, reviewId)
    );

    return Response.json({
      items: updated.ingestionReviewQueue,
      assignments: updated.assignments,
      calendar: updated.calendar,
      documents: updated.documents,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Review action failed";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
