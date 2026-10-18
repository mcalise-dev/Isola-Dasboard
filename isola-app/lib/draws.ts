/* Draw schedule amounts.
   Default is 33% deposit / 33% midpoint / balance. When a job's payment terms
   spell out dollar amounts (e.g. "Deposit $5,566 / midpoint $5,567 / balance"),
   the first two amounts are the fixed deposit and midpoint, and the balance is
   whatever is left of the contract — so approved change orders land in the balance. */
export type FixedDraws = { deposit?: number; midpoint?: number };

export function fixedDraws(terms?: string | null): FixedDraws {
  if (!terms) return {};
  const nums = Array.from(terms.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g))
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length < 2) return {};
  return { deposit: nums[0], midpoint: nums[1] };
}

export function stageDue(stage: string, contract: number, pct: number, fixed: FixedDraws): number {
  const has = fixed.deposit != null && fixed.midpoint != null;
  if (!has) return contract * (pct / 100);
  if (stage === "deposit") return fixed.deposit!;
  if (stage === "midpoint") return fixed.midpoint!;
  if (stage === "balance") return Math.max(0, contract - fixed.deposit! - fixed.midpoint!);
  return contract * (pct / 100);
}
