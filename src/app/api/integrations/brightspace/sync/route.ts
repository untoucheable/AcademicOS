import { NextResponse } from "next/server";

import { requireBrightspaceConfig } from "@/lib/brightspace/config";
import { ensureFreshBrightspaceTokens, markBrightspaceConnectionError } from "@/lib/brightspace/oauth";
import { syncBrightspaceState } from "@/lib/brightspace/sync";
import { requestMissionRebuild } from "@/lib/google/sync";
import { getState, updateState } from "@/lib/server-state";

export async function POST(req: Request) {
  try {
    const config = requireBrightspaceConfig();
    const tokens = await ensureFreshBrightspaceTokens(config);
    const result = await syncBrightspaceState(getState(), tokens.accessToken);

    updateState(() => result.state);
    await requestMissionRebuild(
      new URL(req.url).origin,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      "Brightspace import completed."
    );

    return NextResponse.json({
      summary: result.summary,
      integration: result.state.integrations.find((item) => item.provider === "brightspace") || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Brightspace sync failed.";
    try {
      markBrightspaceConnectionError(message);
    } catch {
      // Ignore secondary failures.
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
