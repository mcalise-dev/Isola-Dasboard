"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Phone, Navigation, ChevronLeft, Plus } from "lucide-react";
import { CheckRow, Empty, H, dayLabel } from "@/components/field/shared";
import { showError } from "@/components/Toaster";

// Crew view of one job: where, who to call, the scope, crew, materials, tools, shared checklist (who checked what), days, punch list, tasks, photos.
// Nothing about price, costs, invoices or Mike's private notes.
export default function FieldJob() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState("");
  const [big, setBig] = useState("");

  async function load() {
    const { data, error } = await supabase.rpc("crew_job", { p_job: id });
    if (error) setErr("This job isn't open to the crew right now.");
    else setD(data);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // shared checklist: pick up the other guys' checks
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [adding, setAdding] = useState("");
  async function addCheck() {
    const label = adding.trim();
    if (!label) return;
    setAdding("");
    const { error } = await supabase.rpc("crew_add_checklist", { p_job: id, p_label: label });
    if (error) { showError("Couldn't add: " + error.message); setAdding(label); }
    load();
  }

  async function setPunch(pid: string, done: boolean) {
    setD((x: any) => ({ ...x, punch: x.punch.map((p: any) => (p.id === pid ? { ...p, done } : p)) }));
    const { error } = await supabase.rpc("crew_set_punch", { p_id: pid, p_done: done });
    if (error) { showError("Couldn't save: " + error.message); load(); }
  }
  async function setCheck(cid: string, done: boolean) {
    setD((x: any) => ({ ...x, checklist: x.checklist.map((k: any) => (k.id === cid ? { ...k, done, done_by: done ? "You" : null, done_at: done ? new Date().toISOString() : null } : k)) }));
    const { error } = await supabase.rpc("crew_set_checklist", { p_id: cid, p_done: done });
    if (error) showError("Couldn't save: " + error.message);
    load();
  }
  async function setTask(tid: string, done: boolean) {
    setD((x: any) => ({ ...x, tasks: x.tasks.map((p: any) => (p.id === tid ? { ...p, done } : p)) }));
    const { error } = await supabase.rpc("crew_set_task", { p_id: tid, p_done: done });
    if (error) { showError("Couldn't save: " + error.message); load(); }
  }

  const back = <button onClick={() => router.back()} className="inline-flex items-center gap-1 -ml-1 mb-2 text-sm font-semibold text-neutral-300 min-h-[40px]"><ChevronLeft size={18} /> Back</button>;
  if (err) return <div>{back}<Empty title={err} sub="Ask Mike if you need it." /></div>;
  if (!d) return <div>{back}<div className="h-40 rounded-xl bg-neutral-900 animate-pulse" /></div>;

  const j = d.job;
  const tel = String(j.contact_phone ?? "").replace(/[^0-9+]/g, "");
  const today = new Date().toISOString().slice(0, 10);
  const days = (d.days as any[]).filter((x) => x.date >= today);

  return (
    <div>
      {back}
      <h1 className="text-2xl font-bold text-white leading-tight">{j.job_name}</h1>
      <p className="text-sm text-neutral-400">{[j.customer, j.work_type].filter(Boolean).join(" · ")}</p>
      {j.location ? <p className="mt-1 text-base text-white">{j.location}</p> : null}
      {(d.crew ?? []).length ? <p className="mt-1 text-sm text-neutral-400">Crew: <span className="text-neutral-200">{d.crew.join(", ")}</span></p> : null}

      <div className="grid grid-cols-2 gap-2 mt-4">
        {j.location ? <a href={`https://maps.google.com/?q=${encodeURIComponent(j.location)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-neutral-900 min-h-[52px] font-bold"><Navigation size={18} /> Directions</a>
          : <span className="inline-flex items-center justify-center rounded-xl border border-white/[0.08] text-neutral-500 min-h-[52px]">No address</span>}
        {tel.length >= 7 ? <a href={`tel:${tel.slice(0, 11)}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-600 text-white min-h-[52px] font-semibold"><Phone size={18} /> {j.contact_name ? `Call ${String(j.contact_name).split(" ")[0]}` : "Call site"}</a>
          : <span className="inline-flex items-center justify-center rounded-xl border border-white/[0.08] text-neutral-500 min-h-[52px]">No site contact</span>}
      </div>

      {j.crew_notes ? (<><H>From Mike</H><div className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-3.5 text-sm leading-relaxed text-amber-50 whitespace-pre-wrap">{j.crew_notes}</div></>) : null}
      {j.scope ? (<><H>The work</H><div className="rounded-xl bg-white/[0.05] p-3.5 text-sm leading-relaxed text-neutral-200 whitespace-pre-wrap">{j.scope}</div></>) : null}

      <H>Materials</H>
      <NeedList rows={d.materials ?? []} empty="No materials listed" />
      <H>Tools &amp; equipment</H>
      <NeedList rows={d.tools ?? []} empty="No tools listed" />

      <H>Days on the schedule</H>
      {days.length ? (
        <div className="space-y-1.5">{days.map((x: any, i: number) => (
          <div key={i} className="rounded-xl bg-white/[0.05] px-3.5 py-2.5">
            <div className="text-sm font-semibold text-white">{dayLabel(x.date)}{x.assignee ? <span className="font-normal text-neutral-400"> · {x.assignee}</span> : null}</div>
            {x.notes ? <div className="text-sm text-amber-200/90 mt-0.5">{x.notes}</div> : null}
          </div>
        ))}</div>
      ) : <Empty title="No upcoming days" />}

      <H>Checklist{(() => { const all = d.checklist ?? []; const n = all.filter((k: any) => !k.done).length; return all.length ? (n ? ` — ${n} left` : " — all set") : ""; })()}</H>
      <div className="space-y-2">{(d.checklist ?? []).map((k: any) => (
        <CheckRow key={k.id} done={!!k.done} title={k.label}
          sub={k.done && k.done_by ? `✓ ${k.done_by}${k.done_at ? " · " + stamp(k.done_at) : ""}` : k.added_by && k.added_by !== "Mike" ? `added by ${k.added_by}` : undefined}
          onToggle={() => setCheck(k.id, !k.done)} />
      ))}</div>
      <div className="mt-2 flex gap-2">
        <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCheck(); }}
          placeholder="Add to the checklist…"
          className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-neutral-950 px-3.5 min-h-[48px] text-base text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400" />
        <button onClick={addCheck} disabled={!adding.trim()} aria-label="Add"
          className="shrink-0 inline-flex items-center justify-center rounded-xl bg-white text-neutral-900 w-12 min-h-[48px] disabled:opacity-40"><Plus size={20} strokeWidth={2.6} /></button>
      </div>

      <H>Punch list</H>
      {d.punch.length ? <div className="space-y-2">{d.punch.map((p: any) => (
        <CheckRow key={p.id} done={!!p.done} title={p.item} sub={[p.priority, p.due_date ? `due ${p.due_date}` : null, p.notes].filter(Boolean).join(" · ") || undefined} onToggle={() => setPunch(p.id, !p.done)} />
      ))}</div> : <Empty title="Nothing on the punch list" />}

      {d.tasks.length ? (<><H>Tasks from Mike</H><div className="space-y-2">{d.tasks.map((t: any) => (
        <CheckRow key={t.id} done={!!t.done} title={t.title} sub={t.due_date ? `due ${t.due_date}` : undefined} onToggle={() => setTask(t.id, !t.done)} />
      ))}</div></>) : null}

      <H>Photos</H>
      {d.photos.length ? (
        <div className="grid grid-cols-3 gap-1.5">{d.photos.map((p: any) => (
          <button key={p.id} onClick={() => setBig(p.photo)} className="relative">
            <img src={p.photo} alt={p.caption || p.phase || "photo"} className="w-full h-28 object-cover rounded-lg border border-white/[0.08]" />
            {p.phase ? <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-xs font-semibold text-neutral-100">{p.phase}</span> : null}
          </button>
        ))}</div>
      ) : <Empty title="No photos yet" />}

      {big ? <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-3 anim-fade" onClick={() => setBig("")}><img src={big} alt="" className="max-h-full max-w-full rounded-lg" /></div> : null}
    </div>
  );
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function NeedList({ rows, empty }: { rows: any[]; empty: string }) {
  if (!rows.length) return <Empty title={empty} />;
  return (
    <div className="rounded-xl bg-white/[0.05] divide-y divide-white/[0.06]">
      {rows.map((r: any) => (
        <div key={r.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">{r.item}</div>
            {r.notes ? <div className="text-xs text-neutral-400 mt-0.5">{r.notes}</div> : null}
          </div>
          {r.qty ? <div className="shrink-0 text-sm font-semibold text-neutral-200 tabular-nums">{r.qty}</div> : null}
        </div>
      ))}
    </div>
  );
}
