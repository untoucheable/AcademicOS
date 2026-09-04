import { NextResponse } from "next/server";

import { requireGoogleCalendarConfig } from "@/lib/google/config";
import { readGoogleCalendarTokens } from "@/lib/google/store";
import { getState } from "@/lib/server-state";

export async function GET() {
  try {
    requireGoogleCalendarConfig();

    const tokens = readGoogleCalendarTokens();
    const state = getState();
    const integration = state.integrations.find((item) => item.provider === "google-classroom");

    return NextResponse.json({
      connected: Boolean(tokens),
      accountEmail: tokens?.accountEmail || null,
      grantedScopes: tokens?.grantedScopes || [],
      lastSyncAt: integration?.lastSyncAt || null,
      tokenExpiryStatus: tokens ? (new Date(tokens.expiresAt).getTime() <= Date.now() ? "expired" : "valid") : "disconnected",
      tokenExpiresAt: tokens?.expiresAt || null,
      latestError: integration?.error || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Google Classroom status failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
