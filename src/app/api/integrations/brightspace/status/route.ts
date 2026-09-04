import { NextResponse } from "next/server";

import { requireBrightspaceConfig } from "@/lib/brightspace/config";
import { getBrightspaceConnection, getBrightspaceTokenExpiryStatus } from "@/lib/brightspace/oauth";
import { readBrightspaceTokens } from "@/lib/brightspace/store";

export async function GET() {
  try {
    requireBrightspaceConfig();

    const connection = getBrightspaceConnection();
    const tokens = readBrightspaceTokens();
    const connected = Boolean(tokens && connection?.connected);

    return NextResponse.json({
      connected,
      accountEmail: connection?.accountEmail || tokens?.accountEmail || null,
      accountName: connection?.accountName || tokens?.accountName || null,
      grantedScopes: connection?.grantedScopes || tokens?.grantedScopes || [],
      lastSyncAt: connection?.lastSyncAt || null,
      tokenExpiryStatus: getBrightspaceTokenExpiryStatus(),
      tokenExpiresAt: connection?.tokenExpiresAt || tokens?.expiresAt || null,
      latestError: connection?.latestError || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Brightspace status failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
