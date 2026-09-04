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
  status: "lead" | "booked" | "progress" | "complete" | "awaiting";
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

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  lead: { label: "Lead", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  booked: { label: "Booked", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  progress: { label: "In Progress", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  awaiting: { label: "Awaiting", cls: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
  complete: { label: "Complete", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
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
