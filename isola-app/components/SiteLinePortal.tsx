"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Shell, Label, Pill, YellowButton, PHONE, TEL, Y, HEAD, midDate, isToday } from "@/components/siteline/ui";

/* /siteline/<token> — every project for one client, each opening its own SiteLine page.
   Data comes from public_siteline_portal(token): status and dates only, never money or notes.
   v7.5: website SiteLine look. */

type P = { token: string; job_name: string; location?: string; phase: string; start_date?: string; completed_date?: string; next_day?: string; needs_signature?: boolean };

function line(p: P) {
  if (p.needs_signature) return "Waiting on your signature";
  if (p.phase === "Complete") return p.completed_date ? `Finished ${midDate(p.completed_date)}` : "Finished";
  if (p.phase === "In progress") return p.next_day ? `Next on site: ${isToday(p.next_day) ? "today" : midDate(p.next_day)}` : "Work underway";
  if (p.phase === "Scheduled") return p.start_date ? `Starts ${midDate(p.start_date)}` : "Start date coming soon";
  return p.start_date ? `Estimated start ${midDate(p.start_date)}` : "";
}

function Row({ p }: { p: P }) {
  const done = p.phase === "Complete";
  return (
    <a href={`/site/${p.token}`} className="mb-2.5 block px-4 py-3.5 transition-colors hover:bg-[#EEE]"
      style={{ background: p.needs_signature ? "#FFF8D6" : "#F5F5F5", borderLeft: `3px solid ${done ? "#CFCFCF" : Y}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-bold leading-snug text-[#111]">{p.job_name}</div>
          {p.location && p.location !== p.job_name ? <div className="mt-0.5 truncate text-[13px] text-[#686868]">{p.location}</div> : null}
        </div>
        <Pill tone={done ? "gray" : "yellow"}>{p.needs_signature ? "Sign" : p.phase}</Pill>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
        <span className={p.needs_signature ? "font-bold text-[#111]" : "text-[#555]"}>{line(p)}</span>
        <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#111]">Open ↗</span>
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

  if (loading) {
    return (
      <Shell>
        <div className="space-y-3" aria-busy="true">
          <div className="h-7 w-2/3 animate-pulse bg-[#EEE]" />
          <div className="h-20 animate-pulse bg-[#F3F3F3]" />
          <div className="h-20 animate-pulse bg-[#F3F3F3]" />
        </div>
      </Shell>
    );
  }
  if (!d?.ok) {
    return (
      <Shell>
        <h1 className="text-[22px] font-extrabold text-[#111]" style={HEAD}>{d?.error === "expired" ? "This link has expired" : "This link isn't active"}</h1>
        <p className="mt-2 text-[14px] text-[#555]">Get a fresh one in a few seconds.</p>
        <div className="mt-5"><YellowButton href="/siteline">Email me a new link ↗</YellowButton></div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Label className="!text-[9px]">Private client page</Label>
      {d.name ? <div className="mt-4 text-[14px] text-[#666]">Hi {d.name},</div> : null}
      <h1 className={`${d.name ? "mt-0.5" : "mt-4"} text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[#111]`} style={HEAD}>Your projects</h1>

      {projects.length === 0 ? (
        <p className="mt-4 text-[14px] text-[#555]">No projects to show right now. Call Mike at {PHONE} with any questions.</p>
      ) : null}

      {active.length ? (
        <section className="mt-5">
          {done.length ? <Label className="mb-3 !text-[10px] !text-[#111]">Current</Label> : null}
          {active.map((p) => <Row key={p.token} p={p} />)}
        </section>
      ) : null}

      {done.length ? (
        <section className="mt-6">
          <Label className="mb-3 !text-[10px] !text-[#111]">Completed</Label>
          {shownDone.map((p) => <Row key={p.token} p={p} />)}
          {shownDone.length < done.length ? (
            <button onClick={() => setShowDone(true)} className="mt-2 border-b-2 pb-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#111]" style={{ borderColor: Y }}>
              Show all {done.length} completed
            </button>
          ) : null}
        </section>
      ) : null}

      <div className="mt-7">
        <YellowButton href={`tel:${TEL}`}>Contact project lead ↗</YellowButton>
        <a href={`sms:${TEL}`} className="mt-3 block text-center text-[12px] font-bold text-[#555] underline decoration-[#CCC] underline-offset-4">or send a text</a>
      </div>
    </Shell>
  );
}
