import { NextRequest, NextResponse } from "next/server";

import { requestMissionRebuild, syncGoogleCalendarRange } from "@/lib/google/sync";
import { requireGoogleCalendarConfig } from "@/lib/google/config";
import {
  clearGoogleOAuthState,
  validateGoogleOAuthState,
} from "@/lib/google/store";
import { connectGoogleCalendarAccount, markGoogleCalendarConnectionError } from "@/lib/google/oauth";
import { getState, updateState } from "@/lib/server-state";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");

  try {
    if (oauthError) {
      throw new Error(oauthErrorDescription || oauthError);
    }

    if (!code || !state) {
      throw new Error("Missing OAuth code or state.");
    }

    const cookieState = req.cookies.get("academic-os-google-oauth-state")?.value;
    const cookieMatches = Boolean(cookieState && cookieState === state);
    const storeMatches = validateGoogleOAuthState(state);

    if (!cookieMatches && !storeMatches) {
      throw new Error("Invalid OAuth state.");
    }

    const config = requireGoogleCalendarConfig();
    await connectGoogleCalendarAccount(config, code);

    const result = await syncGoogleCalendarRange(getState());
    updateState(() => result.state);
    await requestMissionRebuild(url.origin, config.defaultTimezone, "Google Calendar connected and synced.");

    clearGoogleOAuthState(state);

    const response = NextResponse.redirect(new URL("/integrations?google=connected", url.origin));
    response.cookies.set({
      name: "academic-os-google-oauth-state",
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Google OAuth callback failed.";
    try {
      markGoogleCalendarConnectionError(message);
    } catch {
      // Ignore secondary errors while recording the callback failure.
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
