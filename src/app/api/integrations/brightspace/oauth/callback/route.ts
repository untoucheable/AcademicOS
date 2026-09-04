import { NextResponse } from "next/server";

import { requireBrightspaceConfig } from "@/lib/brightspace/config";
import { connectBrightspaceAccount } from "@/lib/brightspace/oauth";
import { clearBrightspaceOAuthState, validateBrightspaceOAuthState } from "@/lib/brightspace/store";

export async function GET(req: Request) {
  try {
    const config = requireBrightspaceConfig();
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return NextResponse.json({ error: `Brightspace authorization failed: ${error}` }, { status: 400 });
    }

    if (!code || !state) {
      return NextResponse.json({ error: "Missing Brightspace authorization code or state." }, { status: 400 });
    }

    if (!validateBrightspaceOAuthState(state)) {
      return NextResponse.json({ error: "Invalid Brightspace OAuth state." }, { status: 400 });
    }

    await connectBrightspaceAccount(config, code);
    clearBrightspaceOAuthState(state);

    return NextResponse.redirect(new URL("/integrations?brightspace=connected", url.origin));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Brightspace callback failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
