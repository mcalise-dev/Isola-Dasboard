// v52 — Owner pay: what the COMPANY keeps vs what MIKE makes per day.
//
// Per completed job:
//   share      = contract − direct costs            (solo job)
//              = (contract − direct costs) ÷ 2      (THM job — 50% of NET, Isola keeps half)
//   overhead   = Mike's days × overhead per day     (fixed monthly costs ÷ billable days)
//   per day    = (share − overhead) ÷ Mike's days   ← "what you're making per day"
//   company    = share − overhead − days × target   ← what's left after paying Mike his target
//
// Fuel lives in overhead, so job-logged Fuel is NOT counted again as a direct cost.
// A job only counts toward the headline once it has costs logged AND Mike's days entered —
// a job with no costs would look like pure profit and inflate the number.
import { parseJSON } from "@/lib/settings";
import { parsePrice } from "@/lib/format";

export type OverheadLine = { label: string; monthly: number };
export type PayModel = { owner_day_target: number; work_days_per_month: number; overhead: OverheadLine[] };

export const PAY_KEY = "pay_model";

export const DEFAULT_PAY: PayModel = {
  owner_day_target: 500,
  work_days_per_month: 16,
  overhead: [
    { label: "Truck payment", monthly: 700 },
    { label: "Fuel", monthly: 550 },
    { label: "Dump trailer payment", monthly: 200 },
    { label: "QuickBooks / software / misc", monthly: 200 },
    { label: "Business insurance", monthly: 197 },
  ],
};

export function parsePayModel(raw: string | null | undefined): PayModel {
  const p = parseJSON<PayModel>(raw, DEFAULT_PAY);
  return {
    owner_day_target: Number(p.owner_day_target) || DEFAULT_PAY.owner_day_target,
    work_days_per_month: Number(p.work_days_per_month) || DEFAULT_PAY.work_days_per_month,
    overhead: Array.isArray(p.overhead) ? p.overhead.map((o) => ({ label: String(o.label ?? ""), monthly: Number(o.monthly) || 0 })) : DEFAULT_PAY.overhead,
  };
}

export const overheadMonthly = (m: PayModel) => m.overhead.reduce((a, o) => a + (Number(o.monthly) || 0), 0);
export const overheadPerDay = (m: PayModel) => overheadMonthly(m) / Math.max(1, Number(m.work_days_per_month) || 1);

export type PayRow = {
  id: string; name: string; customer: string; completed_date: string | null;
  price: number; direct: number; partner: string | null; share: number;
  days: number | null; est: boolean; hasCosts: boolean;
  overhead: number; available: number; perDay: number | null; myPay: number; company: number;
  counted: boolean; reason: string | null;
};

/** jobs: id, job_name, customer, completed_date, partner, mike_days, mike_days_est, and contract_total or price/price_amount. */
export function payRows(model: PayModel, jobs: any[], costs: any[]): PayRow[] {
  const ohd = overheadPerDay(model);
  const tgt = Number(model.owner_day_target) || 0;
  const byJob = new Map<string, { direct: number; n: number }>();
  for (const c of costs) {
    const e = byJob.get(c.job_id) ?? { direct: 0, n: 0 };
    e.n++;
    if (String(c.category ?? "").toLowerCase() !== "fuel") e.direct += Number(c.amount) || 0;
    byJob.set(c.job_id, e);
  }
  return jobs.map((j: any) => {
    const price = Number(j.contract_total) || Number(j.price_amount) || parsePrice(j.price);
    const cj = byJob.get(j.id);
    const direct = cj?.direct ?? 0;
    const hasCosts = !!cj && cj.n > 0;
    const share = j.partner ? (price - direct) / 2 : price - direct;
    const days = j.mike_days == null || !(Number(j.mike_days) > 0) ? null : Number(j.mike_days);
    const overhead = days ? days * ohd : 0;
    const available = share - overhead;
    const perDay = days ? available / days : null;
    const myPay = days ? days * tgt : 0;
    const company = available - myPay;
    const reason = !hasCosts ? "No costs logged" : !days ? "Add your days" : null;
    return {
      id: j.id, name: j.job_name || j.customer || "Job", customer: j.customer ?? "", completed_date: j.completed_date ?? null,
      price, direct, partner: j.partner ?? null, share, days, est: !!j.mike_days_est, hasCosts,
      overhead, available, perDay, myPay, company, counted: !reason, reason,
    };
  });
}

export function payTotals(rows: PayRow[]) {
  const c = rows.filter((r) => r.counted);
  const s = (f: (r: PayRow) => number) => c.reduce((a, r) => a + f(r), 0);
  const days = s((r) => r.days ?? 0);
  const revenue = s((r) => (r.partner ? r.price / 2 : r.price)); // Isola's side of the contract
  const available = s((r) => r.available);
  const myPay = s((r) => r.myPay);
  const company = s((r) => r.company);
  const overhead = s((r) => r.overhead);
  return {
    jobs: c.length, days, revenue, overhead, available, myPay, company,
    perDay: days ? available / days : null,
    companyPct: revenue ? company / revenue : null,
    waiting: rows.length - c.length,
  };
}

/** Minimum price that pays Mike his target and covers overhead, then marked up to a company margin. */
export function priceCheck(model: PayModel, direct: number, days: number, marginPct: number) {
  const floor = direct + days * (overheadPerDay(model) + (Number(model.owner_day_target) || 0));
  const m = Math.min(90, Math.max(0, marginPct)) / 100;
  return { floor, price: floor / (1 - m) };
}

/** Everything the pay screen and Home card need, in one load. */
export async function loadPay(sb: any) {
  const [s, f, j] = await Promise.all([
    sb.from("app_settings").select("value").eq("key", PAY_KEY).maybeSingle(),
    sb.from("job_financials").select("job_id,job_name,customer,completed_date,contract_total,partner,status").eq("status", "complete"),
    sb.from("jobs").select("id,mike_days,mike_days_est").eq("status", "complete"),
  ]);
  const bad = s.error?.message || f.error?.message || j.error?.message;
  if (bad) throw new Error(bad);
  const days = new Map<string, any>((j.data ?? []).map((x: any) => [x.id, x]));
  const jobs = (f.data ?? []).map((x: any) => ({ ...x, id: x.job_id, mike_days: days.get(x.job_id)?.mike_days ?? null, mike_days_est: days.get(x.job_id)?.mike_days_est ?? false }));
  const ids = jobs.map((x: any) => x.id);
  let costs: any[] = [];
  if (ids.length) {
    const c = await sb.from("job_costs").select("job_id,category,amount").in("job_id", ids);
    if (c.error) throw new Error(c.error.message);
    costs = c.data ?? [];
  }
  return { model: parsePayModel(s.data?.value), jobs, costs };
}
