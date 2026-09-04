import { NextResponse } from "next/server";

import { requestMissionRebuild, syncGoogleCalendarRange } from "@/lib/google/sync";
import { requireGoogleCalendarConfig } from "@/lib/google/config";
import { markGoogleCalendarConnectionError } from "@/lib/google/oauth";
import { getState, updateState } from "@/lib/server-state";

export async function POST(req: Request) {
  try {
    const config = requireGoogleCalendarConfig();
    const body = await req.json().catch(() => ({}));
    const timeMin = typeof body.timeMin === "string" ? body.timeMin : undefined;
    const timeMax = typeof body.timeMax === "string" ? body.timeMax : undefined;
    const result = await syncGoogleCalendarRange(await getState(), { timeMin, timeMax });

    await updateState(() => result.state);
    await requestMissionRebuild(new URL(req.url).origin, config.defaultTimezone, "Google Calendar import completed.");

    return NextResponse.json({
      summary: result.summary,
      connectionError: result.connectionError || null,
      integration: result.state.integrations.find((item) => item.provider === "google-calendar") || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Google Calendar sync failed.";
    try {
      await markGoogleCalendarConnectionError(message);
    } catch {
      // Ignore secondary error reporting failures.
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
