import { NextResponse } from "next/server";

import { requireGoogleCalendarConfig } from "@/lib/google/config";
import {
  getGoogleCalendarConnection,
  getGoogleCalendarTokenExpiryStatus,
} from "@/lib/google/oauth";
import { readGoogleCalendarTokens } from "@/lib/google/store";

export async function GET() {
  try {
    requireGoogleCalendarConfig();

    const connection = await getGoogleCalendarConnection();
    const tokens = await readGoogleCalendarTokens();
    const connected = Boolean(tokens && connection?.connected);

    return NextResponse.json({
      connected,
      accountEmail: connection?.accountEmail || tokens?.accountEmail || null,
      grantedScopes: connection?.grantedScopes || tokens?.grantedScopes || [],
      lastSyncAt: connection?.lastSyncAt || null,
      tokenExpiryStatus: await getGoogleCalendarTokenExpiryStatus(),
      tokenExpiresAt: connection?.tokenExpiresAt || tokens?.expiresAt || null,
      latestError: connection?.latestError || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Google Calendar status failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
