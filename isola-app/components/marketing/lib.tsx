"use client";
// v4.6 Marketing — shared types and helpers for Targets / Outreach / Pipeline / Reviews.
import * as React from "react";
import type { Contact } from "@/lib/crm";
import { firstName, coShort } from "@/lib/crm";
import { todayISO, parsePrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MContact = Contact & {
  decision_maker?: boolean | null;
  campaign_id: string | null;
  seq_step: number | null;
  seq_started: string | null;
  referral_partner: boolean | null;
  account_stage: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type Step = { day: number; channel: string; label: string; template?: string; subject?: string };
export type Campaign = {
  id: string; name: string; emoji: string | null; objective: string | null; target: string | null;
  decision_makers: string | null; services: string | null; timeline: string | null; status: string | null;
  steps: Step[] | null; created_at?: string;
};
export type Activity = { id: string; contact_id: string | null; type: string; note: string | null; occurred_at: string; created_at: string };

export const CHANNELS = ["Email", "LinkedIn", "Call", "Drop-by", "Meeting"] as const;
export const TOUCHES = ["Call", "Email", "LinkedIn", "Drop-by", "Meeting"] as const;
export const CLOSED = ["Won", "Dead", "Client"];

export const DEFAULT_STEPS: Step[] = [
  { day: 0, channel: "Email", label: "Intro email", subject: "Exterior work at {company}", template: "{first_name},\n\nI run Isola out of Providence. We do concrete, masonry, asphalt and drainage repairs for properties around RI, and I'm on every job myself.\n\nDo you use outside contractors for that kind of work at {company}?\n\nMike Calise\nIsola LLC · 508-933-2661" },
  { day: 2, channel: "LinkedIn", label: "Connect on LinkedIn", template: "{first_name} — I run Isola in Providence. We handle exterior concrete, masonry and drainage repairs at commercial properties around RI. Figured we should be connected." },
  { day: 5, channel: "Call", label: "Intro call", template: "Call {first_name} at {company}: mention the email, offer a free walk-through of any problem area." },
  { day: 9, channel: "Email", label: "Follow-up email", subject: "Re: exterior work at {company}", template: "{first_name},\n\nFollowing up on my note. If there's a spot at {company} that keeps needing attention, I'm happy to walk it with you at no charge and give you a straight answer on what's causing it.\n\nMike" },
  { day: 14, channel: "Drop-by", label: "Drop by or call", template: "Stop by {company} with a one-pager, or call {first_name} one more time." },
];

export const stepsOf = (c: Campaign | null | undefined): Step[] =>
  c && Array.isArray(c.steps) && c.steps.length ? c.steps : DEFAULT_STEPS;

export const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
export const daysBetween = (a: string, b: string) => {
  const p = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d, 12).getTime(); };
  return Math.round((p(b) - p(a)) / 86400000);
};

/** "today", "yesterday", "3d ago", "in 4d" */
export function rel(iso: string | null | undefined) {
  if (!iso) return "—";
  const n = daysBetween(todayISO(), iso);
  if (n === 0) return "today";
  if (n === -1) return "yesterday";
  if (n === 1) return "tomorrow";
  if (n < 0) return -n < 60 ? `${-n}d ago` : `${Math.round(-n / 30)}mo ago`;
  return n < 60 ? `in ${n}d` : `in ${Math.round(n / 30)}mo`;
}
export const shortDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const dueTone = (iso: string | null | undefined): "bad" | "warn" | null => {
  if (!iso) return null;
  const t = todayISO();
  return iso < t ? "bad" : iso === t ? "warn" : null;
};
export const isOpen = (c: { stage: string }) => !CLOSED.includes(c.stage);
export const isFollowDue = (c: MContact) => !!c.next_date && c.next_date <= todayISO() && isOpen(c);

/** The contact's next sequence step (or null when finished / not enrolled). */
export function nextStep(c: MContact, steps: Step[]): { step: Step; idx: number; due: string | null } | null {
  if (!c.campaign_id) return null;
  const idx = c.seq_step ?? 0;
  if (idx >= steps.length) return null;
  const step = steps[idx];
  return { step, idx, due: c.seq_started ? addDays(c.seq_started, step.day) : null };
}

export const channelMatch = (touch: string, channel: string) => {
  const a = touch.toLowerCase(), b = channel.toLowerCase();
  if (a === b) return true;
  if (b.includes("/")) return b.split("/").some((x) => x.trim() === a);
  if (b.startsWith("drop") && a.startsWith("drop")) return true;
  return b.includes(a);
};

export function fillTemplate(tpl: string | undefined, c: Pick<Contact, "name" | "company">) {
  return (tpl ?? "").replace(/\{first_name\}/g, firstName(c.name)).replace(/\{company\}/g, coShort(c.company) || "your properties").replace(/\{name\}/g, c.name);
}

export const validEmail = (e: string | null | undefined) => !!e && e.includes("@") && !e.includes("*") && !/linkedin\.com/i.test(e);
export const linkedinOf = (c: Pick<Contact, "linkedin" | "email">) =>
  c.linkedin || (c.email && /linkedin\.com/i.test(c.email) ? c.email : null);
export const telOf = (p: string | null | undefined) => (p && /\d{3}/.test(p) ? `tel:${p.replace(/[^0-9+]/g, "").slice(0, 12)}` : null);

export const jobPrice = (j: any) => Number(j?.price_amount) || parsePrice(j?.price);
export const changed = () => { try { window.dispatchEvent(new Event("isola:changed")); } catch {} };
export const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}

/**
 * Log a touch: last_touch = today, an activities row, and (when the touch matches the
 * contact's next sequence step channel) advance seq_step. Returns the contact patch.
 */
export async function logTouch(sb: any, c: MContact, type: string, note: string | null, steps: Step[] | null, forceAdvance = false) {
  const today = todayISO();
  const patch: Partial<MContact> = { last_touch: today };
  const ns = steps ? nextStep(c, steps) : null;
  if (ns && (forceAdvance || channelMatch(type, ns.step.channel))) patch.seq_step = ns.idx + 1;
  if (c.stage === "Not started") {
    const st = type === "Call" ? "Called" : type === "Meeting" ? "Meeting" : type === "Email" ? "Emailed" : null;
    if (st) patch.stage = st;
  }
  const [u, a] = await Promise.all([
    sb.from("contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", c.id),
    sb.from("activities").insert({ contact_id: c.id, type, note: note || (ns && patch.seq_step ? `Step ${ns.idx + 1}: ${ns.step.label}` : null), occurred_at: today }),
  ]);
  if (u.error || a.error) throw new Error((u.error ?? a.error).message);
  changed();
  return patch;
}

export function TierBadge({ tier, className }: { tier: string | null | undefined; className?: string }) {
  const t = tier ?? "—";
  return (
    <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-xs font-bold tabular-nums",
      t === "A" ? "border-white bg-white text-neutral-900" : t === "Client" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/15 text-neutral-300", className)}>
      {t === "Client" ? "Client" : t === "Broker" ? "Br" : t}
    </span>
  );
}

/** Small segmented progress bar for a sequence: done = white, next = ring, upcoming = dim. */
export function SeqBar({ total, done, className }: { total: number; done: number; className?: string }) {
  return (
    <div className={cn("flex gap-0.5", className)} aria-label={`${done} of ${total} steps`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < done ? "bg-white" : i === done ? "bg-white/35" : "bg-white/10")} />
      ))}
    </div>
  );
}

/** Horizontal step line (done / next / upcoming). */
export function SeqLine({ steps, current, className }: { steps: Step[]; current?: number; className?: string }) {
  return (
    <ol className={cn("flex overflow-x-auto no-scrollbar rounded-xl border border-border bg-card px-2 py-3", className)}>
      {steps.map((s, i) => {
        const isDone = current != null && i < current;
        const isNow = current != null && i === current;
        return (
          <li key={i} className="relative min-w-[92px] flex-1 text-center">
            {i > 0 ? <span className={cn("absolute left-[-50%] right-[50%] top-[11px] h-px", isDone || isNow ? "bg-white/60" : "bg-white/10")} /> : null}
            <div className="relative z-[1] flex flex-col items-center gap-1">
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums",
                isDone ? "border-white bg-white text-neutral-900" : isNow ? "border-white bg-neutral-950 text-white ring-4 ring-white/10" : "border-white/20 bg-neutral-950 text-neutral-400")}>{i + 1}</span>
              <span className="text-xs font-semibold text-neutral-200 leading-tight px-1">{s.label}</span>
              <span className="text-[11px] text-neutral-500">Day {s.day} · {s.channel}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function useIsPhone() {
  const [p, setP] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const f = () => setP(mq.matches);
    f(); mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return p;
}

/** Simple pill row of saved views (wraps on phone, no page scroll). */
export function Chips<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div className={cn("flex gap-1.5 overflow-x-auto no-scrollbar", className)}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold",
            value === o.value ? "border-white bg-white text-neutral-900" : "border-border text-neutral-300 hover:border-white/25")}>
          {o.label}{o.count != null ? <span className={cn("tabular-nums", value === o.value ? "text-neutral-500" : "text-neutral-500")}>{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
