// v52 — Owner pay: what the COMPANY keeps vs what MIKE makes per day.
// v89 (11/19/26), Mike's rules for every job number in the app:
//   • Isola takes a flat $200 per working day (Mike's days on the job) as a job expense.
//     Replaces the old monthly-bills ÷ billable-days figure and the 18% he'd used before.
//   • Mike's own labor is not an expense; crew pay is.
//   • THM SPLIT jobs: the $500 management fee is also a job expense (a logged "Management Fee"
//     cost replaces the default), and the net after all of that splits 50/50 with THM.
//     THM's half is not Mike's profit. The fee comes back to Mike.
//   • THM REIMBURSE jobs: THM's time + equipment are already cost lines; no split, no fee.
//   • THM-held contracts (contract_holder = thm): Mike's cut (isola_cut) is the revenue, costs are inside it.
//
// Per job:
//   net        = contract − direct costs − Isola ($200 × days) − management fee (split jobs)
//   THM        = partner_share if settled, else net ÷ 2          (split jobs only)
//   Isola made = $200 × days
//   Mike made  = net − THM + management fee
//   Together   = Isola made + Mike made                          (the same pocket)
//   Margin     = Together ÷ contract
//
// Fuel is covered by Isola's $200/day, so job-logged Fuel is NOT counted again as a direct cost.
// A hand-logged "Overhead" cost line is Isola's take for that job and replaces days × $200.
// A job only counts toward totals once it has costs logged AND Mike's days entered —
// a job with no costs would look like pure profit and inflate the number.
// The monthly bills list stays, but only Cash flow uses it now (real money going out each month).
import { parseJSON } from "@/lib/settings";
import { parsePrice } from "@/lib/format";

export type OverheadLine = { label: string; monthly: number };
export type PayModel = { owner_day_target: number; work_days_per_month: number; overhead: OverheadLine[]; isola_per_day: number };

/** What Isola takes for the business on every job, per working day. */
export const ISOLA_PER_DAY = 200;

export const PAY_KEY = "pay_model";

export const DEFAULT_PAY: PayModel = {
  owner_day_target: 500,
  work_days_per_month: 16,
  isola_per_day: ISOLA_PER_DAY,
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
    // older saved models have no isola_per_day: they get the $200 rule
    isola_per_day: Number(p.isola_per_day) > 0 ? Number(p.isola_per_day) : ISOLA_PER_DAY,
  };
}

export const overheadMonthly = (m: PayModel) => m.overhead.reduce((a, o) => a + (Number(o.monthly) || 0), 0);
/** Isola's take per working day ($200 unless changed on Money → My pay). */
export const overheadPerDay = (m: PayModel) => Number(m.isola_per_day) > 0 ? Number(m.isola_per_day) : ISOLA_PER_DAY;

/** THM split jobs: Mike's management fee, a job expense that comes back to him. */
export const MGMT_FEE = 500;

export type PayRow = {
  id: string; name: string; customer: string; completed_date: string | null; workType: string | null;
  price: number; direct: number; partner: string | null; split: boolean; isolaPct: number; share: number;
  days: number | null; est: boolean; hasCosts: boolean;
  overhead: number; available: number; perDay: number | null; myPay: number; company: number;
  /** close-out: Isola's $200/day, Mike's management fee (split jobs), THM's half, what Mike made, together */
  isola: number; fee: number; thm: number; mike: number; together: number; margin: number | null;
  counted: boolean; reason: string | null;
};

const isFuel = (c: any) => String(c.category ?? "").toLowerCase() === "fuel";
const isFee = (c: any) => String(c.category ?? "").toLowerCase() === "management fee";
// Isola's per-day take already logged by hand as an "Overhead" cost line: use it instead of days × rate, never twice.
const isOverhead = (c: any) => String(c.category ?? "").toLowerCase() === "overhead";

/** jobs: id, job_name, customer, completed_date, partner, thm_deal, partner_share, mike_days, mike_days_est,
 *  contract_holder, isola_cut, and contract_total or price/price_amount.
 *  ownerNames: workers marked as the owner — their labor rows are never a job expense. */
export function payRows(model: PayModel, jobs: any[], costs: any[], ownerNames: string[] = []): PayRow[] {
  const ohd = overheadPerDay(model);
  const tgt = Number(model.owner_day_target) || 0;
  const owners = new Set(ownerNames.map((n) => n.trim().toLowerCase()));
  const byJob = new Map<string, { direct: number; fee: number; feeRows: number; oh: number; ohRows: number; n: number }>();
  for (const c of costs) {
    const e = byJob.get(c.job_id) ?? { direct: 0, fee: 0, feeRows: 0, oh: 0, ohRows: 0, n: 0 };
    e.n++;
    const amt = Number(c.amount) || 0;
    if (isFee(c)) { e.fee += amt; e.feeRows++; }
    else if (isOverhead(c)) { e.oh += amt; e.ohRows++; }
    else if (!isFuel(c) && !(c.worker && owners.has(String(c.worker).trim().toLowerCase()))) e.direct += amt;
    byJob.set(c.job_id, e);
  }
  return jobs.map((j: any) => {
    const thmHeld = j.contract_holder === "thm";
    const price = thmHeld ? Number(j.isola_cut) || 0 : Number(j.contract_total) || Number(j.price_amount) || parsePrice(j.price);
    const cj = byJob.get(j.id);
    const direct = thmHeld ? 0 : cj?.direct ?? 0;
    const hasCosts = thmHeld ? price > 0 : !!cj && cj.n > 0;
    const split = !thmHeld && !!j.partner && j.thm_deal === "split";
    const isolaPct = split ? 0.5 : 1;
    const days = j.mike_days == null || !(Number(j.mike_days) > 0) ? null : Number(j.mike_days);
    const isola = cj?.ohRows ? cj.oh : days ? days * ohd : 0;
    const fee = split ? (cj?.feeRows ? cj.fee : MGMT_FEE) : 0;
    const net = price - direct - isola - fee;
    // THM's half: their settled dollar amount when one is recorded, otherwise half the net
    const thm = split ? (Number(j.partner_share) > 0 ? Number(j.partner_share) : net / 2) : 0;
    const mike = net - thm + fee;
    const together = isola + mike;
    const perDay = days ? mike / days : null;
    const reason = !hasCosts ? "No costs logged" : !days && !cj?.ohRows ? "Add your days" : null;
    return {
      id: j.id, name: j.job_name || j.customer || "Job", customer: j.customer ?? "", completed_date: j.completed_date ?? null,
      workType: j.work_type ?? j.job ?? null,
      price, direct, partner: j.partner ?? null, split, isolaPct, share: together, days, est: !!j.mike_days_est, hasCosts,
      overhead: isola, available: mike, perDay, myPay: days ? days * tgt : 0, company: isola,
      isola, fee, thm, mike, together, margin: price ? together / price : null,
      counted: !reason, reason,
    };
  });
}

export function payTotals(rows: PayRow[]) {
  const c = rows.filter((r) => r.counted);
  const s = (f: (r: PayRow) => number) => c.reduce((a, r) => a + f(r), 0);
  const days = s((r) => r.days ?? 0);
  const revenue = s((r) => r.price);
  const direct = s((r) => r.direct);
  const myPay = s((r) => r.myPay);
  const isola = s((r) => r.isola), fee = s((r) => r.fee), thm = s((r) => r.thm), mike = s((r) => r.mike), together = s((r) => r.together);
  const margins = c.filter((r) => r.margin != null).map((r) => r.margin as number);
  return {
    jobs: c.length, days, revenue, direct, overhead: isola, available: mike, myPay, company: isola,
    isola, fee, thm, mike, together,
    perDay: days ? mike / days : null,
    togetherPerDay: days ? together / days : null,
    /** margin on all the work together (Together ÷ revenue) */
    margin: revenue ? together / revenue : null,
    /** plain average of each job's margin */
    avgJobMargin: margins.length ? margins.reduce((a, m) => a + m, 0) / margins.length : null,
    companyPct: revenue ? isola / revenue : null,
    waiting: rows.length - c.length,
  };
}

/** Minimum price that pays Mike his target and Isola its $200/day, then marked up to a company margin. */
export function priceCheck(model: PayModel, direct: number, days: number, marginPct: number) {
  const floor = direct + days * (overheadPerDay(model) + (Number(model.owner_day_target) || 0));
  const m = Math.min(90, Math.max(0, marginPct)) / 100;
  return { floor, price: floor / (1 - m) };
}

/** Everything the pay screen, Performance and Home card need, in one load. */
export async function loadPay(sb: any) {
  const [s, f, j, w] = await Promise.all([
    sb.from("app_settings").select("value").eq("key", PAY_KEY).maybeSingle(),
    sb.from("job_financials").select("job_id,job_name,customer,work_type,completed_date,contract_total,partner,status").eq("status", "complete"),
    sb.from("jobs").select("id,mike_days,mike_days_est,thm_deal,partner_share,contract_holder,isola_cut").eq("status", "complete"),
    sb.from("workers").select("name,is_owner").eq("is_owner", true),
  ]);
  const bad = s.error?.message || f.error?.message || j.error?.message || w.error?.message;
  if (bad) throw new Error(bad);
  const extra = new Map<string, any>((j.data ?? []).map((x: any) => [x.id, x]));
  const jobs = (f.data ?? []).map((x: any) => {
    const e = extra.get(x.job_id) ?? {};
    return { ...x, id: x.job_id, mike_days: e.mike_days ?? null, mike_days_est: e.mike_days_est ?? false, thm_deal: e.thm_deal ?? null,
      partner_share: e.partner_share ?? null, contract_holder: e.contract_holder ?? null, isola_cut: e.isola_cut ?? null };
  });
  const ids = jobs.map((x: any) => x.id);
  let costs: any[] = [];
  if (ids.length) {
    const c = await sb.from("job_costs").select("job_id,category,amount,worker").in("job_id", ids);
    if (c.error) throw new Error(c.error.message);
    costs = c.data ?? [];
  }
  const owners = (w.data ?? []).map((x: any) => String(x.name ?? "")).filter(Boolean);
  return { model: parsePayModel(s.data?.value), jobs, costs, owners };
}
