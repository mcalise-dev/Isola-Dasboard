// Vercel cron, 22:00 and 23:00 UTC = 6 PM Eastern in summer and in winter. The run that comes
// before 6 PM finds nothing live yet; the other one sends. See lib/siteline-6pm.ts.
import { NextResponse, type NextRequest } from "next/server";
import { runSixPm } from "@/lib/siteline-6pm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runSixPm());
  } catch (e: any) {
    console.error("[siteline 6pm] run failed:", e?.message ?? e);
    return NextResponse.json({ error: "run failed" }, { status: 500 });
  }
}
