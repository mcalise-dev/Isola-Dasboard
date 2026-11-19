// POST /api/siteline/invite-email  { id, email }  — v8.0 (11/18/26)
// Emails one SiteLine invite with the generic template. Owner only: the row is read through
// Mike's own session, and portal_access RLS lets only the owner see it. Sends only when Mike
// taps Send in the dashboard (after a confirm), never automatically.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendInviteEmail, smtpReady } from "@/lib/siteline-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP = "https://isola-dashboard.vercel.app";

export async function POST(req: Request) {
  let id = "", email = "";
  try { const b = await req.json(); id = String(b?.id ?? ""); email = String(b?.email ?? "").trim().slice(0, 200); } catch {}
  if (!id || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: "bad_input" }, { status: 400 });
  if (!smtpReady()) return NextResponse.json({ ok: false, error: "smtp_not_configured" }, { status: 500 });

  const supabase = await createClient();
  const { data: a } = await supabase.from("portal_access").select("*").eq("id", id).maybeSingle();
  if (!a) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!a.active || a.claimed_at || new Date(a.invite_expires_at) < new Date()) return NextResponse.json({ ok: false, error: "invite_not_open" }, { status: 400 });

  const { data: c } = await supabase.from("customers").select("name").eq("id", a.customer_id).maybeSingle();
  const customer = c?.name ?? "your";
  let scope = `All ${customer} jobs`;
  if (a.job_id) { const { data: j } = await supabase.from("jobs").select("job_name,location").eq("id", a.job_id).maybeSingle(); scope = j?.job_name || j?.location || "your project"; }
  else if (a.property_id) { const { data: p } = await supabase.from("properties").select("label,address").eq("id", a.property_id).maybeSingle(); scope = p?.label || p?.address || "your property"; }

  try {
    await sendInviteEmail({ to: email, name: a.invite_name, scope, customer, url: `${APP}/siteline/join/${a.invite_token}` });
  } catch (e: any) {
    console.error("[siteline] invite email failed:", e?.message);
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 500 });
  }
  await supabase.from("portal_access").update({ invite_email: email, emailed_at: new Date().toISOString() }).eq("id", a.id);
  return NextResponse.json({ ok: true });
}
