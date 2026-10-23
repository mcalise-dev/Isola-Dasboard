"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SignBar, signNeed } from "@/components/siteline/SignBar";
import { Shell, Label, Pill, PhaseTrack, DataCard, YellowButton, Section, PHONE, TEL, Y, YD, HEAD, dayDate, midDate, isToday, money } from "@/components/siteline/ui";

/* Isola SiteLine — the client's no-login project page (/site/<token>). Every job has one.
   v7.5 (10/23/26): same look as the SiteLine example screen on isola-ri.com, so the website
   and the real thing match — white card, status pill, numbered steps, yellow-edged cards,
   big yellow contact button. Content stays the simple v7.3 set: signature first, where it
   stands, the work, updates, documents.
   Everything comes from public_siteline(token): the contract price the client agreed to,
   never costs, crew pay or internal notes. */

const STEPS = ["Proposal", "Scheduled", "In progress", "Complete"];
const stepOf = (phase: string) => (phase === "Complete" ? 3 : phase === "In progress" ? 2 : phase === "Scheduled" ? 1 : 0);

function Photo({ src }: { src: string }) {
  const [big, setBig] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setBig(true)} className="mt-3 block overflow-hidden border border-[#DDD]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Photo from the site" className="max-h-56 w-auto object-cover" />
      </button>
      {big ? (
        <div onClick={() => setBig(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Photo from the site" className="max-h-full max-w-full" />
        </div>
      ) : null}
    </>
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
  const pill = closed ? "Closed" : complete ? "Complete" : working ? "In progress" : scheduled ? "Scheduled" : waiting.length ? "Needs signature" : "Proposal";

  // the one date that matters right now
  const when = complete
    ? { icon: "✓", label: "Finished", value: d?.completed_date ? dayDate(d.completed_date) : "Complete", note: "Thanks for working with Isola." }
    : working
      ? { icon: "▣", label: "Next on site", value: next.length ? (isToday(next[0]) ? "Today" : dayDate(next[0])) : "Being scheduled",
          note: next.length > 1 ? `Then ${next.slice(1, 3).map(midDate).join(", ")}${next.length > 3 ? "…" : ""}` : d?.last_on_site ? `Last on site ${midDate(d.last_on_site)}` : null }
      : scheduled
        ? { icon: "▣", label: "Start date", value: d?.start_date ? dayDate(d.start_date) : "Coming soon", note: d?.start_date ? "Weather can move this. We'll let you know." : null }
        : { icon: "▣", label: "Estimated start", value: d?.start_date ? dayDate(d.start_date) : "Set once you sign", note: null };

  if (loading) {
    return (
      <Shell>
        <div className="space-y-3" aria-busy="true">
          <div className="h-3 w-1/3 animate-pulse bg-[#EEE]" />
          <div className="h-7 w-3/4 animate-pulse bg-[#EEE]" />
          <div className="h-20 animate-pulse bg-[#F3F3F3]" />
          <div className="h-16 animate-pulse bg-[#F3F3F3]" />
        </div>
      </Shell>
    );
  }
  if (failed || !d?.ok) {
    return (
      <Shell>
        <h1 className="text-[22px] font-extrabold text-[#111]" style={HEAD}>{failed ? "Couldn't load your project" : "This link isn't active"}</h1>
        <p className="mt-2 text-[14px] text-[#555]">{failed ? "Check your connection and try again." : `Call Isola at ${PHONE}, or get your current link below.`}</p>
        <div className="mt-5">
          {failed ? <YellowButton onClick={load}>Try again</YellowButton> : <YellowButton href="/siteline">Find my projects</YellowButton>}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Label className="!text-[9px]">Private project page</Label>
      {d.welcome_name ? <div className="mt-4 text-[14px] text-[#666]">Hi {d.welcome_name},</div> : null}
      <h1 className={`${d.welcome_name ? "mt-0.5" : "mt-4"} text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-[#111]`} style={HEAD}>{d.job_name}</h1>
      <div className="mt-1 text-[14px] text-[#555]">
        {d.customer ? <span>{d.customer}</span> : null}
        {d.customer && d.location ? <span className="text-[#AAA]"> · </span> : null}
        {d.location ? (
          <a href={`https://maps.google.com/?q=${encodeURIComponent(d.location)}`} target="_blank" rel="noopener noreferrer" className="underline decoration-[#CCC] underline-offset-4">{d.location}</a>
        ) : null}
      </div>

      {d.cover_photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.cover_photo} alt="Your property" className="mt-4 h-40 w-full border border-[#DDD] object-cover" />
      ) : null}

      {/* anything waiting on the client comes first */}
      {waiting.map((doc) => {
        const isCO = doc.kind === "change_order";
        const word = isCO ? "change order" : "proposal";
        const need = signNeed(doc.kind, phase);
        return (
          <div key={doc.token} className="mt-5 p-5 text-[#111] shadow-[0_10px_24px_rgba(242,197,0,0.4)]" style={{ background: Y }}>
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em]">
              <span aria-hidden className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#111]" /> {need.label}
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <div className="text-[17px] font-extrabold leading-snug" style={HEAD}><span className="capitalize">{word}</span>: {doc.title}</div>
              {doc.price != null ? <div className="shrink-0 text-[20px] font-extrabold tabular-nums" style={HEAD}>{money(doc.price)}</div> : null}
            </div>
            <a href={`/p/${doc.token}`} className="mt-4 flex h-14 items-center justify-center gap-2 bg-[#111] text-[13px] font-extrabold uppercase tracking-[0.1em] text-white">
              Review &amp; sign <span aria-hidden className="text-[18px] leading-none" style={{ color: Y }}>→</span>
            </a>
            <div className="mt-2.5 text-[12px] leading-snug opacity-80">{need.why} Takes about a minute.</div>
          </div>
        );
      })}

      {/* where it stands */}
      <div className="mb-4 mt-6 flex items-center justify-between gap-2">
        <Label className="!text-[10px] !text-[#111]">Project status</Label>
        <Pill tone={complete || closed ? "done" : "yellow"}>{pill}</Pill>
      </div>
      {closed ? (
        <p className="mb-5 text-[14px] text-[#555]">This project is closed.</p>
      ) : (
        <div className="mb-6"><PhaseTrack steps={STEPS} current={stepOf(phase)} complete={complete} /></div>
      )}

      {!closed ? <DataCard icon={when.icon} label={when.label} value={when.value} note={when.note} /> : null}
      {total != null && total > 0 ? (
        <DataCard icon="$" label="Contract price" value={money(total)}
          note={Number(d.co_total) ? `Includes ${money(d.co_total)} in change orders` : null} />
      ) : null}
      <DataCard label="Your direct line" value="Mike Calise" note="Your project lead. One tap to call." />
      <div className="mt-4">
        <YellowButton href={`tel:${TEL}`}>Contact project lead ↗</YellowButton>
        <a href={`sms:${TEL}`} className="mt-3 block text-center text-[12px] font-bold text-[#555] underline decoration-[#CCC] underline-offset-4">or send a text</a>
      </div>

      {scopeLines.length ? (
        <Section title="The work">
          <ul className="space-y-2">
            {scopeLines.map((l, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-[#333]">
                <span aria-hidden className="mt-[8px] h-1.5 w-1.5 shrink-0" style={{ background: Y }} />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {updates.length ? (
        <Section title="Updates">
          <div className="space-y-5">
            {shown.map((u) => (
              <div key={u.id}>
                <div className="text-[12px] font-bold" style={{ color: YD }}>{isToday(u.date) ? "Today" : dayDate(u.date)}</div>
                <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-[#222]">{u.body}</p>
                {u.photo ? <Photo src={u.photo} /> : null}
              </div>
            ))}
          </div>
          {updates.length > 3 ? (
            <button onClick={() => setAllUpdates((v) => !v)} className="mt-4 border-b-2 pb-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#111]" style={{ borderColor: Y }}>
              {allUpdates ? "Show less" : `Show all ${updates.length} updates`}
            </button>
          ) : null}
        </Section>
      ) : null}

      {filed.length ? (
        <Section title="Your documents">
          <p className="-mt-1 mb-3 text-[13px] text-[#666]">Tap a document to open it.</p>
          <div className="space-y-2.5">
            {filed.map((doc) => {
              const signed = doc.status === "approved";
              const status = signed ? `Signed ${midDate(doc.approved_at)}` : doc.status === "declined" ? "Declined" : doc.status === "expired" ? "Expired" : "Not signed";
              return (
                <a key={doc.token} href={`/p/${doc.token}`}
                  className="flex items-center gap-3 border border-[#E2E2E2] bg-white px-3.5 py-3 transition-colors hover:border-[#111] active:bg-[#F7F7F7]">
                  <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center bg-[#F3F3F3]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold leading-snug text-[#111]">{doc.kind === "change_order" ? "Change order" : "Proposal"}: {doc.title}</span>
                    <span className={`block text-[12px] ${signed ? "text-[#2E7D32]" : "text-[#777]"}`}>{signed ? "✓ " : ""}{status}</span>
                  </span>
                  <span className="flex h-9 shrink-0 items-center gap-1 px-3 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#111]" style={{ background: Y }}>
                    View <span aria-hidden>→</span>
                  </span>
                </a>
              );
            })}
          </div>
        </Section>
      ) : null}

      <a href="/siteline" className="mt-7 block text-center text-[12px] font-bold text-[#777]">See all your projects →</a>
      {waiting.length ? <SignBar href={`/p/${waiting[0].token}`} label={waiting.length > 1 ? `${waiting.length} to sign · Start now` : `Review & sign the ${waiting[0].kind === "change_order" ? "change order" : "proposal"}`} /> : null}
    </Shell>
  );
}
