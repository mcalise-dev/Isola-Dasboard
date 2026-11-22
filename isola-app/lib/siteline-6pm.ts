// The 6 PM SiteLine run (v9.3, 11/22/26). Reads what went live today through token-checked
// RPCs (anon key + SITELINE_MAIL_SECRET, whose sha256 is in siteline_mail_config), emails each
// portal's contacts once, then marks those updates handled so nothing is ever sent twice.
// Emails go out only when app_settings 'siteline_6pm'.email is true; otherwise the run just
// marks the updates handled.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/client";
import { sendPortalUpdateEmail, smtpReady, type MailPortal } from "@/lib/siteline-mail";

export const mailDb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const okEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export async function runSixPm() {
  const secret = process.env.SITELINE_MAIL_SECRET;
  if (!secret) return { skipped: "SITELINE_MAIL_SECRET not set" };
  const db = mailDb();
  const { data, error } = await db.rpc("siteline_6pm_outbox", { p_secret: secret });
  if (error) throw new Error("outbox: " + error.message);
  const box = data as { email: boolean; update_ids: string[]; portals: MailPortal[] };
  const ids = box.update_ids ?? [];
  if (!ids.length) return { updates: 0, emails: 0 };

  let emails = 0, failed = 0;
  if (box.email && smtpReady()) {
    for (const p of box.portals ?? []) {
      for (const to of (p.emails ?? []).filter(okEmail)) {
        try { await sendPortalUpdateEmail(to, p); emails++; }
        catch (e: any) { failed++; console.error("[siteline 6pm] email failed for portal", p.portal_id, e?.message); }
      }
    }
  }
  const mark = await db.rpc("siteline_6pm_mark", { p_secret: secret, p_ids: ids });
  if (mark.error) console.error("[siteline 6pm] mark failed:", mark.error.message);
  return { updates: ids.length, emails, failed, email_on: box.email };
}
