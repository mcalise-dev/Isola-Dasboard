"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
// condensed display face for the welcome, titles and big numbers — client page only
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";

/* Isola SiteLine — the client's no-login project page (/site/<token>). Every job has one.
   v7.0 (10/22/26): one page for the whole job — proposal/change orders to sign, the job,
   where it stands, site days, daily updates.
   v7.2 (10/22/26): sleek redesign. Welcome + optional property photo sub-banner up top,
   a numbered stepper, an at-a-glance row, updates as a timeline. A hazard stripe under
   the header is the one loud element; everything else is quiet dark panels.
   Everything comes from public_siteline(token): the contract price the client agreed to,
   never costs, crew pay or internal notes. */

const PHONE = "508-933-2661";
const EMAIL = "mcalise@isola-ri.com";
const DISPLAY = { fontFamily: '"Barlow Condensed", var(--font-geist-sans), sans-serif' } as const;

const parse = (iso: string) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const longDate = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
const midDate = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
const shortDate = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
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

// The client's view of where the job is. "Planning"/"Awaiting approval" both sit on Proposal.
const STEPS = ["Proposal", "Scheduled", "In progress", "Complete"];
const stepOf = (phase: string) => (phase === "Complete" ? 3 : phase === "In progress" ? 2 : phase === "Scheduled" ? 1 : 0);

const panel = "rounded-2xl border border-white/[0.07] bg-[#0C0F12] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

function Photo({ src }: { src: string }) {
  const [big, setBig] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setBig(true)} className="mt-3 block overflow-hidden rounded-xl border border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Photo from the site" className="max-h-60 w-auto object-cover" />
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

function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className={`${panel} p-5 sm:p-6`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[24px] font-semibold leading-none text-white" style={DISPLAY}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function DocRow({ doc }: { doc: any }) {
  const isCO = doc.kind === "change_order";
  const signed = doc.status === "approved";
  const open = doc.status === "sent" || doc.status === "viewed";
  const word = isCO ? "change order" : "proposal";
  return (
    <div className={`rounded-2xl p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${open ? "border border-brand/60 bg-[#14130c]" : "border border-white/[0.07] bg-[#0C0F12]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-neutral-400">{isCO ? "Change order" : "Proposal"}</div>
          <div className="mt-0.5 text-[16px] font-semibold leading-snug text-white">{doc.title}</div>
        </div>
        {doc.price != null ? <div className="shrink-0 text-[28px] font-bold leading-none tabular-nums text-white" style={DISPLAY}>{money(doc.price)}</div> : null}
      </div>
      {signed ? (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[13px] font-medium text-emerald-300">
          <span aria-hidden>✓</span> Signed{doc.approved_by ? ` by ${doc.approved_by}` : ""}{doc.approved_at ? `, ${midDate(doc.approved_at)}` : ""}
        </div>
      ) : doc.status === "declined" ? (
        <div className="mt-3 text-sm text-neutral-400">Declined</div>
      ) : doc.status === "expired" ? (
        <div className="mt-3 text-sm text-amber-300">This {word} has expired. Call {PHONE} for an updated price.</div>
      ) : (
        <div className="mt-2 text-sm text-neutral-300">
          Waiting on your signature{doc.expires_at ? `, good through ${parse(doc.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric" })}` : ""}.
          {!isCO && doc.deposit_amount ? <> {money(doc.deposit_amount)} deposit to schedule.</> : null}
        </div>
      )}
      <a href={`/p/${doc.token}`}
        className={`mt-4 flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold transition-colors ${open ? "bg-brand text-neutral-950 hover:bg-[#E2AE14]" : "border border-white/15 text-white hover:bg-white/[0.04]"}`}>
        {open ? `Review and sign the ${word}` : signed ? `View the signed ${word}` : `View the ${word}`}
      </a>
    </div>
  );
}

function Glance({ label, value, note, wide }: { label: string; value: React.ReactNode; note?: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`${panel} px-4 py-4 ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <div className="text-[13px] text-neutral-400">{label}</div>
      <div className="mt-1.5 text-[26px] font-bold leading-[1.05] text-white sm:text-[30px]" style={DISPLAY}>{value}</div>
      {note ? <div className="mt-1 text-xs leading-snug text-neutral-500">{note}</div> : null}
    </div>
  );
}

export default function PublicSiteLine({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

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
  const proposals = docs.filter((x) => x.kind !== "change_order");
  const cos = docs.filter((x) => x.kind === "change_order");
  const waiting = docs.filter((x) => x.status === "sent" || x.status === "viewed");
  const step = stepOf(d?.phase);
  const scopeLines = String(d?.scope ?? "").split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  const total = d?.price != null ? Number(d.price) + Number(d.co_total || 0) : null;
  const closed = d?.phase === "Closed";
  const complete = d?.phase === "Complete";

  return (
    <div className="min-h-screen bg-[#050607] text-neutral-100 antialiased">
      {/* header */}
      <header className="sticky top-0 z-30 bg-[#050607]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Isola" className="h-9 w-9 rounded-full ring-1 ring-white/15" />
          <div className="leading-none">
            <div className="text-[20px] font-bold tracking-[0.08em] text-white" style={DISPLAY}>ISOLA <span className="text-brand">SITELINE</span></div>
            <div className="mt-1 text-[12px] text-neutral-500">Your project page</div>
          </div>
          <a href={`tel:${PHONE.replace(/-/g, "")}`} className="ml-auto rounded-full border border-white/15 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-white/[0.05]">Call Mike</a>
        </div>
        <div aria-hidden className="h-[3px]" style={{ background: "repeating-linear-gradient(-45deg, #F2C230 0 9px, #050607 9px 18px)" }} />
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-7">
        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="h-10 w-2/3 animate-pulse rounded-lg bg-white/[0.05]" />
            <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
            <div className="h-28 animate-pulse rounded-2xl bg-white/[0.04]" />
          </div>
        ) : failed ? (
          <div className={`${panel} p-6`}>
            <div className="text-[24px] font-semibold text-white" style={DISPLAY}>Couldn&apos;t load your project</div>
            <p className="mt-2 text-sm text-neutral-300">Check your connection and try again.</p>
            <button onClick={load} className="mt-5 h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-neutral-950">Try again</button>
          </div>
        ) : !d?.ok ? (
          <div className={`${panel} p-6`}>
            <div className="text-[24px] font-semibold text-white" style={DISPLAY}>This link isn&apos;t active</div>
            <p className="mt-2 text-sm text-neutral-300">Call Isola at {PHONE} for a new one.</p>
          </div>
        ) : (
          <>
            {/* hero: welcome, job, property sub-banner, stepper */}
            <section className="px-1">
              {d.welcome_name ? (
                <h1 className="text-[44px] font-bold leading-[0.95] text-white sm:text-[56px]" style={DISPLAY}>
                  Welcome, {d.welcome_name}
                </h1>
              ) : (
                <h1 className="text-[40px] font-bold leading-[0.95] text-white sm:text-[52px]" style={DISPLAY}>{d.job_name}</h1>
              )}
              <div className="mt-3 text-[15px] text-neutral-300">
                {d.welcome_name ? <span className="font-semibold text-white">{d.job_name}</span> : null}
                {d.welcome_name && (d.customer || (!d.cover_photo && d.location)) ? <span className="text-neutral-600"> / </span> : null}
                {d.customer || (!d.cover_photo ? d.location : "")}
              </div>
            </section>

            {d.cover_photo ? (
              <figure className="relative overflow-hidden rounded-2xl border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.cover_photo} alt="Your property" className="h-44 w-full object-cover sm:h-56" />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent px-4 pb-3 pt-12 text-[13px] font-medium text-white/90">
                  {d.location || "Your property"}
                </figcaption>
              </figure>
            ) : null}

            {closed ? (
              <div className={`${panel} px-5 py-4 text-sm text-neutral-300`}>This project is closed.</div>
            ) : (
              <ol className={`${panel} grid grid-cols-4 gap-2 px-4 py-5 sm:px-6`} aria-label="Where your project stands">
                {STEPS.map((p, i) => {
                  const done = i < step || (complete && i === step);
                  const now = i === step && !complete;
                  return (
                    <li key={p} className="relative flex flex-col items-center text-center">
                      {i > 0 ? <span aria-hidden className={`absolute -left-1/2 right-1/2 top-[15px] h-[2px] ${i <= step ? "bg-brand" : "bg-white/10"}`} /> : null}
                      <span className={`relative z-[1] flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold
                        ${done ? "bg-brand text-neutral-950" : now ? "bg-[#050607] text-brand ring-2 ring-brand" : "bg-[#050607] text-neutral-500 ring-1 ring-white/15"}`}>
                        {done ? "✓" : i + 1}
                      </span>
                      <span className={`mt-2 text-[12px] leading-tight sm:text-[13px] ${now ? "font-semibold text-white" : done ? "text-neutral-300" : "text-neutral-500"}`}>{p}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {waiting.length ? (
              <div className="flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/[0.07] px-4 py-3 text-[14px] text-white">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand" />
                {waiting.length === 1 ? "One item needs your signature below." : `${waiting.length} items need your signature below.`}
              </div>
            ) : null}

            {/* signing comes first when anything is open */}
            {proposals.length ? (
              <div className="space-y-3">{proposals.map((x) => <DocRow key={x.token} doc={x} />)}</div>
            ) : null}
            {cos.length ? (
              <div className="space-y-3">{cos.map((x) => <DocRow key={x.token} doc={x} />)}</div>
            ) : null}

            {/* at a glance */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {total != null && total > 0 ? (
                <Glance label="Contract price" value={money(total)}
                  note={Number(d.co_total) ? `Includes ${money(d.co_total)} in change orders` : undefined} />
              ) : null}
              <Glance
                label={complete ? "Completed" : d.phase === "In progress" ? "Started" : "Estimated start"}
                value={complete && d.completed_date ? midDate(d.completed_date) : d.start_date ? midDate(d.start_date) : "TBD"}
                note={!complete && d.phase !== "In progress" && d.start_date ? "Weather can move this" : !d.start_date && !complete ? "Set once you sign" : undefined} />
              {!complete && !closed ? (
                <Glance label="Crew on site next" wide={total != null && total > 0}
                  value={next.length ? (isToday(next[0]) ? "Today" : midDate(next[0])) : "—"}
                  note={next.length > 1 ? `Then ${next.slice(1, 3).map(shortDate).join(", ")}${next.length > 3 ? "…" : ""}` : d.last_on_site ? `Last on site ${midDate(d.last_on_site)}` : undefined} />
              ) : null}
            </div>

            {/* the job */}
            {(scopeLines.length || d.location || d.work_type) ? (
              <Panel title="The work" aside={d.work_type ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[12px] text-neutral-300">{d.work_type}</span> : null}>
                {d.location ? (
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(d.location)}`} target="_blank" rel="noopener noreferrer"
                    className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3 text-[15px] font-medium text-white hover:bg-white/[0.03]">
                    <span className="min-w-0 truncate">{d.location}</span>
                    <span className="shrink-0 text-[13px] text-neutral-400">Open map</span>
                  </a>
                ) : null}
                {scopeLines.length ? (
                  <ul className="space-y-2.5">
                    {scopeLines.map((l, i) => (
                      <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-neutral-200">
                        <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rotate-45 bg-brand" />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Panel>
            ) : null}

            {/* updates as a timeline */}
            <Panel title="Daily updates" aside={updates.length ? <span className="text-[13px] text-neutral-500">{updates.length}</span> : null}>
              {updates.length === 0 ? (
                <p className="text-[15px] text-neutral-400">
                  {step === 0 ? "Once the proposal is signed and work starts, updates from the crew show up here." : "Updates from the crew show up here as work gets done."}
                </p>
              ) : (
                <ol className="relative ml-1.5 border-l border-white/10">
                  {updates.map((u, i) => (
                    <li key={u.id} className="relative pb-6 pl-6 last:pb-0">
                      <span aria-hidden className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-brand" : "bg-neutral-600"}`} />
                      <div className="text-[13px] font-medium text-neutral-400">{isToday(u.date) ? "Today" : longDate(u.date)}</div>
                      <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-100">{u.body}</p>
                      {u.photo ? <Photo src={u.photo} /> : null}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            {/* contact */}
            <section className={`${panel} p-5 sm:p-6`}>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-[18px] font-bold text-neutral-950" style={DISPLAY}>MC</span>
                <div>
                  <div className="text-[16px] font-semibold text-white">Mike Calise</div>
                  <div className="text-[13px] text-neutral-400">Your project lead at Isola</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <a href={`tel:${PHONE.replace(/-/g, "")}`} className="flex h-12 items-center justify-center rounded-xl bg-brand text-[15px] font-semibold text-neutral-950 hover:bg-[#E2AE14]">Call</a>
                <a href={`sms:${PHONE.replace(/-/g, "")}`} className="flex h-12 items-center justify-center rounded-xl border border-white/15 text-[15px] font-semibold text-white hover:bg-white/[0.04]">Text</a>
                <a href={`mailto:${EMAIL}?subject=${encodeURIComponent(d.job_name)}`} className="flex h-12 items-center justify-center rounded-xl border border-white/15 text-[15px] font-semibold text-white hover:bg-white/[0.04]">Email</a>
              </div>
            </section>
          </>
        )}
        <footer className="pt-4 text-center text-[12px] text-neutral-600">
          Done once. Done right. Isola Excavation &amp; Design, {PHONE}
        </footer>
      </main>
    </div>
  );
}
