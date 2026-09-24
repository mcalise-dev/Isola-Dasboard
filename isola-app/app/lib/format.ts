export const money = (n: number | null | undefined) =>
  n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export type Job = {
  id: string;
  job_name: string | null;
  customer: string;
  location: string | null;
  job: string | null;
  status: "lead" | "booked" | "progress" | "complete" | "awaiting" | "lost";
  price: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  quoted_date: string | null;
  start_date: string | null;
  completed_date: string | null;
  notes: string | null;
  priority: boolean;
  scope_of_work: string | null;
};

export const jobLabel = (j: Partial<Pick<Job, "job_name" | "customer" | "location" | "job">>) =>
  (j.job_name && j.job_name.trim())
    ? `${j.job_name}${j.customer ? " — " + j.customer : ""}`
    : [j.customer, j.location].filter(Boolean).join(" — ") + (j.job ? ` (${j.job})` : "");

// Pipeline v4 (9/22/26). DB keys stay the same so nothing else breaks; the labels are what Mike reads.
//   Selling: lead = TO QUOTE (not sent yet) · awaiting = SENT (with the customer)
//   Doing:   booked · progress · complete        Archive: lost (declined / dead)
export const STATUS_META: Record<string, { label: string; cls: string }> = {
  lead: { label: "To Quote", cls: "bg-white/[0.06] text-neutral-300 border-white/10" },
  awaiting: { label: "Sent", cls: "bg-white/[0.06] text-neutral-200 border-white/15" },
  booked: { label: "Booked", cls: "bg-white/10 text-white border-white/20" },
  progress: { label: "In Progress", cls: "bg-white text-neutral-900 border-white" },
  complete: { label: "Complete", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  lost: { label: "Lost", cls: "bg-red-500/10 text-red-300/80 border-red-500/30" },
};
export const PIPELINE = ["lead", "awaiting", "booked", "progress", "complete"] as const;
export const LOST_REASONS = ["Price", "Went with someone else", "No response", "Scope changed / cancelled", "Not our kind of work", "Other"];

// A job still "live" for pickers: anything not lost, and complete jobs only until they're paid.
export const isLiveJob = (j: any) =>
  !!j && j.status !== "lost" && !(j.status === "complete" && !!j.paid_date);

// Sub-stage tag shown on a card, so each column reads at a glance.
export function stageTag(j: any, ctx: { walked?: boolean; drafting?: boolean; scheduled?: boolean } = {}): { text: string; cls: string } | null {
  const warn = "text-amber-300", ok = "text-emerald-300", mute = "text-neutral-400", bad = "text-red-400";
  if (j.status === "lead") {
    if (ctx.drafting) return { text: "Drafting", cls: ok };
    if (ctx.walked) return { text: "Walked", cls: ok };
    return { text: "Not walked", cls: mute };
  }
  if (j.status === "awaiting") {
    const d = daysSince(j.quoted_date);
    return { text: j.quoted_date ? `${d}d out` : "Sent", cls: d > 30 ? bad : d > 14 ? warn : mute };
  }
  if (j.status === "booked") {
    if (j.start_date) return { text: "Starts " + fmtDate(j.start_date).replace(/^\w+, /, ""), cls: mute };
    if (ctx.scheduled) return { text: "On calendar", cls: mute };
    return { text: "Unscheduled", cls: warn };
  }
  if (j.status === "complete") {
    if (j.paid_date) return { text: "Paid", cls: ok };
    if (j.invoiced_date) return { text: "Invoiced", cls: mute };
    return { text: "To invoice", cls: bad };
  }
  if (j.status === "lost") return { text: j.lost_reason || "Lost", cls: mute };
  return null;
}

export const daysSince = (iso: string | null | undefined) => {
  if (!iso) return 0;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.floor((Date.now() - new Date(y, m - 1, d, 12).getTime()) / 86400000);
};

// jobs.price is free text: "$9,800", "6,028", "$900.00 (paid in full)", and sometimes
// two options in one string. Stripping every non-digit GLUES the numbers together
// ("Option A: $7,700 ... Option B: ~$6,000" became 77,002,856,000). Take the first
// dollar amount, else the first number, and keep commas out of the arithmetic.
export const parsePrice = (p: string | number | null | undefined): number => {
  if (p == null || p === "") return 0;
  if (typeof p === "number") return isFinite(p) ? p : 0;
  const s = String(p);
  const m = s.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/) ?? s.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ""));
  return isFinite(n) ? n : 0;
};

// v4.5: every price shows the same way — "$14,000" / "$1,577.70"; words like "T&M" stay words.
export const fmtPrice = (p: string | number | null | undefined): string => {
  if (p == null || p === "") return "";
  const n = parsePrice(p);
  if (!n) return String(p).trim();
  const cents = Math.round(n * 100) % 100 !== 0;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
};
