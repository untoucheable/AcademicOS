import { NextResponse } from "next/server";

import { disconnectBrightspaceAccount } from "@/lib/brightspace/oauth";

export async function POST() {
  try {
    const result = await disconnectBrightspaceAccount();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Brightspace disconnect failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
