"use client";
// Marketing Command Center (Phase 1, 10/3/26): client helpers. Nothing here can cause an
// external side effect on its own. Drafts go into mkt_action_proposals through mkt_propose;
// approval needs the owner's password re-entered (mkt_approve checks the sign-in time
// server-side); sending goes through the mkt-execute edge function, which asks the database
// whether the exact approved payload may run.
import { createClient, SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/client";

export type ConnStatus = "not_connected" | "setup_required" | "pending_access" | "needs_api_approval" | "connected" | "error" | "revoked" | "internal";
export type Connection = {
  provider: string; label: string; category: string; status: ConnStatus; account_label: string | null;
  scopes: string[]; connected_at: string | null; last_sync_at: string | null; last_error: string | null; next_sync_at: string | null;
};
export type Proposal = {
  id: string; action_type: string; connector: string; title: string; target: any; payload: any; recipients: string[];
  diff: any; est_spend: number | null; payload_hash: string; status: string; created_at: string; updated_at: string;
  approved_at: string | null; approval_expires_at: string | null; decided_note: string | null; executed_at: string | null;
  provider_ref: string | null; outcome: any; related_contact_id: string | null; related_campaign_id: string | null;
};

export const STATUS_LABEL: Record<ConnStatus, string> = {
  not_connected: "Not connected",
  setup_required: "Setup needed",
  pending_access: "Pending access",
  needs_api_approval: "Needs API approval",
  connected: "Connected",
  error: "Error",
  revoked: "Disconnected",
  internal: "Built in",
};
export const STATUS_TONE: Record<ConnStatus, "success" | "warning" | "danger" | "muted" | "default"> = {
  not_connected: "muted", setup_required: "warning", pending_access: "warning", needs_api_approval: "warning",
  connected: "success", error: "danger", revoked: "muted", internal: "default",
};
export const ACTION_LABEL: Record<string, string> = {
  "email.send": "Send email", "email.reply": "Reply to email", "gbp.post": "Google Business post", "gbp.reply": "Review reply",
  "site.publish": "Website change", "ads.change": "Ads change", "apollo.enrich": "Apollo lookup (credits)",
  "semrush.run": "Semrush run (units)", "linkedin.post": "LinkedIn post", "sms.send": "Text message", other: "Other action",
};
export const PROPOSAL_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "muted" | "default" }> = {
  proposed: { label: "Waiting on you", tone: "warning" },
  approved: { label: "Approved", tone: "default" },
  executing: { label: "Sending", tone: "default" },
  confirmed: { label: "Done", tone: "success" },
  failed: { label: "Failed, nothing sent", tone: "danger" },
  rejected: { label: "Rejected", tone: "muted" },
  expired: { label: "Approval expired", tone: "muted" },
  revoked: { label: "Approval withdrawn", tone: "muted" },
};

// Which connector writes exist. Phase 1: none. The UI uses this to explain why "Send"
// is unavailable instead of pretending.
export const WRITES_ENABLED_FOR: Record<string, boolean> = {};

export async function callFn<T = any>(fn: "mkt-integrations" | "mkt-execute", route: string, body: Record<string, unknown> = {}): Promise<{ data?: T; error?: string; status?: number }> {
  const sb = createClient();
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return { error: "Sign in first" };
  const url = `${SUPABASE_URL}/functions/v1/${fn}${route ? "/" + route : ""}`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session.access_token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !("ok" in j)) return { error: j.error || `Request failed (${r.status})`, status: r.status, data: j };
    return { data: j as T, status: r.status };
  } catch (e: any) {
    return { error: "Couldn't reach the integration service. Check your connection and try again." };
  }
}

// Re-check the owner's password (Supabase records the sign-in time in the session; the
// approval function refuses anything older than 15 minutes).
export async function reauth(password: string): Promise<string | null> {
  const sb = createClient();
  const { data } = await sb.auth.getUser();
  const email = data.user?.email;
  if (!email) return "Sign in first";
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? (error.message.includes("Invalid") ? "That password didn't match." : error.message) : null;
}

export async function propose(p: {
  action_type: string; connector: string; title: string; payload: Record<string, unknown>; recipients?: string[];
  target?: Record<string, unknown>; diff?: Record<string, unknown> | null; est_spend?: number | null; contact_id?: string | null; campaign_id?: string | null;
}): Promise<{ data?: Proposal; error?: string }> {
  const sb = createClient();
  const { data, error } = await sb.rpc("mkt_propose", {
    p_action_type: p.action_type, p_connector: p.connector, p_title: p.title, p_payload: p.payload,
    p_recipients: p.recipients ?? [], p_target: p.target ?? {}, p_diff: p.diff ?? null, p_est_spend: p.est_spend ?? null,
    p_contact: p.contact_id ?? null, p_campaign: p.campaign_id ?? null,
  });
  if (error) {
    if (/do-not-contact/i.test(error.message)) await sb.rpc("mkt_log_blocked", { p_event: "proposal_blocked", p_connector: p.connector, p_detail: { reason: error.message, recipients: p.recipients ?? [] } });
    return { error: error.message };
  }
  window.dispatchEvent(new Event("isola:changed"));
  return { data: data as Proposal };
}

export const shortHash = (h?: string | null) => (h ? h.slice(0, 10) : "—");
export function timeAgo(iso?: string | null) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
