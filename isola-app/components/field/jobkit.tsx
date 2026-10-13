"use client";
// v5.4 — shared pieces for the crew job screen and the owner job record:
// plan of action grouped by phase, and materials/tools as a load-out checklist.
import { useState } from "react";
import { Check, ChevronDown, AlertTriangle, Store, User2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- helpers ----------
export const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

const PHASE_NAMES: Record<string, string> = {
  PRE: "Before the job",
  PREP: "Prep & dig out",
  DEMO: "Demo",
  DRAINS: "Drains",
  FORMS: "Forms & steel",
  POUR: "Pour",
  "NEXT DAY": "Next day",
  COBBLE: "Cobble edging",
  FINISH: "Finish & closeout",
};
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// "PREP: Dig the trench" -> { phase: "PREP", text: "Dig the trench" }
export function splitPhase(label: string): { phase: string; text: string } {
  const m = String(label ?? "").match(/^([A-Z][A-Z ]{1,14}):\s*([\s\S]*)$/);
  return m ? { phase: m[1].trim(), text: m[2].trim() } : { phase: "", text: String(label ?? "") };
}
export const phaseTitle = (p: string) => (p ? PHASE_NAMES[p] ?? titleCase(p) : "To do");

const HEADS_UP = /\b(FIRST|STOP|WATCH|ONLY IF|ONLY|DO NOT|NO FALL|BEFORE CONCRETE)\b/;
export const isHeadsUp = (t: string) => HEADS_UP.test(t);

export type Step = { id: string; label: string; done: boolean; done_by?: string | null; done_at?: string | null; added_by?: string | null };
export type Phase = { key: string; title: string; steps: (Step & { text: string })[]; done: number };

export function groupPlan(list: Step[]): Phase[] {
  const out: Phase[] = [];
  const byKey = new Map<string, Phase>();
  for (const s of list) {
    const { phase, text } = splitPhase(s.label);
    let g = byKey.get(phase);
    if (!g) { g = { key: phase, title: phaseTitle(phase), steps: [], done: 0 }; byKey.set(phase, g); out.push(g); }
    g.steps.push({ ...s, text });
    if (s.done) g.done++;
  }
  // un-labeled items ("To do") go first only if they came first; otherwise keep order of appearance
  return out;
}

// Who brings it / where it comes from. Uses the new columns, falls back to "Mike brings - ..." in notes.
export type Need = { id: string; item: string; qty?: string | null; notes?: string | null; bring_by?: string | null; source?: string | null; got?: boolean; got_by?: string | null; got_at?: string | null };
export function needMeta(n: Need) {
  let who = (n.bring_by ?? "").trim();
  let notes = (n.notes ?? "").trim();
  const m = notes.match(/^([A-Z][a-z]+)\s+(brings|picks up)\b\s*[-–—:]?\s*/i);
  if (m) { if (!who) who = m[1]; notes = notes.slice(m[0].length).trim(); }
  return { who: who || "", notes, source: (n.source ?? "").trim() };
}

// ---------- UI atoms ----------
export function Ring({ value, size = 44, stroke = 4, label }: { value: number; size?: number; stroke?: number; label?: React.ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.1)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={v >= 1 ? "#34d399" : "#fff"} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} strokeLinecap="round" className="transition-[stroke-dashoffset] duration-500" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-white tabular-nums">{label ?? `${Math.round(v * 100)}%`}</div>
    </div>
  );
}

export function Bar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-white/[0.08]", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", v >= 1 ? "bg-emerald-400" : "bg-white")} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Box({ done, onClick, label, disabled }: { done: boolean; onClick?: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={done} aria-label={label}
      className={cn("shrink-0 -m-1 p-1 rounded-xl", disabled && "cursor-default")}>
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-[10px] border-2 transition-colors",
        done ? "border-emerald-400 bg-emerald-400 text-neutral-900" : "border-neutral-500 text-transparent hover:border-neutral-300")}>
        <Check size={18} strokeWidth={3.2} />
      </span>
    </button>
  );
}

export function Pill({ children, tone = "plain", icon }: { children: React.ReactNode; tone?: "plain" | "warn" | "ok" | "info"; icon?: React.ReactNode }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold leading-5",
      tone === "warn" && "bg-amber-400/15 text-amber-200",
      tone === "ok" && "bg-emerald-400/15 text-emerald-200",
      tone === "info" && "bg-sky-400/15 text-sky-200",
      tone === "plain" && "bg-white/[0.07] text-neutral-300")}>
      {icon}<span className="truncate">{children}</span>
    </span>
  );
}

// ---------- Plan of action ----------
export function PlanView({ list, onToggle, onRemove, readOnly }: { list: Step[]; onToggle?: (id: string, done: boolean) => void; onRemove?: (id: string) => void; readOnly?: boolean }) {
  const phases = groupPlan(list);
  const firstOpen = phases.find((p) => p.done < p.steps.length)?.key;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (k: string, complete: boolean) => (k in open ? open[k] : !complete);
  let n = 0;

  return (
    <div className="space-y-3">
      {phases.map((p) => {
        const complete = p.done === p.steps.length;
        const current = p.key === firstOpen;
        const o = isOpen(p.key, complete);
        return (
          <section key={p.key || "_"} className={cn("overflow-hidden rounded-2xl border bg-neutral-950",
            current ? "border-white/30" : "border-white/[0.08]")}>
            <button type="button" onClick={() => setOpen((s) => ({ ...s, [p.key]: !o }))}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left min-h-[60px]">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                complete ? "bg-emerald-400 text-neutral-900" : current ? "bg-white text-neutral-900" : "bg-white/[0.08] text-neutral-300")}>
                {complete ? <Check size={15} strokeWidth={3.2} /> : phases.indexOf(p) + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[16px] font-semibold text-white">{p.title}</span>
                  {current && !complete ? <Pill tone="info">Now</Pill> : null}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Bar value={p.done / p.steps.length} className="flex-1" />
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums text-neutral-400">{p.done}/{p.steps.length}</span>
                </div>
              </div>
              <ChevronDown size={18} className={cn("shrink-0 text-neutral-500 transition-transform", o && "rotate-180")} />
            </button>
            {o ? (
              <ol className="border-t border-white/[0.06]">
                {p.steps.map((s) => {
                  n++;
                  const warn = !s.done && isHeadsUp(s.text);
                  return (
                    <li key={s.id} className={cn("flex items-start gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0", warn && "bg-amber-400/[0.05]")}>
                      <Box done={s.done} label={s.done ? "Mark not done" : "Mark done"} disabled={readOnly}
                        onClick={readOnly ? undefined : () => onToggle?.(s.id, !s.done)} />
                      <div className="min-w-0 flex-1 pt-1">
                        <div className={cn("text-[15px] leading-snug", s.done ? "text-neutral-500 line-through decoration-neutral-600" : "text-white")}>{s.text}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {warn ? <Pill tone="warn" icon={<AlertTriangle size={12} />}>Heads up</Pill> : null}
                          {s.done && s.done_by ? <span className="text-[12px] text-emerald-300/90">✓ {s.done_by}{s.done_at ? ` · ${stamp(s.done_at)}` : ""}</span> : null}
                          {!s.done && s.added_by && s.added_by !== "Mike" ? <span className="text-[12px] text-neutral-500">added by {s.added_by}</span> : null}
                        </div>
                      </div>
                      <span className="shrink-0 pt-1.5 text-[12px] tabular-nums text-neutral-600">{n}</span>
                      {onRemove ? (
                        <button type="button" onClick={() => onRemove(s.id)} aria-label="Remove step"
                          className="shrink-0 -mr-1 mt-0.5 rounded-lg p-1.5 text-neutral-600 hover:bg-white/[0.06] hover:text-red-400"><X size={15} /></button>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

// ---------- Materials / tools load-out ----------
export function LoadOut({ rows, me, kind, onToggle, readOnly }:
  { rows: Need[]; me?: string | null; kind: "material" | "tool"; onToggle?: (id: string, got: boolean) => void; readOnly?: boolean }) {
  const [filter, setFilter] = useState<"all" | "mine" | "left">("all");
  const canCheck = rows.some((r) => typeof r.got === "boolean");
  const meta = rows.map((r) => ({ r, ...needMeta(r) }));
  const mineName = (me ?? "").toLowerCase();
  const shown = meta.filter((x) =>
    filter === "mine" ? x.who.toLowerCase() === mineName : filter === "left" ? !x.r.got : true);

  // group by who brings: me first, then names, then unassigned
  const groups = new Map<string, typeof meta>();
  for (const x of shown) { const k = x.who || ""; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(x); }
  const keys = [...groups.keys()].sort((a, b) => {
    if (!a) return 1; if (!b) return -1;
    if (a.toLowerCase() === mineName) return -1; if (b.toLowerCase() === mineName) return 1;
    return a.localeCompare(b);
  });

  const total = rows.length, got = rows.filter((r) => r.got).length;
  const mineCount = meta.filter((x) => mineName && x.who.toLowerCase() === mineName).length;
  const verb = kind === "material" ? "loaded" : "packed";

  return (
    <div>
      {canCheck ? (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-neutral-950 px-4 py-3">
          <Ring value={total ? got / total : 0} label={`${got}`} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-white">{got} of {total} {verb}</div>
            <div className="text-[13px] text-neutral-400">{total - got ? `${total - got} still to get` : "Everything's on the truck"}</div>
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
        {([["all", `All ${total}`], ...(mineName && mineCount ? [["mine", `Mine ${mineCount}`]] : []), ...(canCheck ? [["left", `Still to get ${total - got}`]] : [])] as [typeof filter, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={cn("shrink-0 rounded-full border px-3.5 min-h-[36px] text-[13px] font-semibold",
              filter === v ? "border-white bg-white text-neutral-900" : "border-white/[0.12] text-neutral-300")}>{l}</button>
        ))}
      </div>

      {!shown.length ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-neutral-400">
          {filter === "left" ? "All set — nothing left to get." : "Nothing here."}
        </div>
      ) : (
        <div className="space-y-4">
          {keys.map((k) => {
            const list = groups.get(k)!;
            const gGot = list.filter((x) => x.r.got).length;
            return (
              <section key={k || "_"}>
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-bold text-neutral-200">
                    {k ? k[0].toUpperCase() : <User2 size={13} />}
                  </span>
                  <span className="text-[14px] font-semibold text-neutral-200">
                    {k ? (k.toLowerCase() === mineName ? "You bring" : `${k} brings`) : "No one assigned yet"}
                  </span>
                  {canCheck ? <span className="ml-auto text-[12px] tabular-nums text-neutral-500">{gGot}/{list.length}</span> : null}
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-neutral-950 divide-y divide-white/[0.05]">
                  {list.map(({ r, notes, source }) => (
                    <div key={r.id} className="flex items-start gap-3 px-4 py-3 min-h-[60px]">
                      {canCheck ? (
                        <Box done={!!r.got} label={r.got ? "Mark not " + verb : "Mark " + verb} disabled={readOnly}
                          onClick={readOnly ? undefined : () => onToggle?.(r.id, !r.got)} />
                      ) : null}
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-start gap-2">
                          <span className={cn("min-w-0 flex-1 text-[15px] font-semibold leading-snug", r.got ? "text-neutral-500 line-through decoration-neutral-600" : "text-white")}>{r.item}</span>
                          {r.qty && r.qty.length <= 9 ? <span className="shrink-0 rounded-lg bg-white/[0.08] px-2 py-0.5 text-[13px] font-bold tabular-nums text-white">{r.qty}</span> : null}
                        </div>
                        {r.qty && r.qty.length > 9 ? <div className="mt-1"><span className="inline-block rounded-lg bg-white/[0.08] px-2 py-0.5 text-[13px] font-bold tabular-nums text-white">{r.qty}</span></div> : null}
                        {notes ? <div className="mt-0.5 text-[13px] leading-snug text-neutral-400">{notes}</div> : null}
                        {(source || (r.got && r.got_by)) ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {source ? <Pill icon={<Store size={12} />}>{source}</Pill> : null}
                            {r.got && r.got_by ? <span className="text-[12px] text-emerald-300/90">✓ {r.got_by}{r.got_at ? ` · ${stamp(r.got_at)}` : ""}</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
