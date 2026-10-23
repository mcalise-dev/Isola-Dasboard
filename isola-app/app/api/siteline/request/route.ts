// POST /api/siteline/request  { email }
// A client asks for their SiteLine projects link. The server mints a portal link (needs the
// server secret, so the browser can never get a token for someone else's email) and emails it.
// The answer is the same whether or not the email matched, so nobody can fish for clients.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/client";
import { sendPortalEmail } from "@/lib/siteline-mail";

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
    return NextResponse.json({ ok: true });
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
    return NextResponse.json({ ok: true });
  }
  if (data?.error === "rate_limited") return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  if (data?.ok && data.matched && data.token) {
    try {
      const r = await sendPortalEmail({ to: email, token: data.token, name: data.name || null, count: data.count ?? 1 });
      if (!r.sent) console.warn("[siteline] email not sent:", r.reason);
    } catch (e: any) {
      console.error("[siteline] email failed:", e?.message ?? e);
    }
  }
  return NextResponse.json({ ok: true });
}
