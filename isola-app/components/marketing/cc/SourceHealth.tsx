"use client";
// Overview strip (spec §3 KPI row): approvals waiting, outbound switch, and the KPIs that
// depend on connectors. A tile shows a number only when its source is connected and has
// synced; otherwise it says which source is missing. Each tile carries its definition.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useConnections } from "@/components/marketing/cc/shared";
import { STATUS_LABEL, timeAgo } from "@/lib/mkt";
import { Tip } from "@/components/ui/tooltip";
import { ShieldCheck, ShieldOff, Info, ArrowRight } from "lucide-react";

const KPIS = [
  { label: "Organic search clicks", source: "google_search_console", def: "Clicks from Google Search to isola-ri.com in the period (Search Console, all queries)." },
  { label: "Website leads", source: "website_forms", def: "Unique form submissions from isola-ri.com that passed the spam check." },
  { label: "Ads spend · cost per qualified lead", source: "google_ads", def: "Actual Google Ads spend ÷ leads you marked qualified that came from ads." },
  { label: "Outreach response rate", source: "gmail", def: "Real replies ÷ outreach emails sent from Isola, by thread." },
];

export default function SourceHealth() {
  const sb = useMemo(() => createClient(), []);
  const { by, policy, rows } = useConnections();
  const [waiting, setWaiting] = useState<number | null>(null);
  useEffect(() => { sb.from("mkt_action_proposals").select("id", { count: "exact", head: true }).eq("status", "proposed").then(({ count }) => setWaiting(count ?? 0)); }, [sb]);
  if (!rows) return <div className="skeleton mb-6 h-24" />;
  const live = rows.filter((r) => r.status === "connected" || r.status === "internal").length;
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/marketing/approvals" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 hover:border-white/25">
          <span className={waiting ? "font-semibold text-amber-300" : "text-neutral-300"}>{waiting ?? "…"} waiting for approval</span>
        </Link>
        <Link href="/marketing/integrations#safety" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-neutral-300 hover:border-white/25">
          {policy?.writes_enabled ? <ShieldCheck size={14} className="text-amber-300" /> : <ShieldOff size={14} />} Outbound {policy?.writes_enabled ? "on" : "off"}
        </Link>
        <Link href="/marketing/integrations" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-neutral-300 hover:border-white/25">
          {live} of {rows.length} sources live <ArrowRight size={13} />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((k) => {
          const c = by[k.source];
          const connected = c?.status === "connected";
          return (
            <div key={k.label} className="rounded-xl border border-dashed border-white/10 px-4 py-3">
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-400">
                {k.label}
                <Tip label={k.def}><button aria-label={`What ${k.label} means`} className="text-neutral-600 hover:text-neutral-300"><Info size={13} /></button></Tip>
              </div>
              <div className="mt-1 text-base font-semibold text-neutral-500">{connected ? "Waiting for first sync" : STATUS_LABEL[c?.status ?? "not_connected"]}</div>
              <div className="mt-0.5 text-xs text-neutral-600">{c?.label ?? k.source}{connected ? ` · ${timeAgo(c.last_sync_at)}` : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
