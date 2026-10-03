"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABEL, STATUS_TONE, timeAgo, reauth, type Connection } from "@/lib/mkt";
import { PROVIDERS } from "@/components/marketing/cc/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck, PlugZap, ArrowRight, Lock } from "lucide-react";

export function useConnections() {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Connection[] | null>(null);
  const [policy, setPolicy] = useState<{ writes_enabled: boolean; approval_minutes: number } | null>(null);
  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      sb.from("mkt_connections").select("*"),
      sb.from("mkt_policy").select("writes_enabled,approval_minutes").eq("id", 1).maybeSingle(),
    ]);
    setRows((c.data as Connection[]) ?? []);
    setPolicy((p.data as any) ?? null);
  }, [sb]);
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("isola:changed", on);
    return () => window.removeEventListener("isola:changed", on);
  }, [load]);
  const by = useMemo(() => Object.fromEntries((rows ?? []).map((r) => [r.provider, r])), [rows]);
  return { rows, by, policy, reload: load };
}

export function StatusBadge({ status }: { status: Connection["status"] }) {
  return <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

// Shown wherever a screen depends on connectors that aren't live: what it will show,
// what's needed, and a link to the steps. No numbers are invented in its place.
export function ConnectorGate({ providers, title, children }: { providers: string[]; title: string; children?: React.ReactNode }) {
  const { by, rows } = useConnections();
  if (!rows) return <div className="space-y-3"><div className="skeleton h-28" /><div className="skeleton h-28" /></div>;
  const live = providers.filter((p) => by[p]?.status === "connected");
  return (
    <div className="space-y-4">
      {live.length < providers.length ? (
        <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <PlugZap size={18} className="mt-0.5 shrink-0 text-neutral-400" />
          <p className="text-sm text-neutral-300">
            {live.length === 0 ? `${title} has no live data yet. ` : "Some sources aren't connected yet. "}
            Nothing here is estimated or sample data: each panel fills in only from a connected account, with its source and last sync shown.
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {providers.map((p) => {
          const c = by[p]; const info = PROVIDERS[p];
          if (!c || !info) return null;
          return (
            <Card key={p} className="p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-white">{c.label}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{c.status === "connected" ? `${c.account_label ?? "Connected"} · last checked ${timeAgo(c.last_sync_at)}` : c.category}</div>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <p className="mt-2 text-sm text-neutral-400">{info.shows}</p>
              {c.last_error ? <p className="mt-2 text-xs text-red-300">{c.last_error}</p> : null}
              {c.status !== "connected" && c.status !== "internal" ? (
                <Link href={`/marketing/integrations#${p}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-white hover:underline">
                  How to connect <ArrowRight size={14} />
                </Link>
              ) : null}
            </Card>
          );
        })}
      </div>
      {children}
    </div>
  );
}

// Password re-check before an approval or turning outbound actions on.
export function ReauthDialog({ open, onOpenChange, title, detail, confirmLabel, onConfirmed }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; detail: React.ReactNode; confirmLabel: string; onConfirmed: () => Promise<string | null>;
}) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPw(""); setErr(null); } }, [open]);
  async function go() {
    if (!pw) { setErr("Enter your password."); return; }
    setBusy(true); setErr(null);
    const e1 = await reauth(pw);
    if (e1) { setBusy(false); setErr(e1); return; }
    const e2 = await onConfirmed();
    setBusy(false);
    if (e2) setErr(e2); else onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock size={17} /> {title}</DialogTitle>
          <DialogDescription>Re-enter your password to confirm it's you. This is checked by the server, not just this screen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-white/[0.03] p-3 text-sm text-neutral-300">{detail}</div>
          <Input id="reauth-pw" type="password" autoComplete="current-password" placeholder="Your Isola password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} autoFocus />
          {err ? <p className="text-sm text-red-300">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={go} disabled={busy}><ShieldCheck size={16} /> {busy ? "Checking…" : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WritesBanner() {
  const { policy } = useConnections();
  if (!policy) return null;
  return (
    <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${policy.writes_enabled ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-200" : "border-white/10 bg-white/[0.03] text-neutral-300"}`}>
      <ShieldCheck size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">{policy.writes_enabled
        ? <>Outbound actions are <b className="font-semibold">on</b>. Each one still needs your approval of the exact content.</>
        : <>Outbound actions are <b className="font-semibold">off</b>. Nothing can be sent, posted or spent, even if approved.</>}</span>
      <Link href="/marketing/integrations#safety" className="text-xs font-semibold underline-offset-2 hover:underline">Change</Link>
    </div>
  );
}
