import { NextResponse } from "next/server";

import { requireGoogleCalendarConfig } from "@/lib/google/config";
import { ensureFreshGoogleCalendarTokens } from "@/lib/google/oauth";
import { syncGoogleClassroomState } from "@/lib/google/classroom";
import { requestMissionRebuild } from "@/lib/google/sync";
import { getState, updateState } from "@/lib/server-state";

export async function POST(req: Request) {
  try {
    const config = requireGoogleCalendarConfig();
    const tokens = await ensureFreshGoogleCalendarTokens(config);
    const result = await syncGoogleClassroomState(getState(), tokens.accessToken);

    updateState(() => result.state);
    await requestMissionRebuild(new URL(req.url).origin, config.defaultTimezone, "Google Classroom import completed.");

    return NextResponse.json({
      summary: result.summary,
      integration: result.state.integrations.find((item) => item.provider === "google-classroom") || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Google Classroom sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
