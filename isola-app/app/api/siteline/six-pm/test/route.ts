// Test send (v9.3): builds the exact email one portal would get for one update and sends it to
// the Isola mailbox only (SMTP_USER), never to the portal's contacts. Preview deployments only.
// GET /api/siteline/six-pm/test?portal=<portal token>&update=<update id>
import { NextResponse, type NextRequest } from "next/server";
import { mailDb } from "@/lib/siteline-6pm";
import { sendPortalUpdateEmail, smtpReady, type MailPortal } from "@/lib/siteline-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "not_here" }, { status: 404 });
  const portal = req.nextUrl.searchParams.get("portal") ?? "";
  const update = req.nextUrl.searchParams.get("update") ?? "";
  const secret = process.env.SITELINE_MAIL_SECRET;
  const to = process.env.SMTP_USER;
  if (!secret || !to || !smtpReady()) return NextResponse.json({ error: "not_configured" }, { status: 500 });
  const { data, error } = await mailDb().rpc("siteline_mail_preview", { p_secret: secret, p_portal_token: portal, p_update_id: update });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const p = (data?.portals ?? [])[0] as MailPortal | undefined;
  if (!p) return NextResponse.json({ error: "nothing_to_send" }, { status: 404 });
  try { await sendPortalUpdateEmail(to, p, { test: true }); }
  catch (e: any) { return NextResponse.json({ error: "send_failed", detail: e?.message }, { status: 500 }); }
  return NextResponse.json({ ok: true, sent_to: to, jobs: p.jobs.map((j) => j.job_name) });
}
