"use client";
import { useState } from "react";
import { DataCard, Section, Y, YD, HEAD, dayDate, midDate, isToday, money } from "@/components/siteline/ui";

/* Isola SiteLine — Time & Material tab (v7.6, 11/11/26).
   Only shows on T&M jobs. Everything comes from public_siteline(token).tm (siteline_tm in SQL):
   billed amounts only — the hourly rate the client agreed to and materials at the billed price.
   Never costs, markup, crew pay or crew names. */

const hrs = (h: number) => {
  const whole = Math.floor(h), min = Math.round((h - whole) * 60);
  return min ? `${whole} hr ${min} min` : `${whole} hr${whole === 1 ? "" : "s"}`;
};

function Thumbs({ srcs }: { srcs: string[] }) {
  const [big, setBig] = useState<string | null>(null);
  if (!srcs.length) return null;
  return (
    <>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {srcs.map((src, i) => (
          <button key={i} type="button" onClick={() => setBig(src)} className="block aspect-square overflow-hidden border border-[#DDD]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Photo from the site" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {big ? (
        <div onClick={() => setBig(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="Photo from the site" className="max-h-full max-w-full" />
        </div>
      ) : null}
    </>
  );
}

export const photosOf = (u: any): string[] => {
  const arr: string[] = Array.isArray(u?.photos) ? u.photos.filter(Boolean) : [];
  return arr.length ? arr : u?.photo ? [u.photo] : [];
};

export default function TmTab({ tm, updates = [] }: { tm: any; updates?: any[] }) {
  const [all, setAll] = useState(false);
  if (!tm) return null;
  const days: any[] = tm.days ?? [];
  const shown = all ? days : days.slice(0, 4);
  const open = Number(tm.since_invoice || 0);
  const balance = Math.round((Number(tm.billed_to_date || 0) - Number(tm.paid || 0)) * 100) / 100;

  return (
    <>
      {tm.next_plan || (tm.next_plan_photos ?? []).length ? (
        <DataCard icon="→" label="Next plan" value={tm.next_plan ? <span className="whitespace-pre-wrap text-[15px] font-semibold">{tm.next_plan}</span> : undefined}
          note={tm.next_plan_updated_at ? `Updated ${midDate(tm.next_plan_updated_at)}` : null}>
          <Thumbs srcs={(tm.next_plan_photos ?? []).filter(Boolean)} />
        </DataCard>
      ) : null}

      <Section title="Time & material tab">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-[#111] px-4 py-3.5 text-white">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#BBB]">Current tab</div>
            <div className="mt-1 text-[22px] font-extrabold tabular-nums" style={{ ...HEAD, color: Y }}>{money(open) ?? "$0"}</div>
            <div className="mt-0.5 text-[11px] text-[#BBB]">{tm.last_invoice_date ? `Since last invoice (${midDate(tm.last_invoice_date)})` : "Not invoiced yet"}</div>
          </div>
          <div className="bg-[#F5F5F5] px-4 py-3.5" style={{ borderLeft: `3px solid ${Y}` }}>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#777]">Billed to date</div>
            <div className="mt-1 text-[22px] font-extrabold tabular-nums text-[#111]" style={HEAD}>{money(tm.billed_to_date) ?? "$0"}</div>
            <div className="mt-0.5 text-[11px] text-[#777]">
              {Number(tm.paid) ? `Paid ${money(tm.paid)} · Balance ${money(balance)}` : Number(tm.invoiced) ? `Invoiced ${money(tm.invoiced)}` : "Whole job so far"}
            </div>
          </div>
        </div>
        {(tm.combined_jobs ?? []).length ? <p className="mt-2.5 text-[12px] font-semibold text-[#444]">Includes {(tm.combined_jobs as string[]).join(", ")}, billed together on the same invoice.</p> : null}
        {tm.labor_rate ? <p className="mt-1 text-[12px] text-[#777]">Labor billed at {money(tm.labor_rate)}/hr per worker. Materials at cost plus handling.</p> : null}

        <div className="mt-5 space-y-4">
          {shown.map((x) => (
            <div key={x.date} className="border border-[#E2E2E2] bg-white px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[13px] font-extrabold text-[#111]" style={HEAD}>{isToday(x.date) ? "Today" : dayDate(x.date)}</div>
                <div className="shrink-0 text-[16px] font-extrabold tabular-nums text-[#111]" style={HEAD}>{money(x.total)}</div>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]" style={{ color: YD }}>
                {Number(x.hours) ? <span className="font-bold">{x.crew > 1 ? `${x.crew} workers · ` : ""}{hrs(Number(x.hours))}</span> : <span className="font-bold">Materials only</span>}
                {x.invoiced ? <span className="text-[#888]">· Invoiced</span> : <span className="text-[#111]">· On current tab</span>}
                {(x.jobs ?? []).map((n: string) => <span key={n} className="ml-1 bg-[#111] px-1.5 py-[1px] text-[10px] font-extrabold uppercase tracking-[0.08em] text-white">{n}</span>)}
              </div>
              {x.work ? <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[#222]">{x.work}</p> : null}
              <Thumbs srcs={updates.filter((u) => String(u.date).slice(0, 10) === String(x.date).slice(0, 10)).flatMap(photosOf)} />
              <div className="mt-2.5 space-y-1 border-t border-[#EEE] pt-2 text-[13px] text-[#444]">
                {Number(x.labor) || Number(x.hours) ? (
                  <div className="flex justify-between gap-3"><span>Labor{Number(x.hours) ? ` · ${hrs(Number(x.hours))}` : ""}</span><span className="tabular-nums">{money(x.labor) ?? "$0"}</span></div>
                ) : null}
                {Number(x.no_charge_hours) ? (
                  <div className="flex justify-between gap-3 text-[#2E7D32]"><span>Extra time · {hrs(Number(x.no_charge_hours))}</span><span>No charge</span></div>
                ) : null}
                {(x.materials ?? []).map((m: any, i: number) => (
                  <div key={i} className="flex justify-between gap-3"><span className="min-w-0 truncate">{m.item}</span><span className="tabular-nums">{money(m.amount)}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {days.length > 4 ? (
          <button onClick={() => setAll((v) => !v)} className="mt-4 border-b-2 pb-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#111]" style={{ borderColor: Y }}>
            {all ? "Show less" : `Show all ${days.length} days`}
          </button>
        ) : null}
      </Section>
    </>
  );
}
