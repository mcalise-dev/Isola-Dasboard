"use client";
// Approvals queue (spec §10 / addendum E). Every outbound action waits here. The detail
// panel shows exactly what would go out; approving needs your password; sending is a
// separate server call that the database can still refuse.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ACTION_LABEL, PROPOSAL_STATUS, WRITES_ENABLED_FOR, callFn, shortHash, timeAgo, type Proposal } from "@/lib/mkt";
import { useConnections, ReauthDialog, WritesBanner } from "@/components/marketing/cc/shared";
import { showToast } from "@/components/Toaster";
import { PageHeader, Empty, KV } from "@/components/ui/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Inbox, ShieldCheck, Send, X, Pencil, Clock } from "lucide-react";

type Tab = "waiting" | "approved" | "history";

export default function ApprovalsScreen() {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Proposal[] | null>(null);
  const [tab, setTab] = useState<Tab>("waiting");
  const [open, setOpen] = useState<Proposal | null>(null);
  const { by, policy } = useConnections();
  const load = useCallback(async () => {
    const { data } = await sb.from("mkt_action_proposals").select("*").order("created_at", { ascending: false }).limit(300);
    const list = (data as Proposal[]) ?? [];
    setRows(list);
    setOpen((o) => (o ? list.find((x) => x.id === o.id) ?? null : null));
  }, [sb]);
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  const now = Date.now();
  const isLiveApproval = (p: Proposal) => p.status === "approved" && p.approval_expires_at && new Date(p.approval_expires_at).getTime() > now;
  const lists = {
    waiting: (rows ?? []).filter((p) => p.status === "proposed"),
    approved: (rows ?? []).filter((p) => p.status === "approved" || p.status === "executing"),
    history: (rows ?? []).filter((p) => !["proposed", "approved", "executing"].includes(p.status)),
  };
  const shown = lists[tab];

  return (
    <div>
      <PageHeader title="Approvals" sub="Nothing leaves Isola until you approve the exact message, post, change or spend shown here." />
      <WritesBanner />
      <Segmented<Tab> className="mb-4" value={tab} onChange={setTab} options={[
        { value: "waiting", label: `Waiting on you ${lists.waiting.length || ""}`.trim() },
        { value: "approved", label: `Approved ${lists.approved.length || ""}`.trim() },
        { value: "history", label: "History" },
      ]} />
      {rows === null ? <div className="space-y-2"><div className="skeleton h-16" /><div className="skeleton h-16" /></div>
        : !shown.length ? (
          <Empty icon={<Inbox size={26} />} title={tab === "waiting" ? "Nothing waiting for approval" : tab === "approved" ? "No live approvals" : "No history yet"}
            body={tab === "waiting" ? "Drafts from Outreach (Queue for approval) and future connector suggestions land here. Nothing is sent from a draft." : undefined} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            {shown.map((p) => {
              const st = PROPOSAL_STATUS[p.status] ?? { label: p.status, tone: "muted" as const };
              const expired = p.status === "approved" && !isLiveApproval(p);
              return (
                <button key={p.id} onClick={() => setOpen(p)} className="flex w-full items-center gap-3 border-b border-border bg-card px-4 py-3 text-left last:border-0 hover:bg-white/[0.03]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">{p.title}</span>
                      <Badge variant="muted">{ACTION_LABEL[p.action_type] ?? p.action_type}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-neutral-400">
                      {p.recipients.length ? `To ${p.recipients.join(", ")} · ` : ""}{by[p.connector]?.label ?? p.connector} · drafted {timeAgo(p.created_at)}
                    </div>
                  </div>
                  <Badge variant={expired ? "muted" : st.tone}>{expired ? "Approval expired" : st.label}</Badge>
                </button>
              );
            })}
          </div>
        )}

      <Sheet open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        {open ? <SheetContent title={open.title}><Detail p={open} connLabel={by[open.connector]?.label ?? open.connector} account={by[open.connector]?.account_label ?? null}
          writesOn={!!policy?.writes_enabled} connected={by[open.connector]?.status === "connected"} onChanged={load} /></SheetContent> : null}
      </Sheet>
    </div>
  );
}

function Detail({ p, connLabel, account, writesOn, connected, onChanged }: { p: Proposal; connLabel: string; account: string | null; writesOn: boolean; connected: boolean; onChanged: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [approveOpen, setApproveOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(p.payload?.subject ?? "");
  const [body, setBody] = useState(p.payload?.body ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSubject(p.payload?.subject ?? ""); setBody(p.payload?.body ?? ""); setEditing(false); }, [p.id, p.payload_hash]);
  const isEmail = p.action_type.startsWith("email.");
  const live = p.status === "approved" && p.approval_expires_at && new Date(p.approval_expires_at).getTime() > Date.now();
  const writer = WRITES_ENABLED_FOR[`${p.connector}:${p.action_type}`];
  const sendBlock = !writer ? `Sending through ${connLabel} isn't built yet (Phase 3). Approving now records your decision, but nothing can go out.`
    : !connected ? `${connLabel} isn't connected.` : !writesOn ? "Outbound actions are switched off." : null;

  async function saveEdit() {
    setBusy(true);
    const { error } = await sb.rpc("mkt_update_payload", { p_id: p.id, p_payload: { ...p.payload, subject, body }, p_recipients: null, p_title: null });
    setBusy(false);
    if (error) { showToast(error.message); return; }
    showToast(p.status === "approved" ? "Saved. The earlier approval was cancelled" : "Saved");
    setEditing(false); onChanged();
  }
  async function reject() {
    setBusy(true);
    const { error } = await sb.rpc("mkt_reject", { p_id: p.id, p_note: null });
    setBusy(false);
    if (error) showToast(error.message); else { showToast(p.status === "approved" ? "Approval withdrawn" : "Rejected"); onChanged(); }
  }
  async function send() {
    setBusy(true);
    const r = await callFn<any>("mkt-execute", "", { action_id: p.id, payload_hash: p.payload_hash });
    setBusy(false);
    if (r.data?.blocked) showToast(`Not sent: ${r.data.reason}`);
    else if (r.data?.ok) showToast("Sent");
    else showToast(r.data?.outcome?.error ?? r.error ?? "Not sent");
    onChanged();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 pb-4 pt-5 pr-14">
        <div className="mb-1.5 flex flex-wrap gap-1.5"><Badge variant="muted">{ACTION_LABEL[p.action_type] ?? p.action_type}</Badge><Badge variant={PROPOSAL_STATUS[p.status]?.tone ?? "muted"}>{PROPOSAL_STATUS[p.status]?.label ?? p.status}</Badge></div>
        <h2 className="text-lg font-semibold leading-tight text-white">{p.title}</h2>
        <p className="mt-0.5 text-xs text-neutral-500">Drafted {timeAgo(p.created_at)} · content fingerprint {shortHash(p.payload_hash)}</p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto scroll-thin px-5 py-4">
        <section>
          <div className="mb-1.5 text-xs font-semibold text-neutral-500">Exactly what would go out</div>
          <div className="rounded-xl border border-border">
            {isEmail ? <>
              <KV k="From" className="px-3">{account ?? `${connLabel} (not connected)`}</KV>
              <KV k="To" className="px-3">{p.recipients.join(", ") || "—"}</KV>
              {editing ? (
                <div className="space-y-2 p-3">
                  <Input id="ap-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
                  <Textarea id="ap-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
                  <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button size="sm" onClick={saveEdit} disabled={busy}>Save draft</Button></div>
                  {p.status === "approved" ? <p className="text-xs text-amber-300">Saving a change cancels the current approval.</p> : null}
                </div>
              ) : <>
                <KV k="Subject" className="px-3">{p.payload?.subject ?? "—"}</KV>
                <pre className="whitespace-pre-wrap border-t border-white/[0.05] px-3 py-3 font-sans text-sm leading-relaxed text-neutral-200">{p.payload?.body ?? ""}</pre>
                {p.payload?.attachments?.length ? <KV k="Attachments" className="px-3">{p.payload.attachments.join(", ")}</KV> : <KV k="Attachments" className="px-3">None</KV>}
              </>}
            </> : <pre className="overflow-x-auto p-3 text-xs text-neutral-300">{JSON.stringify(p.payload, null, 2)}</pre>}
          </div>
          {p.diff ? <><div className="mb-1.5 mt-3 text-xs font-semibold text-neutral-500">Before / after</div><pre className="overflow-x-auto rounded-xl border border-border p-3 text-xs text-neutral-300">{JSON.stringify(p.diff, null, 2)}</pre></> : null}
          {p.est_spend != null ? <KV k="Maximum spend">${Number(p.est_spend).toLocaleString()}</KV> : null}
        </section>

        {p.status === "approved" ? (
          <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm", live ? "border-white/15 text-neutral-200" : "border-white/10 text-neutral-400")}>
            <Clock size={15} className="mt-0.5 shrink-0" />
            {live ? `Approved. The approval can be used once until ${new Date(p.approval_expires_at!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : "This approval expired without being used. Approve again to use it."}
          </div>
        ) : null}
        {p.outcome ? <div className="rounded-xl border border-border p-3 text-sm"><div className="mb-1 text-xs font-semibold text-neutral-500">Result</div>{p.outcome.error ?? JSON.stringify(p.outcome)}{p.provider_ref ? <div className="mt-1 text-xs text-neutral-500">Provider ID {p.provider_ref}</div> : null}</div> : null}
        {(p.status === "proposed" || p.status === "approved") && sendBlock ? <p className="text-xs text-neutral-500">{sendBlock}</p> : null}
      </div>
      {p.status === "proposed" || p.status === "approved" ? (
        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {isEmail && !editing ? <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button> : null}
          <Button variant="outline" size="sm" onClick={reject} disabled={busy}><X size={14} /> {p.status === "approved" ? "Withdraw approval" : "Reject"}</Button>
          <div className="flex-1" />
          {p.status === "proposed" ? <Button size="sm" onClick={() => setApproveOpen(true)} disabled={busy || editing}><ShieldCheck size={15} /> Approve this exact {isEmail ? "email" : "action"}</Button> : null}
          {p.status === "approved" && live ? <Button size="sm" onClick={send} disabled={busy || !!sendBlock}><Send size={15} /> Send now</Button> : null}
        </div>
      ) : null}
      <ReauthDialog open={approveOpen} onOpenChange={setApproveOpen} title="Approve this action" confirmLabel="Approve"
        detail={<><b className="text-white">{ACTION_LABEL[p.action_type] ?? p.action_type}</b>{p.recipients.length ? <> to {p.recipients.join(", ")}</> : null}. Fingerprint {shortHash(p.payload_hash)}. The approval works once and expires in 15 minutes. Any edit cancels it.</>}
        onConfirmed={async () => {
          const { data, error } = await sb.rpc("mkt_approve", { p_id: p.id, p_hash: p.payload_hash });
          if (error) return error.message;
          if (!(data as any)?.ok) return (data as any)?.error === "REAUTH_REQUIRED" ? "Your sign-in couldn't be confirmed. Try again." : (data as any)?.error ?? "Not approved";
          showToast("Approved"); onChanged(); return null;
        }} />
    </div>
  );
}
