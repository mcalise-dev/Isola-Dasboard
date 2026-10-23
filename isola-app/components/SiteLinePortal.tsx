"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteLineHeader } from "@/components/SiteLineFind";
import "@fontsource/barlow-condensed/700.css";

/* /siteline/<token> — every project for one client, each opening its own SiteLine page.
   Data comes from public_siteline_portal(token): status and dates only, never money or notes. */

const PHONE = "508-933-2661";
const DISPLAY = { fontFamily: '"Barlow Condensed", var(--font-geist-sans), sans-serif' } as const;
const parse = (iso: string) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const mid = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: parse(iso).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }));
const isToday = (iso: any) => {
  const n = new Date();
  return String(iso).slice(0, 10) === `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

type P = { token: string; job_name: string; location?: string; phase: string; start_date?: string; completed_date?: string; next_day?: string; needs_signature?: boolean };

function line(p: P) {
  if (p.needs_signature) return "Waiting on your signature";
  if (p.phase === "Complete") return p.completed_date ? `Finished ${mid(p.completed_date)}` : "Finished";
  if (p.phase === "In progress") return p.next_day ? `Crew on site next: ${isToday(p.next_day) ? "today" : mid(p.next_day)}` : "Work underway";
  if (p.phase === "Scheduled") return p.start_date ? `Starts ${mid(p.start_date)}` : "Start date coming soon";
  return p.start_date ? `Estimated start ${mid(p.start_date)}` : "";
}

function Row({ p }: { p: P }) {
  const done = p.phase === "Complete";
  return (
    <a href={`/site/${p.token}`}
      className={`block rounded-2xl p-5 transition-colors ${p.needs_signature ? "border border-brand/60 bg-[#14130c] hover:bg-[#1b1a10]" : "border border-white/[0.08] bg-[#0C0F12] hover:bg-white/[0.03]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[17px] font-semibold leading-snug text-white">{p.job_name}</div>
          {p.location && p.location !== p.job_name ? <div className="mt-0.5 truncate text-[14px] text-neutral-400">{p.location}</div> : null}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${done ? "bg-emerald-500/10 text-emerald-300" : "bg-brand/15 text-brand"}`}>{p.phase}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[14px]">
        <span className={p.needs_signature ? "font-semibold text-brand" : "text-neutral-300"}>{line(p)}</span>
        <span className="shrink-0 text-neutral-500">Open →</span>
      </div>
    </a>
  );
}

export default function SiteLinePortal({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("public_siteline_portal", { p_token: token });
      setD(data);
      setLoading(false);
    })();
  }, [supabase, token]);

  const projects: P[] = d?.projects ?? [];
  const active = projects.filter((p) => p.phase !== "Complete");
  const done = projects.filter((p) => p.phase === "Complete")
    .sort((a, b) => String(b.completed_date ?? "").localeCompare(String(a.completed_date ?? "")));
  const shownDone = showDone || !active.length ? done : done.slice(0, 3);

  return (
    <div className="min-h-screen bg-[#050607] text-neutral-100 antialiased">
      <SiteLineHeader />
      <main className="mx-auto max-w-xl space-y-4 px-4 pb-10 pt-6">
        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="h-10 w-2/3 animate-pulse rounded-lg bg-white/[0.05]" />
            <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
            <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
          </div>
        ) : !d?.ok ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0C0F12] p-6">
            <div className="text-[22px] font-semibold text-white" style={DISPLAY}>{d?.error === "expired" ? "This link has expired" : "This link isn't active"}</div>
            <p className="mt-2 text-sm text-neutral-300">Get a fresh one in a few seconds.</p>
            <a href="/siteline" className="mt-5 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-neutral-950">Email me a new link</a>
          </div>
        ) : (
          <>
            <div className="px-1">
              {d.name ? <div className="text-[15px] text-neutral-400">Hi {d.name},</div> : null}
              <h1 className="mt-0.5 text-[38px] font-bold leading-[1] text-white" style={DISPLAY}>Your projects</h1>
            </div>

            {projects.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#0C0F12] p-5 text-[15px] text-neutral-300">
                No projects to show right now. Call Mike at {PHONE} with any questions.
              </div>
            ) : null}

            {active.length ? (
              <section className="space-y-3">
                {done.length ? <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Current</h2> : null}
                {active.map((p) => <Row key={p.token} p={p} />)}
              </section>
            ) : null}

            {done.length ? (
              <section className="space-y-3 pt-2">
                <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Completed</h2>
                {shownDone.map((p) => <Row key={p.token} p={p} />)}
                {shownDone.length < done.length ? (
                  <button onClick={() => setShowDone(true)} className="px-1 text-[14px] font-semibold text-brand">Show all {done.length} completed</button>
                ) : null}
              </section>
            ) : null}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <a href={`tel:${PHONE.replace(/-/g, "")}`} className="flex h-12 items-center justify-center rounded-xl bg-white text-[15px] font-semibold text-neutral-950">Call Mike</a>
              <a href={`sms:${PHONE.replace(/-/g, "")}`} className="flex h-12 items-center justify-center rounded-xl border border-white/15 text-[15px] font-semibold text-white">Text Mike</a>
            </div>
          </>
        )}
        <footer className="pt-6 text-center text-[12px] text-neutral-600">Done once. Done right. · Isola · {PHONE}</footer>
      </main>
    </div>
  );
}
