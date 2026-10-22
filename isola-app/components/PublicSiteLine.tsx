"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* Isola SiteLine — the client's no-login project page (/site/<token>). Every job has one.
   v7.0 (10/22/26): one page for the whole job, top to bottom —
     1. the proposal (and any change orders) to review and sign — signing opens /p/<token>
     2. the job: address, scope, price, estimated start
     3. where it stands: Proposal → Scheduled → In progress → Complete
     4. the crew's upcoming site days, and plain-language daily updates
   Everything comes from public_siteline(token): the contract price the client agreed to,
   never costs, crew pay or internal notes. */

const PHONE = "508-933-2661";
const EMAIL = "mcalise@isola-ri.com";

const parse = (iso: string) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const longDate = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
const shortDate = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
const money = (n: any) => (n == null || n === "" ? null : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
const isToday = (iso: any) => {
  const n = new Date();
  const t = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  return String(iso).slice(0, 10) === t;
};

// The client's view of where the job is. "Planning"/"Awaiting approval" both sit on Proposal.
const STEPS = ["Proposal", "Scheduled", "In progress", "Complete"];
const stepOf = (phase: string) => (phase === "Complete" ? 3 : phase === "In progress" ? 2 : phase === "Scheduled" ? 1 : 0);

function Photo({ src }: { src: string }) {
  const [big, setBig] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setBig(true)} className="mt-3 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Site photo" className="max-h-56 w-auto rounded-lg border border-white/10 object-cover" />
      </button>
      {big ? (
        <div onClick={() => setBig(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Site photo" className="max-h-full max-w-full" />
        </div>
      ) : null}
    </>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-neutral-900 shadow-sm">
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.03] px-4 py-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">{title}</span>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function DocRow({ doc }: { doc: any }) {
  const isCO = doc.kind === "change_order";
  const signed = doc.status === "approved";
  const open = doc.status === "sent" || doc.status === "viewed";
  const word = isCO ? "change order" : "proposal";
  return (
    <div className={`rounded-lg border p-4 ${open ? "border-2 border-brand" : "border-white/10"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">{isCO ? "Change order" : "Proposal"}</div>
          <div className="mt-0.5 text-[15px] font-semibold leading-snug">{doc.title}</div>
        </div>
        {doc.price != null ? <div className="shrink-0 text-lg font-extrabold tabular-nums">{money(doc.price)}</div> : null}
      </div>
      {signed ? (
        <div className="mt-2 text-sm text-emerald-300">✓ Signed{doc.approved_by ? ` by ${doc.approved_by}` : ""}{doc.approved_at ? ` on ${longDate(doc.approved_at)}` : ""}</div>
      ) : doc.status === "declined" ? (
        <div className="mt-2 text-sm text-neutral-400">Declined</div>
      ) : doc.status === "expired" ? (
        <div className="mt-2 text-sm text-amber-300">This {word} has expired — call {PHONE} for an updated price.</div>
      ) : (
        <div className="mt-1 text-sm text-neutral-300">
          Waiting on your signature{doc.expires_at ? ` · good through ${parse(doc.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric" })}` : ""}
          {!isCO && doc.deposit_amount ? <> · {money(doc.deposit_amount)} deposit to schedule</> : null}
        </div>
      )}
      <a href={`/p/${doc.token}`}
        className={`mt-3 block w-full rounded-lg py-3 text-center text-sm font-bold uppercase tracking-[0.12em] ${open ? "bg-brand text-neutral-950" : "border border-white/15 text-white"}`}>
        {open ? `Review & sign the ${word}` : signed ? `View signed ${word}` : `View ${word}`}
      </a>
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

  return (
    <div className="min-h-screen bg-black text-neutral-100">
      <div className="border-b-4 border-brand bg-black px-5 py-5">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Isola" className="h-10 w-auto" />
          <div>
            <div className="text-sm font-bold tracking-wide text-white">ISOLA <span className="text-brand">SITELINE</span></div>
            <div className="text-xs text-neutral-400">Your project with Isola Excavation &amp; Design</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {loading ? <div className="text-sm text-neutral-400">Loading…</div> : failed ? (
          <div className="rounded-xl border border-white/[0.07] bg-neutral-900 p-6 shadow-sm">
            <div className="text-lg font-bold">Couldn&apos;t load this project.</div>
            <p className="mt-2 text-sm text-neutral-300">Check your connection and try again.</p>
            <button onClick={load} className="mt-4 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-neutral-950">Try again</button>
          </div>
        ) : !d?.ok ? (
          <div className="rounded-xl border border-white/[0.07] bg-neutral-900 p-6 shadow-sm">
            <div className="text-lg font-bold">This link isn&apos;t active.</div>
            <p className="mt-2 text-sm text-neutral-300">Ask Isola for a new one at {PHONE}.</p>
          </div>
        ) : (
          <>
            {/* title + where it stands */}
            <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-neutral-900 shadow-sm">
              {d.cover_photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.cover_photo} alt="Your property" className="h-48 w-full object-cover sm:h-64" />
              ) : null}
              <div className="p-5">
              {d.welcome_name ? (
                <div className="mb-3 text-2xl font-extrabold leading-tight text-white">
                  Welcome, <span className="text-brand">{d.welcome_name}</span>
                </div>
              ) : null}
              <div className={d.welcome_name ? "text-lg font-bold leading-tight text-neutral-200" : "text-xl font-extrabold leading-tight"}>{d.job_name}</div>
              {d.customer ? <div className="mt-0.5 text-sm text-neutral-300">{d.customer}</div> : null}
              {d.phase === "Closed" ? (
                <div className="mt-4 inline-block rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold">Closed</div>
              ) : (
                <div className="mt-5 grid grid-cols-4 gap-1.5">
                  {STEPS.map((p, i) => (
                    <div key={p}>
                      <div className={`h-1.5 rounded-full ${i <= step ? "bg-brand" : "bg-white/10"}`} />
                      <div className={`mt-1.5 text-[11px] leading-tight ${i === step ? "font-bold text-white" : "text-neutral-400"}`}>{p}</div>
                    </div>
                  ))}
                </div>
              )}
              {waiting.length ? (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  {waiting.length === 1 ? "One item is" : `${waiting.length} items are`} waiting on your signature below.
                </div>
              ) : null}
              </div>
            </div>

            {/* 1. proposal + change orders */}
            {proposals.length ? (
              <Section title={proposals.length > 1 ? "Proposals" : "Proposal"}>
                <div className="space-y-3">{proposals.map((x) => <DocRow key={x.token} doc={x} />)}</div>
              </Section>
            ) : null}
            {cos.length ? (
              <Section title="Change orders">
                <div className="space-y-3">{cos.map((x) => <DocRow key={x.token} doc={x} />)}</div>
              </Section>
            ) : null}

            {/* 2. the job */}
            <Section title="The job">
              <dl className="grid gap-4 sm:grid-cols-2">
                {d.location ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Address</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold">
                      <a className="underline decoration-neutral-600 underline-offset-2" href={`https://maps.google.com/?q=${encodeURIComponent(d.location)}`} target="_blank" rel="noopener noreferrer">{d.location}</a>
                    </dd>
                  </div>
                ) : null}
                {d.work_type ? (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Work</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold">{d.work_type}</dd>
                  </div>
                ) : null}
                {total != null && total > 0 ? (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Price</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">{money(total)}</dd>
                    {Number(d.co_total) ? <dd className="text-xs text-neutral-400">includes {money(d.co_total)} in approved change orders</dd> : null}
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    {d.phase === "Complete" ? "Completed" : d.phase === "In progress" ? "Started" : "Estimated start"}
                  </dt>
                  <dd className="mt-0.5 text-[15px] font-semibold">
                    {d.phase === "Complete" && d.completed_date ? longDate(d.completed_date) : d.start_date ? longDate(d.start_date) : "To be scheduled"}
                  </dd>
                  {d.phase !== "Complete" && d.phase !== "In progress" && d.start_date ? <dd className="text-xs text-neutral-400">Weather and site conditions can move this — we&apos;ll keep this page current.</dd> : null}
                </div>
              </dl>
              {scopeLines.length ? (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Scope of work</div>
                  <ul className="mt-2 divide-y divide-white/[0.06]">
                    {scopeLines.map((l, i) => (
                      <li key={i} className="flex gap-2 py-1.5 text-[15px] leading-relaxed"><span className="text-neutral-400">—</span><span>{l}</span></li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Section>

            {/* 3. schedule */}
            {d.phase !== "Complete" && d.phase !== "Closed" ? (
              <Section title="Schedule">
                {next.length ? (
                  <>
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Crew on site next</div>
                    <div className="mt-0.5 text-lg font-bold">{isToday(next[0]) ? "Today" : longDate(next[0])}</div>
                    {next.length > 1 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {next.slice(1).map((x) => <span key={x} className="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-semibold">{shortDate(x)}</span>)}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-[15px] text-neutral-300">{step === 0 ? "We'll put your job on the calendar once the proposal is signed." : "Site days will show here as soon as they're on our calendar."}</div>
                )}
                {d.last_on_site ? <div className="mt-3 text-xs text-neutral-400">Last on site {longDate(d.last_on_site)}</div> : null}
              </Section>
            ) : null}

            {/* 4. updates */}
            <Section title="Daily updates">
              {updates.length === 0 ? (
                <div className="text-sm text-neutral-300">Updates will show here once work is underway.</div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {updates.map((u) => (
                    <div key={u.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{longDate(u.date)}</div>
                      <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{u.body}</p>
                      {u.photo ? <Photo src={u.photo} /> : null}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <div className="rounded-xl border border-white/[0.07] bg-neutral-900 p-5 shadow-sm">
              <div className="text-sm font-bold">Your project lead</div>
              <div className="mt-1 text-[15px]">Mike Calise, Isola Excavation &amp; Design</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <a href={`tel:${PHONE.replace(/-/g, "")}`} className="rounded-lg bg-brand px-3 py-3 text-center text-sm font-bold text-neutral-950">Call</a>
                <a href={`sms:${PHONE.replace(/-/g, "")}`} className="rounded-lg border border-white/15 px-3 py-3 text-center text-sm font-bold">Text</a>
                <a href={`mailto:${EMAIL}?subject=${encodeURIComponent(d.job_name)}`} className="rounded-lg border border-white/15 px-3 py-3 text-center text-sm font-bold">Email</a>
              </div>
            </div>
          </>
        )}
        <div className="pt-2 text-center text-xs text-neutral-400">Done once. Done right. · Isola Excavation &amp; Design · {PHONE}</div>
      </div>
    </div>
  );
}
