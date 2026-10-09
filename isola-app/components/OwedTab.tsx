"use client";
// "Subs payroll" — every unpaid cost (crew labor, subs) grouped by person, then by job.
// Source of truth is job_costs.paid = false. Paying someone flips their lines to paid.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { money, fmtDate, jobLabel, todayISO } from "@/lib/format";
import { showError, showToast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton } from "@/components/ui/bits";
import { ChevronDown, ChevronRight, HandCoins, Plus, RotateCcw } from "lucide-react";

type Line = { id: string; job_id: string | null; entry_date: string; worker: string | null; vendor: string | null; category: string | null; hours: number | null; rate: number | null; amount: number; notes: string | null; paid: boolean; updated_at: string };

const who = (l: Line) => (l.worker || l.vendor || "Unnamed").trim();

export default function OwedTab() {
  const sb = useMemo(() => createClient(), []);
  const [owed, setOwed] = useState<Line[] | null>(null);
  const [recent, setRecent] = useState<Line[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ person: "", job_id: "", amount: "", note: "", date: todayISO() });
  const [crew, setCrew] = useState<string[]>([]);

  const cols = "id,job_id,entry_date,worker,vendor,category,hours,rate,amount,notes,paid,updated_at";
  async function load() {
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const [o, r, j, w] = await Promise.all([
      sb.from("job_costs").select(cols).eq("paid", false).gt("amount", 0).order("entry_date"),
      sb.from("job_costs").select(cols).eq("paid", true).eq("category", "Labor").gte("updated_at", since).order("updated_at", { ascending: false }).limit(40),
      sb.from("jobs").select("id,job_name,customer,location,job,status").order("job_name"),
      sb.from("workers").select("name").eq("active", true).eq("is_owner", false).order("name"),
    ]);
    if (o.error) { showError("Couldn't load: " + o.error.message); setOwed([]); return; }
    setOwed((o.data ?? []) as Line[]);
    setRecent(((r.data ?? []) as Line[]).filter((l) => l.worker || l.vendor));
    setJobs(j.data ?? []);
    setCrew((w.data ?? []).map((x: any) => x.name));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const jobName = (id: string | null) => {
    if (!id) return "No job (overhead)";
    const j = jobs.find((x) => x.id === id);
    return j ? jobLabel(j) : "Job";
  };

  // person -> job -> lines
  const people = useMemo(() => {
    const m = new Map<string, Line[]>();
    for (const l of owed ?? []) { const k = who(l); m.set(k, [...(m.get(k) ?? []), l]); }
    return [...m.entries()]
      .map(([name, lines]) => {
        const byJob = new Map<string, Line[]>();
        for (const l of lines) { const k = l.job_id ?? ""; byJob.set(k, [...(byJob.get(k) ?? []), l]); }
        return { name, lines, total: lines.reduce((a, l) => a + Number(l.amount || 0), 0), byJob: [...byJob.entries()] };
      })
      .sort((a, b) => b.total - a.total);
  }, [owed]);

  const grand = people.reduce((a, p) => a + p.total, 0);

  async function setPaid(ids: string[], paid: boolean) {
    const { error } = await sb.from("job_costs").update({ paid, updated_at: new Date().toISOString() }).in("id", ids);
    if (error) { showError("Save failed: " + error.message); return false; }
    return true;
  }

  async function payPerson(p: { name: string; lines: Line[]; total: number }) {
    if (!confirm(`Mark ${p.name} paid in full — ${money(p.total)}?`)) return;
    setBusy(p.name);
    if (await setPaid(p.lines.map((l) => l.id), true)) showToast(`${p.name} paid ${money(p.total)}`);
    setBusy(""); load();
  }
  async function payJob(name: string, lines: Line[]) {
    const t = lines.reduce((a, l) => a + Number(l.amount || 0), 0);
    if (!confirm(`Mark ${name} paid ${money(t)} for this job?`)) return;
    if (await setPaid(lines.map((l) => l.id), true)) showToast(`${name} paid ${money(t)}`);
    load();
  }
  async function toggleLine(l: Line) {
    if (await setPaid([l.id], !l.paid)) load();
  }

  async function addOwed() {
    const amt = Number(String(f.amount).replace(/[^0-9.]/g, ""));
    if (!f.person.trim() || !(amt > 0)) { showError("Who and how much are required."); return; }
    setBusy("add");
    const { error } = await sb.from("job_costs").insert({
      job_id: f.job_id || null, entry_date: f.date, category: "Labor", worker: f.person.trim(),
      amount: amt, paid: false, notes: f.note.trim() || null, status: "ok",
    });
    setBusy("");
    if (error) { showError("Save failed: " + error.message); return; }
    showToast(`Owe ${f.person.trim()} ${money(amt)}`);
    setF({ person: "", job_id: "", amount: "", note: "", date: todayISO() }); setAdding(false); load();
  }

  return (
    <div>
      <PageHeader title="Subs payroll" sub="What you still owe your crew and subs, by person and job"
        actions={<Button size="sm" onClick={() => setAdding((v) => !v)}><Plus size={15} /> Add what I owe</Button>} />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Total I owe" value={owed ? money(grand) : "—"} tone={grand > 0 ? "warn" : "ok"} />
        <Stat label="People" value={owed ? people.length : "—"} hint={people[0] ? `Most: ${people[0].name}` : undefined} />
      </div>

      {adding ? (
        <div className="mb-5 rounded-xl border border-border p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Input list="owed-crew" placeholder="Who" value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })} />
            <datalist id="owed-crew">{[...new Set([...crew, ...people.map((p) => p.name)])].map((n) => <option key={n} value={n} />)}</datalist>
            <Input inputMode="decimal" placeholder="Amount $" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            <select value={f.job_id} onChange={(e) => setF({ ...f, job_id: e.target.value })}
              className="col-span-2 h-9 rounded-lg border border-input bg-transparent px-2 text-sm text-white sm:col-span-1">
              <option value="">No job</option>
              {jobs.filter((j) => j.status !== "lost").map((j) => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
            </select>
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <Input placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={addOwed} disabled={busy === "add"}>{busy === "add" ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      ) : null}

      {owed === null ? <ListSkeleton /> : people.length === 0 ? (
        <Empty icon={<HandCoins size={28} />} title="You're all square" body="Nobody is waiting on money. Labor logged as Owed shows up here." />
      ) : (
        <div className="space-y-2.5">
          {people.map((p) => {
            const isOpen = open[p.name] ?? true;
            return (
              <div key={p.name} className="rounded-xl border border-border bg-card">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setOpen((s) => ({ ...s, [p.name]: !isOpen }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {isOpen ? <ChevronDown size={16} className="text-neutral-500" /> : <ChevronRight size={16} className="text-neutral-500" />}
                    <span className="truncate text-base font-semibold text-white">{p.name}</span>
                    <span className="text-xs text-neutral-500">{p.byJob.length} job{p.byJob.length === 1 ? "" : "s"}</span>
                  </button>
                  <span className="text-lg font-semibold tabular-nums text-amber-300">{money(p.total)}</span>
                  <Button size="sm" variant="outline" onClick={() => payPerson(p)} disabled={busy === p.name}>Paid all</Button>
                </div>
                {isOpen ? (
                  <div className="border-t border-border px-4 py-2.5 space-y-3">
                    {p.byJob.map(([jid, lines]) => {
                      const t = lines.reduce((a, l) => a + Number(l.amount || 0), 0);
                      return (
                        <div key={jid}>
                          <div className="mb-1 flex items-center gap-2">
                            {jid ? <Link href={`/jobs/${jid}`} className="truncate text-sm font-medium text-neutral-200 hover:underline">{jobName(jid)}</Link>
                              : <span className="text-sm font-medium text-neutral-400">{jobName(null)}</span>}
                            <span className="ml-auto text-sm tabular-nums text-neutral-300">{money(t)}</span>
                            {p.byJob.length > 1 ? <button onClick={() => payJob(p.name, lines)} className="text-[11px] font-semibold text-neutral-400 underline">paid this job</button> : null}
                          </div>
                          <div className="space-y-1">
                            {lines.map((l) => (
                              <div key={l.id} className="flex items-center gap-2 pl-2 text-xs">
                                <span className="w-16 shrink-0 text-neutral-500">{fmtDate(l.entry_date)}</span>
                                <span className="min-w-0 flex-1 truncate text-neutral-400">
                                  {l.hours != null ? `${Number(l.hours)}h${l.rate != null ? ` @ $${Number(l.rate)}` : ""}` : (l.category ?? "")}
                                  {l.notes ? ` · ${l.notes}` : ""}
                                </span>
                                <span className="tabular-nums text-neutral-200">{money(Number(l.amount || 0))}</span>
                                <button onClick={() => toggleLine(l)}><Badge variant="warning">Owed</Badge></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {recent.length ? (
        <div className="mt-8">
          <SectionTitle right={<span className="text-xs text-neutral-500">last 14 days</span>}>Recently paid</SectionTitle>
          <div className="space-y-1">
            {recent.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                <span className="w-20 shrink-0 font-medium text-white truncate">{who(l)}</span>
                <span className="min-w-0 flex-1 truncate text-neutral-400">{jobName(l.job_id)} · {fmtDate(l.entry_date)}</span>
                <span className="tabular-nums text-emerald-300">{money(Number(l.amount || 0))}</span>
                <button onClick={() => toggleLine(l)} title="Undo — back to owed" className="rounded p-1 text-neutral-500 hover:text-white"><RotateCcw size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
