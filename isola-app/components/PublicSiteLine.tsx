"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
// condensed display face for the job name and status — client page only
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";

/* Isola SiteLine — the client's no-login project page (/site/<token>). Every job has one.
   v7.3 (10/22/26): simplified. Mike found v7.2 too busy for clients. The page is now four
   plain pieces, top to bottom:
     1. Anything waiting on the client's signature (yellow button) — only when there is one
     2. Where the job stands — one status card: status word, the one date that matters, price
     3. The work — the scope list
     4. Updates — latest three, the rest behind "Show all"
   then a Call / Text bar and the signed paperwork as a small list.
   Removed: the stepper, the three at-a-glance tiles, the signature banner, the map box,
   the work-type chip, the contact card. Everything still comes from public_siteline(token):
   the contract price the client agreed to, never costs, crew pay or internal notes. */

const PHONE = "508-933-2661";
const TEL = PHONE.replace(/-/g, "");
const DISPLAY = { fontFamily: '"Barlow Condensed", var(--font-geist-sans), sans-serif' } as const;

const parse = (iso: string) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const dayDate = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
const midDate = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
const money = (n: any) => {
  if (n == null || n === "") return null;
  const v = Number(n), cents = Math.round(v * 100) % 100 !== 0;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
};
const isToday = (iso: any) => {
  const n = new Date();
  const t = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  return String(iso).slice(0, 10) === t;
};
const when = (iso: any) => (isToday(iso) ? "Today" : dayDate(iso));

const card = "rounded-2xl border border-white/[0.08] bg-[#0C0F12]";

function Photo({ src }: { src: string }) {
  const [big, setBig] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setBig(true)} className="mt-3 block overflow-hidden rounded-xl border border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Photo from the site" className="max-h-56 w-auto object-cover" />
      </button>
      {big ? (
        <div onClick={() => setBig(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Photo from the site" className="max-h-full max-w-full rounded-lg" />
        </div>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${card} p-5`}>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{title}</h2>
      {children}
    </section>
  );
}

export default function PublicSiteLine({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [allUpdates, setAllUpdates] = useState(false);

  async function load() {
    setFailed(false);
    const { data, error } = await supabase.rpc("public_siteline", { p_token: token });
    if (error) setFailed(true);
    setD(data);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  const updates: any[] = d?.updates ?? [];
  const next: string[] = d?.next_days ?? [];
  const docs: any[] = d?.docs ?? [];
  const waiting = docs.filter((x) => x.status === "sent" || x.status === "viewed");
  const filed = docs.filter((x) => !(x.status === "sent" || x.status === "viewed"));
  const scopeLines = String(d?.scope ?? "").split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  const total = d?.price != null ? Number(d.price) + Number(d.co_total || 0) : null;
  const phase: string = d?.phase ?? "";
  const complete = phase === "Complete";
  const closed = phase === "Closed";
  const working = phase === "In progress";
  const scheduled = phase === "Scheduled";
  const shown = allUpdates ? updates : updates.slice(0, 3);

  // one status word + the one date the client cares about right now
  const status = closed ? "Closed" : complete ? "Complete" : working ? "In progress" : scheduled ? "Scheduled" : waiting.length ? "Waiting on your signature" : "Proposal";
  const dateLine = complete
    ? (d?.completed_date ? `Finished ${dayDate(d.completed_date)}` : null)
    : working
      ? (next.length ? `Crew on site next: ${when(next[0])}` : null)
      : scheduled
        ? (d?.start_date ? `Starts ${dayDate(d.start_date)}` : "Start date coming soon")
        : (d?.start_date ? `Estimated start ${dayDate(d.start_date)}` : null);
  const dateNote = scheduled && d?.start_date ? "Weather can move this. We'll let you know." : null;

  return (
    <div className="min-h-screen bg-[#050607] text-neutral-100 antialiased">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2.5 px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Isola" className="h-8 w-8 rounded-full ring-1 ring-white/15" />
          <div className="text-[18px] font-bold tracking-[0.08em] text-white" style={DISPLAY}>ISOLA <span className="text-brand">SITELINE</span></div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 pb-10 pt-6">
        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="h-10 w-2/3 animate-pulse rounded-lg bg-white/[0.05]" />
            <div className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />
          </div>
        ) : failed ? (
          <div className={`${card} p-6`}>
            <div className="text-[22px] font-semibold text-white" style={DISPLAY}>Couldn&apos;t load your project</div>
            <p className="mt-2 text-sm text-neutral-300">Check your connection and try again.</p>
            <button onClick={load} className="mt-5 h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-neutral-950">Try again</button>
          </div>
        ) : !d?.ok ? (
          <div className={`${card} p-6`}>
            <div className="text-[22px] font-semibold text-white" style={DISPLAY}>This link isn&apos;t active</div>
            <p className="mt-2 text-sm text-neutral-300">Call Isola at {PHONE} for a new one.</p>
          </div>
        ) : (
          <>
            {/* job name + address */}
            <div className="px-1">
              {d.welcome_name ? <div className="text-[15px] text-neutral-400">Hi {d.welcome_name},</div> : null}
              <h1 className="mt-0.5 text-[38px] font-bold leading-[1] text-white" style={DISPLAY}>{d.job_name}</h1>
              {d.location ? (
                <a href={`https://maps.google.com/?q=${encodeURIComponent(d.location)}`} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-block text-[15px] text-neutral-300 underline decoration-white/20 underline-offset-4">
                  {d.location}
                </a>
              ) : null}
            </div>

            {d.cover_photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.cover_photo} alt="Your property" className="h-40 w-full rounded-2xl border border-white/10 object-cover" />
            ) : null}

            {/* 1. what needs the client — only shows when something is open */}
            {waiting.map((doc) => {
              const isCO = doc.kind === "change_order";
              return (
                <a key={doc.token} href={`/p/${doc.token}`}
                  className="block rounded-2xl bg-brand p-5 text-neutral-950 transition-colors hover:bg-[#E2AE14]">
                  <div className="text-[13px] font-semibold uppercase tracking-[0.12em] opacity-70">Needs your signature</div>
                  <div className="mt-1 flex items-baseline justify-between gap-3">
                    <div className="text-[17px] font-bold leading-snug">{isCO ? "Change order" : "Proposal"}: {doc.title}</div>
                    {doc.price != null ? <div className="shrink-0 text-[24px] font-bold tabular-nums" style={DISPLAY}>{money(doc.price)}</div> : null}
                  </div>
                  <div className="mt-3 text-[15px] font-semibold">Review and sign →</div>
                </a>
              );
            })}

            {/* 2. where it stands */}
            <section className={`${card} p-5`}>
              <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Status</div>
              <div className="mt-1 flex items-center gap-2.5">
                <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${complete || closed ? "bg-emerald-400" : "bg-brand"}`} />
                <span className="text-[30px] font-bold leading-none text-white" style={DISPLAY}>{status}</span>
              </div>
              {dateLine ? <div className="mt-3 text-[16px] text-neutral-100">{dateLine}</div> : null}
              {dateNote ? <div className="mt-1 text-[13px] text-neutral-500">{dateNote}</div> : null}
              {total != null && total > 0 ? (
                <div className="mt-4 flex items-baseline justify-between border-t border-white/[0.07] pt-3 text-[15px]">
                  <span className="text-neutral-400">Contract price</span>
                  <span className="font-semibold tabular-nums text-white">{money(total)}</span>
                </div>
              ) : null}
            </section>

            {/* 3. the work */}
            {scopeLines.length ? (
              <Section title="The work">
                <ul className="space-y-2">
                  {scopeLines.map((l, i) => (
                    <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-neutral-200">
                      <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {/* 4. updates — only once there are some */}
            {updates.length ? (
              <Section title="Updates">
                <div className="space-y-5">
                  {shown.map((u) => (
                    <div key={u.id}>
                      <div className="text-[13px] font-medium text-neutral-400">{when(u.date)}</div>
                      <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-100">{u.body}</p>
                      {u.photo ? <Photo src={u.photo} /> : null}
                    </div>
                  ))}
                </div>
                {updates.length > 3 ? (
                  <button onClick={() => setAllUpdates((v) => !v)} className="mt-4 text-[14px] font-semibold text-brand">
                    {allUpdates ? "Show less" : `Show all ${updates.length} updates`}
                  </button>
                ) : null}
              </Section>
            ) : null}

            {/* contact */}
            <div className="grid grid-cols-2 gap-3">
              <a href={`tel:${TEL}`} className="flex h-12 items-center justify-center rounded-xl bg-white text-[15px] font-semibold text-neutral-950">Call Mike</a>
              <a href={`sms:${TEL}`} className="flex h-12 items-center justify-center rounded-xl border border-white/15 text-[15px] font-semibold text-white">Text Mike</a>
            </div>

            {/* signed / past paperwork, kept small */}
            {filed.length ? (
              <div className="px-1 pt-2">
                <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Your documents</div>
                {filed.map((doc) => (
                  <a key={doc.token} href={`/p/${doc.token}`}
                    className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2.5 text-[14px]">
                    <span className="min-w-0 truncate text-neutral-300">{doc.kind === "change_order" ? "Change order" : "Proposal"}: {doc.title}</span>
                    <span className="shrink-0 text-neutral-500">
                      {doc.status === "approved" ? `Signed ${midDate(doc.approved_at)}` : doc.status === "declined" ? "Declined" : doc.status === "expired" ? "Expired" : "View"}
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </>
        )}
        <footer className="pt-6 text-center text-[12px] text-neutral-600">Done once. Done right. · Isola · {PHONE}</footer>
      </main>
    </div>
  );
}
