"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Navigation, ChevronLeft, Plus, MapPin, ListChecks, Package, Wrench, Info, Check, AlertTriangle, CalendarDays } from "lucide-react";
import { CheckRow, Empty, H, dayLabel } from "@/components/field/shared";
import { showError, undoable } from "@/components/Toaster";
import { PlanView, LoadOut, Ring, splitPhase, phaseTitle, isHeadsUp, Pill } from "@/components/field/jobkit";
import { cn } from "@/lib/utils";

// v5.4 crew job screen: Plan / Materials / Tools / Info tabs.
// Plan of action grouped by phase with progress; materials & tools as a load-out checklist
// grouped by who brings it. Nothing about price, costs, invoices or Mike's private notes.
type Tab = "plan" | "materials" | "tools" | "info";

export default function FieldJob() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState("");
  const [big, setBig] = useState("");
  const [tab, setTab] = useState<Tab>("plan");

  async function load() {
    const { data, error } = await supabase.rpc("crew_job", { p_job: id });
    if (error) setErr("This job isn't open to the crew right now.");
    else setD(data);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // pick up the other guys' checks
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
  // the pinned Next up bar: check it off right away, give 5 seconds to undo a mis-tap
  function doneWithUndo(k: any) {
    const prev = d.checklist;
    undoable({
      text: "Step done",
      hide: () => setD((x: any) => ({ ...x, checklist: x.checklist.map((c: any) => (c.id === k.id ? { ...c, done: true, done_by: "You", done_at: new Date().toISOString() } : c)) })),
      restore: () => setD((x: any) => ({ ...x, checklist: prev })),
      commit: async () => {
        const { error } = await supabase.rpc("crew_set_checklist", { p_id: k.id, p_done: true });
        if (error) showError("Couldn't save: " + error.message);
        load();
      },
      ms: 5000,
    });
  }
  async function setNeed(kind: "materials" | "tools", nid: string, got: boolean) {
    setD((x: any) => ({ ...x, [kind]: x[kind].map((n: any) => (n.id === nid ? { ...n, got, got_by: got ? "You" : null, got_at: got ? new Date().toISOString() : null } : n)) }));
    const { error } = await supabase.rpc("crew_set_need", { p_id: nid, p_got: got });
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
  if (!d) return <div>{back}<div className="h-40 rounded-2xl skeleton" /><div className="mt-3 h-12 rounded-xl skeleton" /><div className="mt-3 h-64 rounded-2xl skeleton" /></div>;

  const j = d.job;
  const today = new Date().toISOString().slice(0, 10);
  const days = (d.days as any[]).filter((x) => x.date >= today);
  const list: any[] = d.checklist ?? [];
  const done = list.filter((k) => k.done).length;
  const next = list.find((k) => !k.done);
  const mats: any[] = d.materials ?? [], tools: any[] = d.tools ?? [];
  const matsGot = mats.filter((m) => m.got).length, toolsGot = tools.filter((m) => m.got).length;

  const tabs: { v: Tab; label: string; icon: any; badge?: string }[] = [
    { v: "plan", label: "Plan", icon: ListChecks, badge: list.length ? `${done}/${list.length}` : undefined },
    { v: "materials", label: "Materials", icon: Package, badge: mats.length ? `${matsGot}/${mats.length}` : undefined },
    { v: "tools", label: "Tools", icon: Wrench, badge: tools.length ? `${toolsGot}/${tools.length}` : undefined },
    { v: "info", label: "Info", icon: Info },
  ];

  return (
    <div>
      {back}

      {/* Job header */}
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-neutral-900 to-neutral-950 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold leading-tight text-white">{j.job_name}</h1>
            <p className="mt-0.5 text-sm text-neutral-400">{[j.customer, j.work_type].filter(Boolean).join(" · ")}</p>
          </div>
          {list.length ? <Ring value={done / list.length} size={52} stroke={5} /> : null}
        </div>
        {j.location ? <p className="mt-2.5 flex items-start gap-1.5 text-[15px] text-white"><MapPin size={16} className="mt-0.5 shrink-0 text-neutral-400" />{j.location}</p> : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {(d.crew ?? []).map((c: string) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] py-0.5 pl-0.5 pr-2.5 text-[13px] font-semibold text-neutral-200">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-bold text-neutral-900">{c[0]}</span>{c}
            </span>
          ))}
          {days[0] ? <Pill icon={<CalendarDays size={12} />}>{dayLabel(days[0].date)}</Pill> : null}
        </div>
        {j.location ? (
          <a href={`https://maps.google.com/?q=${encodeURIComponent(j.location)}`} target="_blank" rel="noreferrer"
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-white text-neutral-900 min-h-[50px] font-bold"><Navigation size={18} /> Directions</a>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="sticky top-[calc(60px+env(safe-area-inset-top))] z-20 -mx-4 mt-3 bg-black/90 px-4 py-2 backdrop-blur-md">
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/[0.08] bg-neutral-950 p-1">
          {tabs.map((t) => {
            const Icon = t.icon, on = tab === t.v;
            return (
              <button key={t.v} onClick={() => { setTab(t.v); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className={cn("flex flex-col items-center justify-center gap-0.5 rounded-lg min-h-[52px] text-[12px] font-semibold transition-colors",
                  on ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-white")}>
                <Icon size={18} strokeWidth={on ? 2.4 : 2} />
                <span>{t.label}{t.badge ? <span className={cn("ml-1 tabular-nums", on ? "text-neutral-500" : "text-neutral-500")}>{t.badge}</span> : null}</span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === "plan" ? (
        <div className="mt-2">
          {j.crew_notes ? <MikeNote text={j.crew_notes} /> : null}

          {!next && list.length ? (
            <div className="mb-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4 text-center">
              <p className="text-[17px] font-semibold text-emerald-200">Plan complete</p>
              <p className="text-sm text-emerald-100/70">Every step is checked off.</p>
            </div>
          ) : null}

          {list.length ? <PlanView list={list} onToggle={setCheck} /> : <Empty title="No plan yet" sub="Mike hasn't added steps to this job." />}

          <div className="mt-3 flex gap-2">
            <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCheck(); }}
              placeholder="Add a step…"
              className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-neutral-950 px-3.5 min-h-[48px] text-base text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400" />
            <button onClick={addCheck} disabled={!adding.trim()} aria-label="Add"
              className="shrink-0 inline-flex items-center justify-center rounded-xl bg-white text-neutral-900 w-12 min-h-[48px] disabled:opacity-40"><Plus size={20} strokeWidth={2.6} /></button>
          </div>
          {next ? <div className="h-24" aria-hidden /> : null}
          {next ? <NextUpBar step={next} onDone={() => doneWithUndo(next)} /> : null}
        </div>
      ) : null}

      {tab === "materials" ? (
        <div className="mt-2">{mats.length ? <LoadOut rows={mats} me={d.me} kind="material" onToggle={(nid, g) => setNeed("materials", nid, g)} /> : <Empty title="No materials listed" />}</div>
      ) : null}

      {tab === "tools" ? (
        <div className="mt-2">{tools.length ? <LoadOut rows={tools} me={d.me} kind="tool" onToggle={(nid, g) => setNeed("tools", nid, g)} /> : <Empty title="No tools listed" />}</div>
      ) : null}

      {tab === "info" ? (
        <div>
          {j.crew_notes ? (<><H>From Mike</H><MikeNote text={j.crew_notes} /></>) : null}
          {j.scope ? (<><H>The work</H><div className="rounded-2xl border border-white/[0.08] bg-neutral-950 p-4 text-[15px] leading-relaxed text-neutral-200 whitespace-pre-wrap">{j.scope}</div></>) : null}

          <H>Days on the schedule</H>
          {days.length ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-neutral-950 divide-y divide-white/[0.05]">{days.map((x: any, i: number) => (
              <div key={i} className="px-4 py-3">
                <div className="text-[15px] font-semibold text-white">{dayLabel(x.date)}</div>
                {x.assignee ? <div className="text-[13px] text-neutral-400">{x.assignee}</div> : null}
                {x.notes ? <div className="mt-0.5 text-sm text-amber-200/90">{x.notes}</div> : null}
              </div>
            ))}</div>
          ) : <Empty title="No upcoming days" />}

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
        </div>
      ) : null}

      {big ? <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-3 anim-fade" onClick={() => setBig("")}><img src={big} alt="" className="max-h-full max-w-full rounded-lg" /></div> : null}
    </div>
  );
}

// Mike's crew notes: first line big, the rest as easy-to-scan lines; warnings highlighted.
function MikeNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lines = String(text).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const shown = open ? lines : lines.slice(0, 3);
  return (
    <div className="mb-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.05] p-4">
      <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-amber-200/80">From Mike</div>
      <ul className="space-y-2">
        {shown.map((l, i) => {
          const warn = isHeadsUp(l) || /\bdo not\b|don't|\bno fall\b/i.test(l);
          return (
            <li key={i} className={cn("text-[15px] leading-snug", i === 0 ? "font-semibold text-white" : warn ? "font-semibold text-amber-100" : "text-amber-50/90")}>
              {warn && i ? <AlertTriangle size={14} className="mr-1 inline -mt-0.5 text-amber-300" /> : null}{l}
            </li>
          );
        })}
      </ul>
      {lines.length > 3 ? (
        <button onClick={() => setOpen(!open)} className="mt-2.5 text-[13px] font-semibold text-amber-200 underline underline-offset-2 min-h-[32px]">
          {open ? "Show less" : `Show all ${lines.length} notes`}
        </button>
      ) : null}
    </div>
  );
}

// Pinned above the bottom tabs on the Plan tab: the one thing to do next, one thumb to finish it.
function NextUpBar({ step, onDone }: { step: any; onDone: () => void }) {
  const { phase, text } = splitPhase(step.label);
  const warn = isHeadsUp(text);
  return (
    <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-40 px-3 pb-2 anim-sheet">
      <div className={cn("mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border p-3 shadow-2xl shadow-black/60 backdrop-blur-md",
        warn ? "border-amber-300/40 bg-neutral-900/95" : "border-white/20 bg-neutral-900/95")}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
            {warn ? <AlertTriangle size={12} className="text-amber-300" /> : null}
            Next up{phase ? <span className="normal-case tracking-normal font-semibold text-neutral-500">· {phaseTitle(phase)}</span> : null}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-white">{text}</p>
        </div>
        <button onClick={onDone} className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 min-h-[48px] font-bold text-neutral-900">
          <Check size={18} strokeWidth={3} /> Done
        </button>
      </div>
    </div>
  );
}
