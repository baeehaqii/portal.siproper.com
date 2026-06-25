import { NextRequest, NextResponse } from "next/server";
import { redeemHandoffCode, handoffSecret } from "@/lib/handoff";

// Back-channel: sys2 calls this to redeem a one-time handoff code for the user's
// sub. Authenticated by a shared secret so only sys2 can redeem.
export async function POST(req: NextRequest) {
  if (!handoffSecret || req.headers.get("x-sso-handoff-secret") !== handoffSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const sub = body.code ? await redeemHandoffCode(body.code) : null;
  if (!sub) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }
  return NextResponse.json({ sub });
}
