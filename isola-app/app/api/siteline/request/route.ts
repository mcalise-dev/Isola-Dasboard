// POST /api/siteline/request  { email }
// Client Login. A known client email goes straight to that client's permanent portal link
// (instant access, Mike's choice 10/23/26). Unknown emails get "not found".
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let email = "";
  try {
    email = String((await req.json())?.email ?? "").trim().slice(0, 200);
  } catch {}
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "bad_email" }, { status: 400 });
  }
  const secret = process.env.PUSH_SERVER_SECRET;
  if (!secret) {
    console.error("[siteline] PUSH_SERVER_SECRET not set");
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.rpc("siteline_portal_issue", { p_secret: secret, p_email: email, p_ip: ip });
  if (error) {
    console.error("[siteline] issue failed:", error.message);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
  if (data?.error === "rate_limited") return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  // v7.6 (10/23/26, Mike's call): instant access — a known email goes straight to its portal.
  // Each client keeps one permanent link (siteline_portal_issue reuses it).
  if (data?.ok && data.matched && data.token) return NextResponse.json({ ok: true, matched: true, url: `/siteline/${data.token}` });
  if (data?.ok) return NextResponse.json({ ok: true, matched: false });
  return NextResponse.json({ ok: false, error: data?.error ?? "server" }, { status: 400 });
}
