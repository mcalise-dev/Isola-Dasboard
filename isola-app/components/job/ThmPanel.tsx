"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { money, todayISO } from "@/lib/format";
import { withTimeout, firstError } from "@/lib/load";
import { showError, showToast, undoable } from "@/components/Toaster";
import { editJob } from "@/components/job/JobForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Empty, ListSkeleton, LoadError, SectionTitle } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Clock, Hammer, Pencil, Plus, Trash2, Truck, Wrench } from "lucide-react";

/* v5.8 THM on a job. Contract holder + deal live on the job (Edit job).
   Reimburse deal: one line per truck / machine / labor / other, hours or days x rate.
   Isola holds -> what Isola owes THM (also lands in the job's costs as category THM).
   THM holds  -> what THM owes Isola. Every line rolls onto the THM tab's running tab. */

type Item = {
  id: string; job_id: string; kind: "truck" | "machine" | "labor" | "other"; label: string | null;
  unit: "hours" | "days" | "flat"; qty: number; rate: number; amount: number;
  entry_date: string | null; notes: string | null; sort: number; created_at: string;
};

const KINDS = [
  { key: "truck", label: "Truck time", icon: Truck, placeholder: "Dump truck" },
  { key: "machine", label: "Machine time", icon: Wrench, placeholder: "Which machine" },
  { key: "labor", label: "Labor time", icon: Clock, placeholder: "Who (Tyler…)" },
  { key: "other", label: "Other", icon: Hammer, placeholder: "Fuel, materials…" },
] as const;

const errMsg = (e: any) => (e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
const num = (v: any) => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };

export default function ThmPanel({ job, onChange }: { job: any; onChange?: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const thmHolds = job.contract_holder === "thm";
  const deal: "split" | "reimburse" = job.thm_deal === "split" ? "split" : "reimburse";
  const direction = thmHolds ? "THM owes you" : "You owe THM";

  async function load() {
    setErr(null);
    try {
      const r = await withTimeout(sb.from("thm_job_items").select("*").eq("job_id", job.id).order("sort").order("created_at"));
      const e = firstError(r);
      if (e) throw new Error(e);
      setItems((r.data as Item[]) ?? []);
    } catch (e: any) { setErr(errMsg(e)); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [job.id]);

  async function add(kind: Item["kind"]) {
    setBusy(kind);
    // start from the last rate used for this kind of line on any job
    const { data: last } = await sb.from("thm_job_items").select("label,unit,rate").eq("kind", kind)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const row = {
      job_id: job.id, kind,
      label: kind === "labor" ? (last?.label ?? "Tyler") : kind === "truck" ? (last?.label ?? "Dump truck") : null,
      unit: kind === "other" ? "flat" : (last?.unit ?? (kind === "labor" ? "hours" : "days")),
      qty: 1, rate: Number(last?.rate ?? 0), entry_date: todayISO(), sort: (items?.length ?? 0) + 1,
    };
    const { data, error } = await sb.from("thm_job_items").insert(row).select("*").single();
    setBusy("");
    if (error) return showError("Couldn't add the line: " + error.message);
    setItems((s) => [...(s ?? []), data as Item]);
    onChange?.();
  }

  async function save(it: Item, patch: Partial<Item>) {
    const next = { ...it, ...patch };
    if (next.unit === "flat") next.qty = 1;
    setItems((s) => (s ?? []).map((x) => (x.id === it.id ? { ...next, amount: Math.round(num(next.qty) * num(next.rate) * 100) / 100 } : x)));
    const { error } = await sb.from("thm_job_items").update({
      label: next.label, unit: next.unit, qty: num(next.qty), rate: num(next.rate),
      entry_date: next.entry_date || null, notes: next.notes, updated_at: new Date().toISOString(),
    }).eq("id", it.id);
    if (error) { showError("Save failed: " + error.message); load(); return; }
    onChange?.();
  }

  function remove(it: Item) {
    const before = items ?? [];
    undoable({
      text: "Removed the THM line",
      hide: () => setItems(before.filter((x) => x.id !== it.id)),
      restore: () => setItems(before),
      commit: async () => { await sb.from("thm_job_items").delete().eq("id", it.id); onChange?.(); },
    });
  }

  if (err) return <LoadError message={err} onRetry={load} />;
  if (!items) return <ListSkeleton />;

  const total = items.reduce((a, x) => a + Number(x.amount || 0), 0);
  const byKind = (k: string) => items.filter((x) => x.kind === k).reduce((a, x) => a + Number(x.amount || 0), 0);

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={thmHolds ? "warning" : "muted"}>{thmHolds ? "THM holds the contract" : "Isola holds the contract"}</Badge>
              <Badge variant="muted">{deal === "split" ? "50/50 split of net" : "Reimburse time + equipment"}</Badge>
            </div>
            <div className="mt-3 text-xs uppercase tracking-wide text-neutral-500">{direction}</div>
            <div className={cn("text-3xl font-semibold tabular-nums", thmHolds ? "text-emerald-300" : "text-white")}>{money(total)}</div>
            <p className="mt-1 text-xs text-neutral-500">
              {deal === "split"
                ? "THM's half of the net profit is figured at closeout. Use the lines below for anything paid back on top (materials, fuel, equipment)."
                : thmHolds ? "No profit split. Add your time and equipment on Tyler's job; it goes on the running tab."
                : "No profit split. Add Tyler's truck, machine and labor time; it counts as a job cost and goes on the running tab."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => editJob(job)}><Pencil size={14} /> Change deal</Button>
            <Button variant="ghost" size="sm" asChild><Link href="/thm">THM tab</Link></Button>
          </div>
        </div>
        {items.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm sm:grid-cols-4">
            {KINDS.map((k) => (
              <div key={k.key}><div className="text-xs text-neutral-500">{k.label}</div><div className="font-semibold tabular-nums text-white">{money(byKind(k.key))}</div></div>
            ))}
          </div>
        ) : null}
      </Card>

      <section>
        <SectionTitle>Add a line</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map((k) => (
            <Button key={k.key} variant="outline" className="h-11" disabled={!!busy} onClick={() => add(k.key)}>
              <Plus size={14} /> <k.icon size={15} /> {k.label}
            </Button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-neutral-500">Add one Machine line per machine. Rates start from the last one you used.</p>
      </section>

      <section>
        <SectionTitle>Lines ({items.length})</SectionTitle>
        {items.length === 0 ? (
          <Empty icon={<Truck size={24} />} title="Nothing on this job yet" body={`Add the truck, each machine and the labor. Pick hours or days, plug in how many and the rate.`} />
        ) : (
          <div className="space-y-2">
            {items.map((it) => <Line key={it.id} it={it} onSave={(p) => save(it, p)} onRemove={() => remove(it)} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function Line({ it, onSave, onRemove }: { it: Item; onSave: (p: Partial<Item>) => void; onRemove: () => void }) {
  const meta = KINDS.find((k) => k.key === it.kind) ?? KINDS[3];
  const Icon = meta.icon;
  const [label, setLabel] = useState(it.label ?? "");
  const [qty, setQty] = useState(String(it.qty ?? ""));
  const [rate, setRate] = useState(String(it.rate ?? ""));
  const [notes, setNotes] = useState(it.notes ?? "");
  const amount = Math.round(num(it.unit === "flat" ? 1 : qty) * num(rate) * 100) / 100;
  const per = it.unit === "days" ? "/day" : it.unit === "hours" ? "/hr" : "";

  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className="shrink-0 text-neutral-400" />
        <span className="text-sm font-semibold text-white">{meta.label}</span>
        <span className="ml-auto text-base font-semibold tabular-nums text-white">{money(amount)}</span>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Remove line" onClick={onRemove}><Trash2 size={15} /></Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_0.9fr_0.7fr_0.8fr_1fr]">
        <Input className="col-span-2 h-10 sm:col-span-1" placeholder={meta.placeholder} value={label}
          onChange={(e) => setLabel(e.target.value)} onBlur={() => { if (label !== (it.label ?? "")) onSave({ label: label.trim() || null }); }} />
        <NativeSelect className="h-10" value={it.unit} onChange={(e) => onSave({ unit: e.target.value as Item["unit"] })} aria-label="Hours or days">
          <option value="hours">Hours</option>
          <option value="days">Days</option>
          <option value="flat">Flat $</option>
        </NativeSelect>
        {it.unit === "flat" ? <div className="hidden sm:block" /> : (
          <Input className="h-10" inputMode="decimal" placeholder={it.unit === "days" ? "Days" : "Hours"} value={qty}
            onChange={(e) => setQty(e.target.value)} onBlur={() => { if (num(qty) !== Number(it.qty)) onSave({ qty: num(qty) }); }} />
        )}
        <Input className="h-10" inputMode="decimal" placeholder={it.unit === "flat" ? "Amount" : `Rate ${per}`} value={rate}
          onChange={(e) => setRate(e.target.value)} onBlur={() => { if (num(rate) !== Number(it.rate)) onSave({ rate: num(rate) }); }} />
        <Input className="h-10" type="date" value={it.entry_date ?? ""} onChange={(e) => onSave({ entry_date: e.target.value || null })} aria-label="Date" />
      </div>
      <Input className="mt-2 h-9 text-[13px]" placeholder="Note (optional)" value={notes}
        onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes !== (it.notes ?? "")) onSave({ notes: notes.trim() || null }); }} />
      {it.unit !== "flat" ? <p className="mt-1 text-xs text-neutral-500">{num(qty) || 0} {it.unit} × {money(num(rate))}{per} = {money(amount)}</p> : null}
    </Card>
  );
}
