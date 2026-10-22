// v6.9 project-management schedule: what kind of thing a schedule entry is, who's coming,
// when they arrive, and whether it's confirmed. Shared by the Calendar, the job record,
// Home and the add/edit dialog. Columns live on public.schedule_entries:
// item_type, vendor_id, company, start_time, end_time, qty, status.
import type { LucideIcon } from "lucide-react";
import { HardHat, Truck, Package, Wrench, Tractor, ClipboardCheck, Handshake, Flag, Pin } from "lucide-react";

export type SchedItem = {
  id: string;
  entry_date: string;
  job_id: string | null;
  label: string | null;
  notes?: string | null;
  assignee: string | null;
  assignees?: string[] | null;
  item_type?: string | null;
  vendor_id?: string | null;
  company?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  qty?: string | null;
  status?: string | null;
  sort?: number | null;
};

export type ItemType = { key: string; label: string; icon: LucideIcon; tint: string; trade: string; hint?: string };

// tint = icon colour; status colours stay reserved for status (emerald/amber/red/sky)
export const ITEM_TYPES: ItemType[] = [
  { key: "crew", label: "Crew day", icon: HardHat, tint: "text-neutral-300", trade: "Labor" },
  { key: "pour", label: "Concrete pour", icon: Truck, tint: "text-white", trade: "Ready-mix concrete", hint: "8 yd · 4000 psi · pump truck" },
  { key: "delivery", label: "Delivery", icon: Package, tint: "text-white", trade: "Materials", hint: "20 ton ¾\" stone · 60 bags" },
  { key: "sub", label: "Sub on site", icon: Wrench, tint: "text-white", trade: "Subcontractor", hint: "2 finishers" },
  { key: "equipment", label: "Equipment", icon: Tractor, tint: "text-white", trade: "Equipment rental", hint: "Mini ex + breaker, 2 days" },
  { key: "inspection", label: "Inspection", icon: ClipboardCheck, tint: "text-white", trade: "Inspector", hint: "Footing inspection" },
  { key: "meeting", label: "Meeting / walk", icon: Handshake, tint: "text-neutral-300", trade: "" },
  { key: "milestone", label: "Milestone", icon: Flag, tint: "text-neutral-300", trade: "" },
  { key: "other", label: "Other", icon: Pin, tint: "text-neutral-400", trade: "" },
];
export const ITEM_TYPE: Record<string, ItemType> = Object.fromEntries(ITEM_TYPES.map((t) => [t.key, t]));
export const typeOf = (e: { item_type?: string | null }) => ITEM_TYPE[e.item_type ?? "crew"] ?? ITEM_TYPE.other;

// types where an outside company coming to site is the point of the entry
export const OUTSIDE = new Set(["pour", "delivery", "sub", "equipment", "inspection"]);
export const isOutside = (e: { item_type?: string | null }) => OUTSIDE.has(e.item_type ?? "");

export const SCHED_STATUS: Record<string, { label: string; badge: "muted" | "success" | "warning" | "danger" | "default" }> = {
  scheduled: { label: "Scheduled", badge: "muted" },
  confirmed: { label: "Confirmed", badge: "success" },
  done: { label: "Done", badge: "default" },
  cancelled: { label: "Cancelled", badge: "danger" },
};
export const NEXT_STATUS: Record<string, string> = { scheduled: "confirmed", confirmed: "done", done: "scheduled", cancelled: "scheduled" };
// outside company not yet confirmed — needs a call
export const needsConfirm = (e: SchedItem) => isOutside(e) && (e.status ?? "scheduled") === "scheduled";

export const fmtTime = (t: string | null | undefined) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "a" : "p"}`;
};
export const timeWindow = (e: SchedItem) =>
  e.start_time ? (e.end_time ? `${fmtTime(e.start_time)}–${fmtTime(e.end_time)}` : fmtTime(e.start_time)) : "";
// timed items first in the day, then the manual sort
export const byTime = (a: SchedItem, b: SchedItem) => {
  const ta = a.start_time ?? "99", tb = b.start_time ?? "99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return (a.sort ?? 0) - (b.sort ?? 0);
};
export const whoOn = (e: SchedItem): string[] =>
  e.assignees && e.assignees.length ? e.assignees : e.assignee ? [e.assignee] : [];
// "Truck · Sullivan Concrete · 8 yd" style detail line
export const detailLine = (e: SchedItem) => [e.company, e.qty].filter(Boolean).join(" · ");
