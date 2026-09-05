"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/format";

type Item = {
  id: string;
  item: string;
  raised_by: string | null;
  priority: string;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  notes: string | null;
};

const COLS = "id,item,raised_by,priority,due_date,done,done_at,notes,created_at";

export default function PunchList({ jobId }: { jobId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Item[]>([]);
  const [form, setForm] = useState({ item: "", priority: "normal", due_date: "", raised_by: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("punch_list").select(COLS)
      .eq("job_id", jobId).order("done").order("created_at", { ascending: false });
    setRows((data as Item[]) ?? []);
  }
  useEffect(() => { setForm({ item: "", priority: "normal", due_date: "", raised_by: "" }); load(); }, [jobId]);

  async function add() {
    if (!form.item.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("punch_list").insert({
      job_id: jobId,
      item: form.item.trim(),
      priority: form.priority,
      due_date: form.due_date || null,
      raised_by: form.raised_by.trim() || null,
    });
    setBusy(false);
    if (error) { alert("Save failed: " + error.message); return; }
    setForm({ item: "", priority: "normal", due_date: "", raised_by: "" });
    load();
  }

  async function toggle(t: Item) {
    const done = !t.done;
    setRows(rows.map((x) => (x.id === t.id ? { ...x, done, done_at: done ? new Date().toISOString() : null } : x)));
    const { error } = await supabase.from("punch_list")
      .update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", t.id);
    if (error) { alert("Save failed: " + error.message); load(); }
  }

  async function remove(t: Item) {
    if (!confirm(`Delete punch item "${t.item}"?`)) return;
    const { error } = await supabase.from("punch_list").delete().eq("id", t.id);
    if (error) { alert("Delete failed: " + error.message); return; }
    load();
  }

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const today = new Date().toISOString().slice(0, 10);
  const open = rows.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due_date && t.due_date < today).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          Punch list{open.length ? ` — ${open.length} open` : rows.length ? " — all clear" : ""}
        </div>
        {overdue ? (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/40">{overdue} overdue</span>
        ) : null}
      </div>

      {rows.length ? (
        <div className="space-y-1.5 mb-2">
          {rows.map((t) => {
            const late = !t.done && t.due_date && t.due_date < today;
            return (
              <div key={t.id} className={`flex items-start gap-2.5 rounded-xl border bg-neutral-950 px-3 py-2 ${late ? "border-red-500/50" : t.priority === "high" && !t.done ? "border-amber-500/40" : "border-neutral-800"}`}>
                <button onClick={() => toggle(t)}
                  className={`shrink-0 mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] ${t.done ? "bg-emerald-400 border-emerald-400 text-neutral-900" : "border-neutral-600 text-transparent"}`}>✓</button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${t.done ? "text-neutral-500 line-through" : "text-white font-semibold"}`}>
                    {t.priority === "high" && !t.done ? <span className="text-amber-300 mr-1">!</span> : null}{t.item}
                  </div>
                  <div className="text-xs text-neutral-500 flex flex-wrap gap-x-2">
                    {t.due_date ? <span className={late ? "text-red-300 font-semibold" : ""}>due {fmtDate(t.due_date)}{late ? " · overdue" : ""}</span> : null}
                    {t.raised_by ? <span>raised by {t.raised_by}</span> : null}
                    {t.done && t.done_at ? <span className="text-emerald-400/80">done {fmtDate(t.done_at.slice(0, 10))}</span> : null}
                  </div>
                  {t.notes ? <div className="text-xs text-neutral-500 mt-0.5">{t.notes}</div> : null}
                </div>
                <button onClick={() => remove(t)} className="shrink-0 text-neutral-600 hover:text-red-400 text-xs">✕</button>
              </div>
            );
          })}
        </div>
      ) : <p className="text-xs text-neutral-600 mb-2">Nothing outstanding on this job.</p>}

      <div className="space-y-2">
        <input className={input} placeholder="What needs fixing before this closes out?" value={form.item}
          onChange={(e) => setForm({ ...form, item: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="Raised by (optional)" value={form.raised_by}
            onChange={(e) => setForm({ ...form, raised_by: e.target.value })} />
          <input className={input} type="date" value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </div>
        <div className="flex gap-2">
          {(["normal", "high"] as const).map((lvl) => (
            <button key={lvl} type="button" onClick={() => setForm({ ...form, priority: lvl })}
              className={`flex-1 rounded-lg border py-2 text-xs font-semibold ${form.priority === lvl ? (lvl === "high" ? "border-amber-500/60 text-amber-300 bg-neutral-800" : "border-neutral-300 text-white bg-neutral-800") : "border-neutral-700 text-neutral-500"}`}>
              {lvl === "high" ? "! Priority" : "Normal"}
            </button>
          ))}
          <button onClick={add} disabled={busy}
            className="shrink-0 rounded-lg bg-white text-neutral-900 px-4 text-xs font-bold disabled:opacity-60">{busy ? "…" : "+ Add"}</button>
        </div>
      </div>
      <p className="text-[10px] text-neutral-600 mt-1.5">Anything left to fix before this job closes out. Overdue items turn red.</p>
    </div>
  );
}
