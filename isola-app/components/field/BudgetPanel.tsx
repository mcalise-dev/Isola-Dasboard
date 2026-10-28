"use client";
// v8.1 (10/28/26) Budget vs actual by cost code, top of the job's Costs tab.
//   budget  = job_budget_lines.amount (+ approved change orders coded to that line)
//   actual  = job_costs.amount by cost_code; a cost with no code falls back on its category
//             (Labor → LAB, fuel / trucking / rental → EQ, dump → DSP, THM → SUB)
//   Anything left uncoded (mostly materials) is listed so it can be coded with one tap.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast } from "@/components/Toaster";
import { parsePrice } from "@/lib/format";
import { NativeSelect } from "@/components/ui/input";
import MoneyInput from "@/components/MoneyInput";
import { Progress } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, Target } from "lucide-react";

const fmt$ = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
export function defaultCode(category: string | null | undefined): string | null {
  const c = String(category ?? "").toLowerCase();
  if (c === "labor") return "LAB";
  if (c.includes("fuel") || c.includes("truck") || c.includes("rental") || c.includes("equipment")) return "EQ";
  if (c.includes("dump") || c.includes("disposal")) return "DSP";
  if (c === "thm") return "SUB";
  return null;
}
const inp = "w-28 h-9 rounded-lg border border-input bg-neutral-950 px-2 text-right text-sm tabular-nums text-neutral-100 focus:outline-none focus:ring-2 focus:ring-white/40";

export default function BudgetPanel({ job, onChange }: { job: any; onChange?: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [codes, setCodes] = useState<{ code: string; name: string }[]>([]);
  const [lines, setLines] = useState<any[] | null>(null);
  const [costs, setCosts] = useState<any[]>([]);
  const [cos, setCos] = useState<any[]>([]);
  const [showUncoded, setShowUncoded] = useState(false);
  const [adding, setAdding] = useState("");

  async function load() {
    const [c, l, k, o] = await Promise.all([
      sb.from("cost_codes").select("code,name").eq("archived", false).order("sort"),
      sb.from("job_budget_lines").select("*").eq("job_id", job.id),
      sb.from("job_costs").select("id,amount,category,cost_code,vendor,worker,entry_date,notes").eq("job_id", job.id).gt("amount", 0),
      sb.from("change_orders").select("id,co_number,title,amount,status,cost_code").eq("job_id", job.id).eq("status", "approved"),
    ]);
    if (l.error) { showError("Couldn't load the budget: " + l.error.message); setLines([]); return; }
    setCodes(c.data ?? []); setLines(l.data ?? []); setCosts(k.data ?? []); setCos(o.data ?? []);
  }
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("isola:changed", on);
    return () => window.removeEventListener("isola:changed", on);
    // eslint-disable-next-line
  }, [job.id]);

  if (lines === null) return <div className="skeleton h-24" />;

  const codeOf = (c: any) => c.cost_code ?? defaultCode(c.category);
  const actual: Record<string, number> = {};
  const uncoded: any[] = [];
  for (const c of costs) { const k = codeOf(c); if (k) actual[k] = (actual[k] ?? 0) + Number(c.amount); else uncoded.push(c); }
  const coBy: Record<string, number> = {};
  let coUncoded = 0;
  for (const o of cos) { if (o.cost_code) coBy[o.cost_code] = (coBy[o.cost_code] ?? 0) + Number(o.amount || 0); else coUncoded += Number(o.amount || 0); }
  const budgetOf: Record<string, number> = {};
  lines.forEach((l) => { budgetOf[l.cost_code] = Number(l.amount || 0); });
  const shownCodes = codes.filter((c) => c.code in budgetOf || actual[c.code] || coBy[c.code]);
  const totalBudget = shownCodes.reduce((a, c) => a + (budgetOf[c.code] ?? 0) + (coBy[c.code] ?? 0), 0);
  const uncodedSum = uncoded.reduce((a, c) => a + Number(c.amount), 0);
  const totalSpent = Object.values(actual).reduce((a, b) => a + b, 0) + uncodedSum;
  const contract = (Number(job.price_amount) || parsePrice(job.price) || 0) + cos.reduce((a, o) => a + Number(o.amount || 0), 0);
  const projected = contract - Math.max(totalBudget, totalSpent);

  async function setBudget(code: string, amount: number) {
    const ex = lines!.find((l) => l.cost_code === code);
    const res = ex ? await sb.from("job_budget_lines").update({ amount }).eq("id", ex.id)
      : await sb.from("job_budget_lines").insert({ job_id: job.id, cost_code: code, amount });
    if (res.error) return showError(res.error.message);
    load();
  }
  async function addLine(code: string) {
    setAdding("");
    if (!code || code in budgetOf) return;
    const { error } = await sb.from("job_budget_lines").insert({ job_id: job.id, cost_code: code, amount: 0 });
    if (error) return showError(error.message);
    load();
  }
  async function codeCost(id: string, code: string) {
    const { error } = await sb.from("job_costs").update({ cost_code: code || null }).eq("id", id);
    if (error) return showError(error.message);
    showToast("Coded"); load(); onChange?.();
  }

  const empty = !shownCodes.length && !uncoded.length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-white">Budget vs actual</h2>
        <NativeSelect className="h-9 w-auto" value={adding} onChange={(e) => addLine(e.target.value)} aria-label="Add a budget line">
          <option value="">+ Budget line</option>
          {codes.filter((c) => !(c.code in budgetOf)).map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
        </NativeSelect>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Contract", contract ? fmt$(contract) : "—", ""],
          ["Budget", totalBudget ? fmt$(totalBudget) : "—", ""],
          ["Spent", fmt$(totalSpent), totalBudget && totalSpent > totalBudget ? "text-red-300" : ""],
          ["Projected margin", contract ? `${fmt$(projected)} · ${Math.round((projected / contract) * 100)}%` : "—", contract && projected / contract < 0.1 ? "text-red-300" : contract && projected / contract < 0.3 ? "text-amber-300" : "text-emerald-300"],
        ].map(([k, v, cls]) => (
          <div key={k} className="rounded-xl border border-border bg-card px-3 py-2">
            <div className="text-xs text-neutral-500">{k}</div>
            <div className={cn("truncate text-base font-semibold tabular-nums text-white", cls)}>{v}</div>
          </div>
        ))}
      </div>

      {empty ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 px-4 py-4 text-sm text-neutral-400">
          <Target size={18} className="shrink-0 text-neutral-500" />
          Add budget lines (concrete, labor, equipment…) and every cost you log lands against them.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {shownCodes.map((c) => {
            const b = (budgetOf[c.code] ?? 0) + (coBy[c.code] ?? 0), a = actual[c.code] ?? 0, left = b - a;
            const pct = b ? Math.round((a / b) * 100) : a ? 100 : 0;
            return (
              <div key={c.code} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white"><span className="text-neutral-500">{c.code}</span> {c.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs tabular-nums">
                    <span className="text-neutral-400">{fmt$(a)} spent</span>
                    {b ? <span className={left < 0 ? "font-semibold text-red-400" : "text-neutral-500"}>{left < 0 ? `${fmt$(-left)} over` : `${fmt$(left)} left`}</span> : <span className="text-amber-300">no budget</span>}
                    {coBy[c.code] ? <span className="text-neutral-500">incl. {fmt$(coBy[c.code])} CO</span> : null}
                  </div>
                  {b ? <Progress className="mt-1" value={Math.min(100, pct)} tone={pct > 100 ? "bad" : pct >= 85 ? "warn" : "ok"} /> : null}
                </div>
                <BudgetInput value={budgetOf[c.code] ?? 0} onSave={(n) => setBudget(c.code, n)} />
              </div>
            );
          })}
          {uncoded.length ? (
            <div className="px-3 py-2.5">
              <button onClick={() => setShowUncoded(!showUncoded)} className="flex w-full items-center gap-2 text-left text-sm">
                <span className="flex-1 font-medium text-amber-300">{uncoded.length} cost{uncoded.length === 1 ? "" : "s"} not coded · {fmt$(uncodedSum)}</span>
                <ChevronDown size={15} className={cn("text-neutral-500 transition-transform", showUncoded && "rotate-180")} />
              </button>
              {showUncoded ? (
                <div className="mt-2 space-y-1.5">
                  {uncoded.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-neutral-300">{c.vendor || c.worker || c.category || "Cost"}{c.notes ? ` · ${c.notes}` : ""} <span className="text-neutral-500">{c.entry_date}</span></span>
                      <span className="shrink-0 tabular-nums text-neutral-200">{fmt$(Number(c.amount))}</span>
                      <NativeSelect className="h-8 w-36 shrink-0 text-xs" value="" onChange={(e) => codeCost(c.id, e.target.value)} aria-label="Cost code">
                        <option value="">Code it…</option>
                        {codes.map((k) => <option key={k.code} value={k.code}>{k.code} · {k.name}</option>)}
                      </NativeSelect>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {coUncoded ? <p className="text-xs text-neutral-500">{fmt$(coUncoded)} in approved change orders isn't tied to a budget line — it's in the contract total.</p> : null}
    </section>
  );
}

// type freely; saves when you leave the field (not on every keystroke)
function BudgetInput({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(value ? String(value) : "");
  useEffect(() => { setV(value ? String(value) : ""); }, [value]);
  return (
    <div className="shrink-0">
      <div className="mb-0.5 text-right text-[10px] uppercase tracking-wide text-neutral-600">Budget</div>
      <MoneyInput className={inp} value={v} onChange={setV} onBlur={(x) => { const n = Number(x) || 0; if (n !== value) onSave(n); }} />
    </div>
  );
}
