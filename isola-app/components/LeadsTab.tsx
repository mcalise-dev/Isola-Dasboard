"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/format";
import { showError, showToast, undoable } from "@/components/Toaster";
import { askText } from "@/components/Dialogs";
import { withTimeout, firstError } from "@/lib/load";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Textarea, Field } from "@/components/ui/input";
import { PageHeader, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Plus, X, Search, Star, MapPin, Phone, ClipboardCheck, Send, CalendarCheck, Ban, Trash2, UserPlus } from "lucide-react";

const emptyLead = {
  job_name: "", customer: "", location: "", job: "",
  contact_name: "", contact_phone: "", notes: "",
};

const daysSince = (iso: string | null) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d < 0 ? 0 : d;
};

export default function LeadsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [leads, setLeads] = useState<any[] | null>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ ...emptyLead });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  async function load() {
    setErr(null);
    try {
      const [j, v] = await withTimeout(Promise.all([
        supabase.from("jobs").select("*").eq("status", "lead").order("priority", { ascending: false }).order("created_at", { ascending: true }),
        supabase.from("site_visits").select("job_id,visit_date"),
      ]));
      const e = firstError(j, v);
      if (e) throw new Error(e);
      setLeads(j.data ?? []);
      setVisits(v.data ?? []);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); }, []);

  const visitByJob = useMemo(() => {
    const m: Record<string, string> = {};
    visits.forEach((v: any) => {
      if (!v.job_id) return;
      if (!m[v.job_id] || (v.visit_date ?? "") > m[v.job_id]) m[v.job_id] = v.visit_date ?? "";
    });
    return m;
  }, [visits]);

  const shown = (leads ?? []).filter((l) => {
    if (!q) return true;
    const hay = `${l.job_name ?? ""} ${l.customer ?? ""} ${l.location ?? ""} ${l.job ?? ""} ${l.notes ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  async function addLead() {
    if (!form.job_name.trim() && !form.customer.trim()) { showError("Give it a job name or a customer."); return; }
    setBusy(true);
    const payload: any = { ...form, status: "lead", updated_at: new Date().toISOString() };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    if (!payload.job_name) payload.job_name = payload.customer;
    const { error } = await supabase.from("jobs").insert(payload);
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    setForm({ ...emptyLead });
    setAdding(false);
    showToast("Lead saved");
    load();
  }

  async function move(l: any, status: string, lost_reason?: string) {
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (lost_reason) patch.lost_reason = lost_reason;
    const { error } = await supabase.from("jobs").update(patch).eq("id", l.id);
    if (error) { showError("Update failed: " + error.message); return; }
    load();
  }

  async function markLost(l: any) {
    const r = await askText({ title: "Why is it dead?", body: "Price, no response, not our work…", initial: "No go", confirm: "Mark lost" });
    if (r !== null) move(l, "lost", r || "No go");
  }

  async function togglePriority(l: any) {
    await supabase.from("jobs").update({ priority: !l.priority }).eq("id", l.id);
    load();
  }

  function remove(l: any) {
    const before = leads ?? [];
    undoable({
      text: `Deleted lead ${l.job_name ?? l.customer}`,
      hide: () => setLeads(before.filter((x) => x.id !== l.id)),
      restore: () => setLeads(before),
      commit: () => supabase.from("jobs").delete().eq("id", l.id),
    });
  }

  const walked = shown.filter((l) => visitByJob[l.id]);
  const notWalked = shown.filter((l) => !visitByJob[l.id]);

  const header = (
    <PageHeader
      title="To quote"
      sub="Work that hasn't gone out yet — go look, then send the proposal."
      actions={
        <Button onClick={() => setAdding(!adding)} variant={adding ? "outline" : "default"}>
          {adding ? <><X size={16} /> Cancel</> : <><Plus size={16} /> Lead</>}
        </Button>
      }
    />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;

  return (
    <div>
      {header}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Need a look" value={leads ? notWalked.length : "—"} tone={notWalked.length ? "warn" : undefined} />
        <Stat label="Walked, needs proposal" value={leads ? walked.length : "—"} />
      </div>

      <div className="relative mb-4">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search To Quote…" className="pl-9" />
      </div>

      {adding ? (
        <Card className="mb-4 space-y-3 p-4">
          <Field label="Job Name"><Input placeholder="e.g. 59 Cedar St" value={form.job_name} onChange={(e) => setForm({ ...form, job_name: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer"><Input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} /></Field>
            <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
            <Field label="Job Type"><Input placeholder="Concrete, wall…" value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} /></Field>
            <Field label="Contact"><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
          </div>
          <Field label="Phone"><Input inputMode="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></Field>
          <Field label="Notes"><Textarea rows={2} placeholder="What they want looked at" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Button disabled={busy} onClick={addLead} className="w-full">{busy ? "Saving…" : "Save lead"}</Button>
        </Card>
      ) : null}

      {!leads ? <ListSkeleton /> : shown.length === 0 ? (
        <Empty
          icon={<UserPlus size={26} />}
          title={q ? "No matches" : "No leads"}
          body={q ? "Nothing in To Quote matches that search." : "Anything you still need to go look at goes here."}
          action={!q && !adding ? <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus size={15} /> Add a lead</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((l) => {
            const age = daysSince(l.created_at);
            const seen = visitByJob[l.id];
            return (
              <Card key={l.id} className={cn("flex flex-col border-l-4 px-4 py-3", seen ? "border-l-emerald-400" : "border-l-neutral-600")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-semibold text-white">
                      {l.priority ? <Star size={14} className="shrink-0 fill-amber-300 text-amber-300" /> : null}
                      <span className="truncate">{l.job_name || l.customer}</span>
                    </div>
                    <div className="truncate text-sm text-neutral-400">{[l.customer, l.location, l.job].filter(Boolean).join(" · ") || "—"}</div>
                    {l.contact_name || l.contact_phone ? (
                      <div className="mt-0.5 truncate text-xs text-neutral-400">{[l.contact_name, l.contact_phone].filter(Boolean).join(" · ")}</div>
                    ) : null}
                    {l.notes ? <div className="mt-1 whitespace-pre-wrap text-xs text-neutral-400">{l.notes}</div> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => togglePriority(l)} aria-label="Priority">
                      <Star size={18} className={l.priority ? "fill-amber-300 text-amber-300" : "text-neutral-500"} />
                    </Button>
                    <Badge variant={seen ? "success" : "default"}>{seen ? "Walked" : "Go see"}</Badge>
                  </div>
                </div>

                <div className="mt-1.5 text-xs text-neutral-400">
                  {seen ? `Visited ${fmtDate(seen)}` : age == null ? "" : age === 0 ? "Added today" : `Waiting ${age} day${age === 1 ? "" : "s"}`}
                </div>

                <div className="mt-auto pt-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    {l.location ? (
                      <Button asChild variant="outline" size="sm" className="h-10"><a href={`https://maps.google.com/?q=${encodeURIComponent(l.location)}`} target="_blank" rel="noreferrer"><MapPin size={14} /> Map</a></Button>
                    ) : <span />}
                    {l.contact_phone ? (
                      <Button asChild variant="outline" size="sm" className="h-10"><a href={`tel:${String(l.contact_phone).replace(/[^0-9+]/g, "")}`}><Phone size={14} /> Call</a></Button>
                    ) : <span />}
                    <Button asChild variant="outline" size="sm" className="h-10"><a href="/visits"><ClipboardCheck size={14} /> Log visit</a></Button>
                  </div>

                  <div className="mt-2 grid grid-cols-4 gap-2">
                    <Button size="sm" className="h-10 px-2" onClick={() => move(l, "awaiting")}><Send size={14} /> Sent</Button>
                    <Button variant="outline" size="sm" className="h-10 px-2" onClick={() => move(l, "booked")}><CalendarCheck size={14} /> Booked</Button>
                    <Button variant="outline" size="sm" className="h-10 px-2" onClick={() => markLost(l)}><Ban size={14} /> Lost</Button>
                    <Button variant="destructive" size="sm" className="h-10 px-2" onClick={() => remove(l)} aria-label="Delete"><Trash2 size={14} /><span className="hidden sm:inline">Delete</span></Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-500">
        To Quote = work that hasn't gone out yet. Log the site visit and the card flips to Walked. Tap Sent once the proposal is out — it moves to Sent and a follow-up task lands on day 3.
      </p>
    </div>
  );
}
