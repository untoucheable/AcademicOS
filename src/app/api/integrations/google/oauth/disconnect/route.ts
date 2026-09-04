import { NextResponse } from "next/server";

import { disconnectGoogleCalendarAccount } from "@/lib/google/oauth";
import { requireGoogleCalendarConfig } from "@/lib/google/config";
import { getState, updateState } from "@/lib/server-state";
import { syncIntegrationConnection } from "@/lib/sync-service";

export async function POST() {
  try {
    const config = requireGoogleCalendarConfig();
    const state = await getState();

    const tokensCleared = await disconnectGoogleCalendarAccount(config);

    const nextState = await updateState((current) =>
      syncIntegrationConnection(
        {
          ...current,
          calendar: current.calendar.map((event) =>
            event.source === "ai" ? { ...event, externalId: undefined } : event,
          ),
        },
        "google-calendar",
        "Google Calendar disconnected",
        0,
        "success",
        false,
      ),
    );

    return NextResponse.json({
      disconnected: true,
      redirectUri: tokensCleared.redirectUri,
      integration: nextState.integrations.find((item) => item.provider === "google-calendar") || null,
      currentCalendarItems: state.calendar.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Google Calendar disconnect failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
