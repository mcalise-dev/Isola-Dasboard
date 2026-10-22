// E-signature links (proposal_links). A change-order link is always tied to a row in
// change_orders, so signing it online approves that change order for billing and cash flow.
import { daysFromToday, getProposalValidDays } from "@/lib/settings";

export function newToken() {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => abc[b % abc.length]).join("");
}

export const signUrl = (token: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/p/${token}`;

/** Next CO number on a job. */
export async function nextCoNumber(supabase: any, jobId: string): Promise<number> {
  const { data } = await supabase.from("change_orders").select("co_number").eq("job_id", jobId);
  return (data ?? []).reduce((m: number, c: any) => Math.max(m, c.co_number || 0), 0) + 1;
}

/** Creates (or returns the open) signature link for an existing change order and marks the CO sent. */
export async function linkForChangeOrder(supabase: any, co: any, opts: { document_id?: string | null } = {}) {
  const { data: existing } = await supabase.from("proposal_links")
    .select("id,token,status").eq("change_order_id", co.id).order("created_at", { ascending: false }).limit(1);
  if (existing?.[0] && existing[0].status !== "declined") return existing[0];

  const { data: job } = await supabase.from("jobs").select("job_name").eq("id", co.job_id).single();
  const days = await getProposalValidDays();
  const { data: pl, error } = await supabase.from("proposal_links").insert({
    token: newToken(),
    job_id: co.job_id,
    kind: "change_order",
    change_order_id: co.id,
    title: `${job?.job_name ?? "Job"} — Change Order #${co.co_number}${co.title ? ": " + co.title : ""}`,
    intro: co.reason || null,
    scope: co.scope_text || null,
    price: Number(co.amount) || 0,
    deposit_pct: null,
    deposit_amount: null,
    document_id: opts.document_id ?? null,
    status: "sent",
    expires_at: daysFromToday(days),
  }).select("id,token,status").single();
  if (error) throw error;

  if (co.status === "draft") {
    await supabase.from("change_orders").update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", co.id);
  }
  return pl;
}
