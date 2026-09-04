import { NextResponse } from "next/server";

import { requireBrightspaceConfig } from "@/lib/brightspace/config";
import { buildBrightspaceAuthorizationUrl, createBrightspaceOAuthState } from "@/lib/brightspace/oauth";
import { setBrightspaceOAuthState } from "@/lib/brightspace/store";

export async function GET() {
  try {
    const config = requireBrightspaceConfig();
    const state = createBrightspaceOAuthState();
    setBrightspaceOAuthState(state);

    return NextResponse.redirect(buildBrightspaceAuthorizationUrl(config, state));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Brightspace authorization failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
