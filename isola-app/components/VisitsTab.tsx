"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Job, jobLabel, fmtDate, todayISO } from "@/lib/format";
import JobPicker from "@/components/JobPicker";
import { showError, showToast, undoable } from "@/components/Toaster";
import { withTimeout, firstError } from "@/lib/load";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea, Field } from "@/components/ui/input";
import { PageHeader, Empty, KV, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Plus, X, ChevronDown, Trash2, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

type Visit = {
  id: string;
  visit_date: string | null;
  property_address: string | null;
  client_company: string | null;
  met_with: string | null;
  purpose: string | null;
  job_id: string | null;
  dimensions: string | null;
  observed_conditions: string | null;
  weather: string | null;
  photos_taken: string | null;
  follow_up_needed: string | null;
};

const empty = {
  visit_date: "", property_address: "", client_company: "", met_with: "", purpose: "",
  job_id: "", dimensions: "", observed_conditions: "", weather: "", photos_taken: "", follow_up_needed: "",
};

export default function VisitsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ ...empty, visit_date: todayISO() });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const [v, j] = await withTimeout(Promise.all([
        supabase.from("site_visits").select("*").order("visit_date", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("jobs").select("id,job_name,customer,location,job,status,paid_date,priority").order("customer"),
      ]));
      const e = firstError(v, j);
      if (e) throw new Error(e);
      setVisits((v.data as Visit[]) ?? []);
      setJobs((j.data as unknown as Job[]) ?? []);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); }, []);
  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  async function save() {
    if (!form.property_address.trim() && !form.client_company.trim()) { showError("Add at least an address or a client."); return; }
    setBusy(true);
    const payload: any = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    const { error } = await supabase.from("site_visits").insert(payload);
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    setForm({ ...empty, visit_date: todayISO() });
    setAdding(false);
    showToast("Visit logged");
    load();
  }

  function remove(v: Visit) {
    const before = visits ?? [];
    undoable({
      text: "Deleted site visit",
      hide: () => setVisits(before.filter((x) => x.id !== v.id)),
      restore: () => setVisits(before),
      commit: () => supabase.from("site_visits").delete().eq("id", v.id),
    });
  }

  const header = (
    <PageHeader
      title="Site visits"
      sub="Observed conditions only — no pricing on site records."
      actions={
        <Button onClick={() => setAdding(!adding)} variant={adding ? "outline" : "default"}>
          {adding ? <><X size={16} /> Close</> : <><Plus size={16} /> Visit</>}
        </Button>
      }
    />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;

  return (
    <div>
      {header}

      {adding ? (
        <Card className="mb-4 space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date"><Input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} /></Field>
            <Field label="Weather"><Input value={form.weather} onChange={(e) => setForm({ ...form, weather: e.target.value })} /></Field>
          </div>
          <Field label="Property Address"><Input value={form.property_address} onChange={(e) => setForm({ ...form, property_address: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client / Company"><Input value={form.client_company} onChange={(e) => setForm({ ...form, client_company: e.target.value })} /></Field>
            <Field label="Met With"><Input value={form.met_with} onChange={(e) => setForm({ ...form, met_with: e.target.value })} /></Field>
          </div>
          <Field label="Linked Job">
            <JobPicker jobs={jobs} value={form.job_id} onChange={(id) => setForm({ ...form, job_id: id })} />
          </Field>
          <Field label="Purpose"><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></Field>
          <Field label="Dimensions"><Input value={form.dimensions} onChange={(e) => setForm({ ...form, dimensions: e.target.value })} /></Field>
          <Field label="Observed Conditions"><Textarea rows={3} value={form.observed_conditions} onChange={(e) => setForm({ ...form, observed_conditions: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Photos Taken"><Input value={form.photos_taken} onChange={(e) => setForm({ ...form, photos_taken: e.target.value })} /></Field>
            <Field label="Follow-up Needed"><Input value={form.follow_up_needed} onChange={(e) => setForm({ ...form, follow_up_needed: e.target.value })} /></Field>
          </div>
          <Button onClick={save} disabled={busy} className="w-full">{busy ? "Saving…" : "Log Visit"}</Button>
        </Card>
      ) : null}

      {!visits ? <ListSkeleton /> : visits.length === 0 ? (
        <Empty
          icon={<ClipboardList size={26} />}
          title="No site visits logged yet"
          body="Log what you saw on site — dimensions, conditions, who you met."
          action={!adding ? <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus size={15} /> Log a visit</Button> : undefined}
        />
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2">
          {visits.map((v) => (
            <Card key={v.id}>
              <button className="flex min-h-[56px] w-full items-start gap-3 px-4 py-3 text-left" onClick={() => setOpen(open === v.id ? null : v.id)} aria-expanded={open === v.id}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-white">{v.property_address ?? v.client_company ?? "Site visit"}</div>
                  <div className="truncate text-xs text-neutral-400">
                    {[fmtDate(v.visit_date), v.client_company, v.purpose].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <ChevronDown size={16} className={cn("mt-1 shrink-0 text-neutral-500 transition-transform", open === v.id && "rotate-180")} />
              </button>
              {open === v.id ? (
                <div className="border-t border-border px-4 py-2 text-sm">
                  {v.met_with ? <KV k="Met with">{v.met_with}</KV> : null}
                  {v.job_id && jobById[v.job_id] ? <KV k="Job">{jobLabel(jobById[v.job_id])}</KV> : null}
                  {v.weather ? <KV k="Weather">{v.weather}</KV> : null}
                  {v.dimensions ? <KV k="Dimensions"><span className="whitespace-pre-wrap">{v.dimensions}</span></KV> : null}
                  {v.observed_conditions ? (
                    <div className="border-b border-white/[0.05] py-2">
                      <div className="text-neutral-400">Observed</div>
                      <p className="mt-0.5 whitespace-pre-wrap text-neutral-100">{v.observed_conditions}</p>
                    </div>
                  ) : null}
                  {v.photos_taken ? <KV k="Photos">{v.photos_taken}</KV> : null}
                  {v.follow_up_needed ? <KV k="Follow-up">{v.follow_up_needed}</KV> : null}
                  <div className="pt-2">
                    <Button variant="destructive" size="sm" onClick={() => remove(v)}><Trash2 size={14} /> Delete</Button>
                  </div>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
