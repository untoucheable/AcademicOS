import { NextResponse } from "next/server";

import { requireGoogleCalendarConfig } from "@/lib/google/config";
import { buildGoogleAuthorizationUrl, createGoogleOAuthState } from "@/lib/google/oauth";
import { setGoogleOAuthState } from "@/lib/google/store";

export async function GET() {
  try {
    const config = requireGoogleCalendarConfig();
    const state = createGoogleOAuthState();

    await setGoogleOAuthState(state);

    const response = NextResponse.redirect(buildGoogleAuthorizationUrl(config, state));
    response.cookies.set({
      name: "academic-os-google-oauth-state",
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to start Google OAuth.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
