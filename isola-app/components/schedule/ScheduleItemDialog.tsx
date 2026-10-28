"use client";
// v6.9 add / edit one schedule item: crew day, pour, delivery, sub, equipment, inspection,
// meeting or milestone — with the company coming, arrival window, quantity, status and crew.
// A typed company that isn't in Vendors yet is added there (same spelling, any case = same vendor).
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showError, showToast } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import JobPicker from "@/components/JobPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea, Field } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, Phone, Trash2 } from "lucide-react";
import { ITEM_TYPES, ITEM_TYPE, OUTSIDE, SCHED_STATUS, whoOn, type SchedItem } from "@/lib/schedule";

type Vendor = { id: string; company: string; trade: string | null; phone: string | null };

export type ScheduleDialogProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** edit this item; omit to add a new one */
  item?: SchedItem | null;
  date?: string;
  jobId?: string | null;
  type?: string;
  /** lock the job (opened from a job record) */
  lockJob?: boolean;
  /** pre-fill the company (opened from a vendor's card) */
  company?: string;
  jobs?: any[];
  crew: string[];
  onSaved: (firstDate?: string, jobId?: string | null) => void;
};

const blank = (date: string, jobId: string | null | undefined, type: string, company = "") => ({
  date, days: 1, skip: true, item_type: type, job_id: jobId ?? "", label: "", company, phone: "",
  start_time: type === "crew" ? "" : "07:00", end_time: "", qty: "", notes: "", status: "scheduled", crew: [] as string[],
});

function addDays(s: string, n: number) {
  const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ScheduleItemDialog({ open, onOpenChange, item, date, jobId, type = "crew", lockJob, company, jobs, crew, onSaved }: ScheduleDialogProps) {
  const sb = useMemo(() => createClient(), []);
  const [f, setF] = useState(() => blank(date ?? "", jobId, type, company ?? ""));
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setF({
        date: item.entry_date, days: 1, skip: true, item_type: item.item_type ?? "crew",
        job_id: item.job_id ?? "", label: item.job_id ? "" : (item.label ?? ""),
        company: item.company ?? "", phone: "",
        start_time: item.start_time?.slice(0, 5) ?? "", end_time: item.end_time?.slice(0, 5) ?? "",
        qty: item.qty ?? "", notes: item.notes ?? "", status: item.status ?? "scheduled", crew: whoOn(item),
      });
    } else setF(blank(date ?? "", jobId, type, company ?? ""));
    sb.from("vendors").select("id,company,trade,phone").order("company").then(({ data }) => setVendors((data as Vendor[]) ?? []));
  }, [open, item, date, jobId, type, company, sb]);

  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const outside = OUTSIDE.has(f.item_type);
  const matched = vendors.find((v) => v.company.trim().toLowerCase() === f.company.trim().toLowerCase());
  const t = ITEM_TYPE[f.item_type] ?? ITEM_TYPE.other;

  async function resolveVendor(): Promise<{ vendor_id: string | null; company: string | null }> {
    const name = f.company.trim();
    if (!name) return { vendor_id: null, company: null };
    if (matched) {
      if (f.phone.trim() && !matched.phone) await sb.from("vendors").update({ phone: f.phone.trim(), updated_at: new Date().toISOString() }).eq("id", matched.id);
      return { vendor_id: matched.id, company: matched.company };
    }
    const { data, error } = await sb.from("vendors")
      .insert({ company: name, phone: f.phone.trim() || null, trade: t.trade || null, status: "approved" })
      .select("id,company").single();
    if (error || !data) return { vendor_id: null, company: name };
    return { vendor_id: data.id as string, company: data.company as string };
  }

  async function save() {
    if (!f.date) { showError("Pick a date."); return; }
    if (!f.job_id && !f.label.trim() && !f.company.trim()) { showError("Pick a job, or type what it is."); return; }
    if (f.end_time && f.start_time && f.end_time < f.start_time) { showError("The window ends before it starts."); return; }
    setBusy(true);
    const v = await resolveVendor();
    const base: Record<string, any> = {
      item_type: f.item_type,
      job_id: f.job_id || null,
      label: f.job_id ? null : (f.label.trim() || null),
      vendor_id: v.vendor_id,
      company: v.company,
      start_time: f.start_time || null,
      end_time: f.end_time || null,
      qty: f.qty.trim() || null,
      notes: f.notes.trim() || null,
      status: f.status,
      assignees: f.crew,
      assignee: f.crew.length ? f.crew.join(", ") : null,
      updated_at: new Date().toISOString(),
    };
    let error: any = null;
    let first = f.date;
    if (item) {
      ({ error } = await sb.from("schedule_entries").update({ ...base, entry_date: f.date }).eq("id", item.id));
    } else {
      const dates: string[] = [];
      let d = f.date;
      while (dates.length < Math.max(1, f.days)) {
        const dow = new Date(d + "T12:00:00").getDay();
        if (f.days === 1 || !f.skip || (dow !== 0 && dow !== 6)) dates.push(d);
        d = addDays(d, 1);
      }
      first = dates[0];
      ({ error } = await sb.from("schedule_entries").insert(dates.map((dt) => ({ ...base, entry_date: dt }))));
    }
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    showToast(item ? "Saved" : f.days > 1 ? `${f.days} days added` : `${t.label} added`);
    window.dispatchEvent(new Event("isola:changed"));
    onOpenChange(false);
    onSaved(first, f.job_id || null);
  }

  async function remove() {
    if (!item) return;
    if (!(await ask({ title: "Remove this from the schedule?", confirm: "Remove", danger: true }))) return;
    const { error } = await sb.from("schedule_entries").delete().eq("id", item.id);
    if (error) { showError("Remove failed: " + error.message); return; }
    showToast("Removed from the schedule");
    window.dispatchEvent(new Event("isola:changed"));
    onOpenChange(false);
    onSaved();
  }

  const crewOptions = Array.from(new Set([...crew, ...f.crew, "THM"]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{item ? "Edit schedule item" : "Add to the schedule"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-neutral-400">What is it</div>
            <div className="flex flex-wrap gap-1.5">
              {ITEM_TYPES.map((it) => {
                const Icon = it.icon;
                const on = f.item_type === it.key;
                return (
                  <button key={it.key} type="button"
                    onClick={() => set({ item_type: it.key, start_time: f.start_time || (it.key === "crew" ? "" : "07:00") })}
                    className={cn("inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold",
                      on ? "border-brand bg-brand text-neutral-950" : "border-border text-neutral-300 hover:text-white")}>
                    <Icon size={15} /> {it.label}
                  </button>
                );
              })}
            </div>
          </div>

          {lockJob ? null : (
            <Field label="Job">
              {jobs ? (
                <JobPicker jobs={jobs} value={f.job_id} onChange={(id) => set({ job_id: id, label: id ? "" : f.label })} placeholder="Type to find a job…" />
              ) : null}
              {!f.job_id ? <Input className="mt-2" placeholder="…or describe it (shop day, dump run)" value={f.label} onChange={(e) => set({ label: e.target.value })} /> : null}
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={item ? "Date" : "Start date"}>
              <Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            {item ? (
              <Field label="Status">
                <NativeSelect value={f.status} onChange={(e) => set({ status: e.target.value })}>
                  {Object.entries(SCHED_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </NativeSelect>
              </Field>
            ) : (
              <Field label="Days">
                <NativeSelect value={f.days} onChange={(e) => set({ days: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map((n) => <option key={n} value={n}>{n} day{n === 1 ? "" : "s"}</option>)}
                </NativeSelect>
              </Field>
            )}
          </div>
          {!item && f.days > 1 ? (
            <label className="-mt-2 flex items-center gap-2 text-xs text-neutral-400"><input type="checkbox" checked={f.skip} onChange={(e) => set({ skip: e.target.checked })} /> Skip weekends</label>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label={outside ? "Arriving" : "Start (optional)"}>
              <Input type="time" value={f.start_time} onChange={(e) => set({ start_time: e.target.value })} />
            </Field>
            <Field label={outside ? "Window ends (optional)" : "End (optional)"}>
              <Input type="time" value={f.end_time} onChange={(e) => set({ end_time: e.target.value })} />
            </Field>
          </div>

          <Field label={outside ? "Company coming" : "Company (optional)"}>
            <Input list="sched-vendors" placeholder="Type or pick — new names are added to Vendors" value={f.company} onChange={(e) => set({ company: e.target.value })} />
            <datalist id="sched-vendors">{vendors.map((v) => <option key={v.id} value={v.company}>{v.trade ?? ""}</option>)}</datalist>
            {f.company.trim() ? (
              matched?.phone ? (
                <a href={`tel:${matched.phone.replace(/[^0-9+]/g, "")}`} className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white"><Phone size={12} /> {matched.phone}{matched.trade ? ` · ${matched.trade}` : ""}</a>
              ) : (
                <Input className="mt-2" inputMode="tel" placeholder="Their phone (saved to the vendor)" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
              )
            ) : null}
          </Field>

          <Field label="Quantity / details">
            <Input placeholder={t.hint ? `e.g. ${t.hint}` : "Optional"} value={f.qty} onChange={(e) => set({ qty: e.target.value })} />
          </Field>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-neutral-400">Our crew there</div>
            <div className="flex flex-wrap gap-1.5">
              {crewOptions.map((name) => {
                const on = f.crew.includes(name);
                return (
                  <button key={name} type="button" onClick={() => set({ crew: on ? f.crew.filter((n) => n !== name) : [...f.crew, name] })}
                    className={cn("inline-flex h-10 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold",
                      on ? "border-white bg-white/10 text-white" : "border-border text-neutral-400 hover:text-white")}>
                    {on ? <Check size={13} /> : null}{name}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Notes">
            <Textarea rows={2} placeholder="Access, who to call on site, prep needed before they arrive…" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          {item ? <Button variant="ghost" className="text-red-300 sm:mr-auto" onClick={remove}><Trash2 size={15} /> Remove</Button> : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : item ? "Save" : f.days > 1 ? `Add ${f.days} days` : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
