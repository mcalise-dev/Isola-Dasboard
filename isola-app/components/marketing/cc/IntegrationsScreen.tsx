"use client";
// Integrations & safety (spec §1, §14, addendum L). Connection health for every provider,
// the steps Mike takes to connect each one, the outbound kill switch, and the
// do-not-contact list. Credentials are never typed here or in chat.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { callFn, timeAgo, type Connection } from "@/lib/mkt";
import { useConnections, StatusBadge, ReauthDialog } from "@/components/marketing/cc/shared";
import { PROVIDERS, ORDER, REDIRECT_HINT } from "@/components/marketing/cc/providers";
import { showToast, undoable } from "@/components/Toaster";
import { PageHeader, SectionTitle, KV } from "@/components/ui/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldOff, ChevronDown, PlugZap, RefreshCw, Unplug, Ban, Plus, Trash2, CheckCircle2, Circle } from "lucide-react";

type Status = { google_configured: boolean; redirect_uri: string } | null;

export default function IntegrationsScreen() {
  const sb = useMemo(() => createClient(), []);
  const { rows, by, policy, reload } = useConnections();
  const [svc, setSvc] = useState<Status | "unreachable" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [writesDialog, setWritesDialog] = useState(false);
  const [test, setTest] = useState<Record<string, any>>({});

  useEffect(() => {
    callFn<Status>("mkt-integrations", "status").then((r) => setSvc(r.data && !r.error && "google_configured" in (r.data as any) ? r.data : "unreachable"));
    try {
      const q = new URLSearchParams(window.location.search);
      const c = q.get("connected"), e = q.get("error");
      if (c) showToast(`${c.replace(/_/g, " ")} connected`);
      if (e) showToast(e, 7000);
      if (c || e) window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      const h = window.location.hash.slice(1); if (h) setOpen(h);
    } catch {}
  }, []);

  async function connect(p: string) {
    setBusy(p);
    const r = await callFn<{ url?: string; error?: string }>("mkt-integrations", "start", { provider: p, return_to: `${window.location.origin}/marketing/integrations` });
    setBusy(null);
    if (r.data?.url) window.location.href = r.data.url;
    else showToast(r.data?.error ?? r.error ?? "Couldn't start the connection", 7000);
  }
  async function runTest(p: string) {
    setBusy(p);
    const r = await callFn<any>("mkt-integrations", "test", { provider: p });
    setBusy(null);
    setTest((t) => ({ ...t, [p]: r.data ?? { ok: false, error: r.error } }));
    reload();
  }
  async function disconnect(p: string) {
    setBusy(p);
    const r = await callFn<any>("mkt-integrations", "disconnect", { provider: p });
    setBusy(null);
    showToast(r.data?.ok ? `Disconnected${r.data.revoked_at_google ? " and revoked at Google" : ""}` : r.error ?? "Couldn't disconnect");
    reload();
  }
  async function setWrites(on: boolean): Promise<string | null> {
    const { data, error } = await sb.rpc("mkt_set_writes", { p_enabled: on });
    if (error) return error.message;
    if (!(data as any)?.ok) return (data as any)?.error === "REAUTH_REQUIRED" ? "Your sign-in couldn't be confirmed. Try again." : (data as any)?.error;
    showToast(on ? "Outbound actions turned on" : "Outbound actions turned off");
    reload(); return null;
  }

  const googleReady = svc && svc !== "unreachable" && svc.google_configured;
  const list = ORDER.map((p) => by[p]).filter(Boolean) as Connection[];
  const counts = { live: list.filter((c) => c.status === "connected" || c.status === "internal").length, total: list.length };

  return (
    <div>
      <PageHeader title="Integrations & safety" sub={rows ? `${counts.live} of ${counts.total} sources live. Data only appears from connected accounts.` : "Loading…"}
        actions={<Button asChild variant="outline" size="sm"><Link href="/marketing/audit">Audit log</Link></Button>} />

      {/* safety */}
      <section id="safety" className="mb-8 grid gap-3 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-start gap-3">
            {policy?.writes_enabled ? <ShieldCheck size={22} className="mt-0.5 text-amber-300" /> : <ShieldOff size={22} className="mt-0.5 text-neutral-400" />}
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold text-white">Outbound actions are {policy ? (policy.writes_enabled ? "on" : "off") : "…"}</h3>
              <p className="mt-1 text-sm text-neutral-400">
                This is the master switch for anything that leaves Isola: emails, posts, website changes, ad changes, paid lookups. When it's off, nothing can go out even if approved. When it's on, every action still needs your approval of the exact content, once, within {policy?.approval_minutes ?? 15} minutes.
              </p>
            </div>
            {policy ? (policy.writes_enabled
              ? <Button variant="outline" size="sm" onClick={() => setWrites(false)}>Turn off</Button>
              : <Button variant="outline" size="sm" onClick={() => setWritesDialog(true)}>Turn on</Button>) : null}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="text-[15px] font-semibold text-white">Who can do what</h3>
          <KV k="Owner (Mike)">Approve and send</KV>
          <KV k="Marketing editor">Draft, request approval</KV>
          <KV k="Viewer">Read only</KV>
          <KV k="Crew">No access</KV>
        </Card>
      </section>

      {svc === "unreachable" ? (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/[0.05] px-4 py-3 text-sm text-red-200">The integration service didn't answer, so connect buttons are off. Reload in a minute; if it keeps happening, tell Claude.</div>
      ) : null}

      <SectionTitle>Connections</SectionTitle>
      {!rows ? <div className="space-y-2"><div className="skeleton h-16" /><div className="skeleton h-16" /></div> : (
        <div className="mb-8 overflow-hidden rounded-xl border border-border">
          {list.map((c) => {
            const info = PROVIDERS[c.provider];
            const isOpen = open === c.provider;
            const t = test[c.provider];
            return (
              <div key={c.provider} id={c.provider} className="border-b border-border bg-card last:border-0">
                <button onClick={() => setOpen(isOpen ? null : c.provider)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02]">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white">{c.label}</div>
                    <div className="truncate text-xs text-neutral-500">
                      {c.status === "connected" ? `${c.account_label ?? "Connected"} · checked ${timeAgo(c.last_sync_at)}` : c.status === "internal" ? "This app's own database" : info?.cost ?? c.category}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                  <ChevronDown size={16} className={cn("shrink-0 text-neutral-500 transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && info ? (
                  <div className="space-y-3 px-4 pb-4">
                    <p className="text-sm text-neutral-300">{info.shows}</p>
                    {info.writes ? <p className="text-xs text-neutral-500">Could later change: {info.writes} Always behind approval.</p> : null}
                    {c.last_error ? <p className="text-sm text-red-300">{c.last_error}</p> : null}
                    {c.scopes?.length ? <p className="break-all text-xs text-neutral-500">Granted: {c.scopes.filter((s) => s.startsWith("https")).map((s) => s.split("/").pop()).join(", ")}</p> : null}
                    {c.status !== "connected" && c.status !== "internal" ? (
                      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-neutral-300">
                        {info.steps.map((s, i) => <li key={i} className="break-words">{s}</li>)}
                      </ol>
                    ) : null}
                    {info.oauth ? (
                      <div className="flex flex-wrap gap-2">
                        {c.status !== "connected" ? (
                          <Button size="sm" onClick={() => connect(c.provider)} disabled={!googleReady || busy === c.provider}>
                            <PlugZap size={15} /> {busy === c.provider ? "Opening Google…" : "Connect with Google"}
                          </Button>
                        ) : <>
                          <Button size="sm" variant="outline" onClick={() => runTest(c.provider)} disabled={busy === c.provider}><RefreshCw size={14} /> {busy === c.provider ? "Checking…" : "Check connection"}</Button>
                          <Button size="sm" variant="outline" onClick={() => disconnect(c.provider)} disabled={busy === c.provider}><Unplug size={14} /> Disconnect</Button>
                        </>}
                        {!googleReady && c.status !== "connected" ? <span className="self-center text-xs text-neutral-500">{svc === null ? "Checking setup…" : "Finish the Google project steps first."}</span> : null}
                      </div>
                    ) : null}
                    {t ? (
                      <div className={cn("rounded-lg border p-3 text-xs", t.ok ? "border-emerald-500/25 text-emerald-200" : "border-red-500/25 text-red-200")}>
                        {t.ok ? "Live response from Google: " : "Check failed: "}
                        {t.ok ? Object.entries(t.summary ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? (v.length ? v.join(", ") : "none") : v}`).join(" · ") : (t.error ?? t.summary?.error)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <OwnerChecklist googleReady={!!googleReady} by={by} />
      <Suppression />

      <ReauthDialog open={writesDialog} onOpenChange={setWritesDialog} title="Turn on outbound actions" confirmLabel="Turn on"
        detail={<>Turning this on lets an action you've approved actually go out. It doesn't approve anything by itself, and you can turn it off at any time.</>}
        onConfirmed={() => setWrites(true)} />
    </div>
  );
}

function OwnerChecklist({ googleReady, by }: { googleReady: boolean; by: Record<string, Connection> }) {
  const items: { label: string; done: boolean | null; note?: string }[] = [
    { label: "Give Claude write access to the Isola-Dasboard GitHub repo", done: null, note: "So fixes ship without drag-and-drop uploads." },
    { label: "Create the Google Cloud project + OAuth client, add the two secrets in Supabase", done: googleReady, note: `Redirect URI: ${REDIRECT_HINT}` },
    { label: "Connect Gmail (read only)", done: by.gmail?.status === "connected" },
    { label: "New isola-ri.com live, verified in Search Console, GA4 property created", done: by.google_search_console?.status === "connected" && by.google_analytics?.status === "connected" },
    { label: "SPF, DKIM and DMARC records on isola-ri.com before any outreach sends", done: null },
    { label: "Decide on paid tools (Semrush, BrightLocal, Apollo, CallRail) and set credit/spend caps", done: null },
    { label: "Business Profile manager access + API application; Google Ads API access if running ads", done: null },
    { label: "Confirm service territory and services to market (no location pages for places you don't serve)", done: null },
  ];
  return (
    <section className="mb-8">
      <SectionTitle>Your setup checklist</SectionTitle>
      <div className="overflow-hidden rounded-xl border border-border">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-3 border-b border-border bg-card px-4 py-3 last:border-0">
            {it.done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" /> : <Circle size={18} className="mt-0.5 shrink-0 text-neutral-600" />}
            <div className="min-w-0">
              <div className={cn("text-sm", it.done ? "text-neutral-400" : "text-white")}>{it.label}</div>
              {it.note ? <div className="break-all text-xs text-neutral-500">{it.note}</div> : null}
            </div>
            {it.done === null ? <Badge variant="muted" className="ml-auto shrink-0">You confirm</Badge> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function Suppression() {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[] | null>(null);
  const [val, setVal] = useState("");
  const [reason, setReason] = useState("do_not_contact");
  const load = () => sb.from("mkt_suppression").select("*").order("added_at", { ascending: false }).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  async function add() {
    const v = val.trim().toLowerCase();
    if (!v) return;
    const isEmail = v.includes("@");
    const { error } = await sb.from("mkt_suppression").insert(isEmail ? { email: v, reason } : { domain: v.replace(/^@/, ""), reason });
    if (error) { showToast(error.message.includes("duplicate") ? "Already on the list" : error.message); return; }
    setVal(""); load();
  }
  function remove(r: any) {
    const prev = rows ?? [];
    undoable({ text: `${r.email ?? r.domain} removed from the list`, hide: () => setRows(prev.filter((x) => x.id !== r.id)), restore: () => setRows(prev),
      commit: async () => { const { error } = await sb.from("mkt_suppression").delete().eq("id", r.id); if (error) { showToast(error.message); load(); } } });
  }
  const label: Record<string, string> = { do_not_contact: "Do not contact", unsubscribed: "Unsubscribed", bounced: "Bounced", complaint: "Complaint", other: "Other" };
  return (
    <section>
      <SectionTitle>Do-not-contact list</SectionTitle>
      <p className="mb-3 text-sm text-neutral-400">No draft can be created to anyone on this list. Add an email, or a whole domain like example.com.</p>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input id="sup-val" placeholder="name@company.com or company.com" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <NativeSelect id="sup-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="sm:w-48">
          {Object.entries(label).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        <Button onClick={add} className="shrink-0"><Plus size={15} /> Add</Button>
      </div>
      {rows === null ? <div className="skeleton h-12" /> : !rows.length ? <p className="text-sm text-neutral-500">Nobody on the list yet.</p> : (
        <div className="overflow-hidden rounded-xl border border-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 last:border-0">
              <Ban size={15} className="shrink-0 text-neutral-500" />
              <span className="min-w-0 flex-1 truncate text-sm text-white">{r.email ?? `@${r.domain}`}</span>
              <Badge variant="muted">{label[r.reason] ?? r.reason}</Badge>
              <button onClick={() => remove(r)} aria-label="Remove" className="rounded p-1 text-neutral-500 hover:text-red-400"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
