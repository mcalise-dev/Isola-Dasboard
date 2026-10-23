"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SignBar } from "@/components/siteline/SignBar";
import { Shell, Label, Pill, YellowButton, PHONE, TEL, Y, HEAD, midDate, isToday, money } from "@/components/siteline/ui";

/* /siteline/<token> — every project for one client, each opening its own SiteLine page.
   Data comes from public_siteline_portal(token): status and dates only, never money or notes.
   v7.5: website SiteLine look. */

type P = { token: string; job_name: string; location?: string; phase: string; start_date?: string; completed_date?: string; next_day?: string; needs_signature?: boolean; sign_token?: string; sign_kind?: string; sign_title?: string; sign_price?: number };

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

/** big yellow card for anything waiting on the client's signature — goes straight to the signing page */
function SignCard({ p, n, of }: { p: P; n: number; of: number }) {
  const word = p.sign_kind === "change_order" ? "change order" : "proposal";
  const href = p.sign_token ? `/p/${p.sign_token}` : `/site/${p.token}`;
  return (
    <div className="mb-3 p-5 text-[#111] shadow-[0_10px_24px_rgba(242,197,0,0.4)]" style={{ background: Y }}>
      <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em]">
        <span className="flex items-center gap-2"><span aria-hidden className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#111]" /> Signature needed</span>
        {of > 1 ? <span className="opacity-70">{n} of {of}</span> : null}
      </div>
      <div className="mt-2 text-[19px] font-extrabold leading-snug" style={HEAD}>{p.job_name}</div>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-[14px]">
        <span className="font-semibold">{word.charAt(0).toUpperCase() + word.slice(1)}{p.sign_title ? `: ${p.sign_title}` : ""}</span>
        {p.sign_price != null ? <span className="shrink-0 text-[18px] font-extrabold tabular-nums" style={HEAD}>{money(p.sign_price)}</span> : null}
      </div>
      <a href={href} className="mt-4 flex h-14 items-center justify-center gap-2 bg-[#111] text-[13px] font-extrabold uppercase tracking-[0.1em] text-white transition-transform active:scale-[0.99]">
        Review &amp; sign <span aria-hidden className="text-[18px] leading-none" style={{ color: Y }}>→</span>
      </a>
      <div className="mt-2.5 flex items-center justify-between text-[12px]">
        <span className="opacity-75">Takes about a minute on your phone.</span>
        <a href={`/site/${p.token}`} className="font-bold underline underline-offset-4">View project</a>
      </div>
    </div>
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
  const toSign = projects.filter((p) => p.needs_signature);
  const active = projects.filter((p) => p.phase !== "Complete" && !p.needs_signature);
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

      {toSign.length ? (
        <section className="mt-5">
          <div className="mb-3 flex items-center gap-3 bg-[#111] px-4 py-3 text-white">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[15px] font-black text-[#111]" style={{ background: Y }}>{toSign.length}</span>
            <span className="text-[14px] font-bold leading-snug">
              {toSign.length === 1 ? "1 item is waiting for your signature." : `${toSign.length} items are waiting for your signature.`}
              <span className="block text-[12px] font-normal text-[#CFCFCF]">Start below. Each one takes about a minute.</span>
            </span>
          </div>
          {toSign.map((p, i) => <SignCard key={p.token} p={p} n={i + 1} of={toSign.length} />)}
        </section>
      ) : null}

      {active.length ? (
        <section className="mt-5">
          {done.length || toSign.length ? <Label className="mb-3 !text-[10px] !text-[#111]">Current</Label> : null}
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
      {toSign.length ? <SignBar href={toSign[0].sign_token ? `/p/${toSign[0].sign_token}` : `/site/${toSign[0].token}`} count={toSign.length} /> : null}
    </Shell>
  );
}
