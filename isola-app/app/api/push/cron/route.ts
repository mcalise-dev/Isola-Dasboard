// Daily Vercel cron: queues COI expiry alerts (inside push_outbox) and delivers anything waiting.
// Vercel sends "Authorization: Bearer $CRON_SECRET" automatically when CRON_SECRET is set.
import { NextResponse, type NextRequest } from "next/server";
import { flushPush } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await flushPush());
  } catch (e: any) {
    console.error("[push] cron flush failed:", e?.message ?? e);
    return NextResponse.json({ error: "flush failed" }, { status: 500 });
  }
}
