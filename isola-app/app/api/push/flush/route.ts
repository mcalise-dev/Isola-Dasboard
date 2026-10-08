// Delivers alerts that are already queued in the database. Safe for anyone to call:
// it can't create alerts, only push real ones that are waiting.
import { NextResponse } from "next/server";
import { flushPush } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle() {
  try {
    return NextResponse.json(await flushPush());
  } catch (e: any) {
    console.error("[push] flush failed:", e?.message ?? e);
    return NextResponse.json({ error: "flush failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
