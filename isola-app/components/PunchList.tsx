"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/format";
import { compressImage, openImage } from "@/lib/image";
import { showError, undoable } from "@/components/Toaster";
import Dictate from "@/components/Dictate";
import { ask, copyText } from "@/components/Dialogs";

/* Punch list for one job — what the PM (or Mike) wants fixed before
   final payment. Each item can carry a photo of the problem and a photo
   of the fix. "Share with client" makes a no-login link (/punch/<token>)
   where the PM sees progress, adds items, and signs off once all are done. */

type Item = {
  id: string;
  item: string;
  raised_by: string | null;
  priority: string;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  notes: string | null;
  photo_b64: string | null;
  fixed_photo_b64: string | null;
  added_via: string;
};
type Share = { token: string; viewed_at: string | null; signed_off_by: string | null; signed_off_at: string | null; signoff_note: string | null };

const COLS = "id,item,raised_by,priority,due_date,done,done_at,notes,photo_b64,fixed_photo_b64,added_via,created_at";

export default function PunchList({ jobId }: { jobId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Item[]>([]);
  const [share, setShare] = useState<Share | null>(null);
  const [form, setForm] = useState({ item: "", priority: "normal", due_date: "", raised_by: "", photo: "" });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    const [p, s] = await Promise.all([
      supabase.from("punch_list").select(COLS).eq("job_id", jobId).order("done").order("created_at", { ascending: false }),
      supabase.from("punch_shares").select("token,viewed_at,signed_off_by,signed_off_at,signoff_note").eq("job_id", jobId).maybeSingle(),
    ]);
    setRows((p.data as Item[]) ?? []);
    setShare((s.data as Share) ?? null);
  }
  useEffect(() => { setForm({ item: "", priority: "normal", due_date: "", raised_by: "", photo: "" }); load(); /* eslint-disable-next-line */ }, [jobId]);

  async function add() {
    if (!form.item.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("punch_list").insert({
      job_id: jobId,
      item: form.item.trim(),
      priority: form.priority,
      due_date: form.due_date || null,
      raised_by: form.raised_by.trim() || null,
      photo_b64: form.photo || null,
    });
    setBusy(false);
    if (error) { showError("Save failed: " + error.message); return; }
    setForm({ item: "", priority: "normal", due_date: "", raised_by: "", photo: "" });
    load();
  }

  async function toggle(t: Item) {
    const done = !t.done;
    setRows(rows.map((x) => (x.id === t.id ? { ...x, done, done_at: done ? new Date().toISOString() : null } : x)));
    const { error } = await supabase.from("punch_list")
      .update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", t.id);
    if (error) { showError("Save failed: " + error.message); load(); }
  }

  async function setPhoto(t: Item, field: "photo_b64" | "fixed_photo_b64", file: File) {
    const b64 = await compressImage(file);
    const patch: any = { [field]: b64 };
    if (field === "fixed_photo_b64" && !t.done) { patch.done = true; patch.done_at = new Date().toISOString(); }
    const { error } = await supabase.from("punch_list").update(patch).eq("id", t.id);
    if (error) { showError("Save failed: " + error.message); return; }
    load();
  }

  function remove(t: Item) {
    undoable({
      text: "Punch item deleted",
      hide: () => setRows((r) => r.filter((x) => x.id !== t.id)),
      restore: () => load(),
      commit: async () => {
        const { error } = await supabase.from("punch_list").delete().eq("id", t.id);
        if (error) { showError("Delete failed: " + error.message); load(); }
      },
    });
  }

  async function shareLink() {
    let s = share;
    if (!s) {
      const { data, error } = await supabase.from("punch_shares").insert({ job_id: jobId }).select("token,viewed_at,signed_off_by,signed_off_at,signoff_note").single();
      if (error) { showError("Couldn't make the link: " + error.message); return; }
      s = data as Share; setShare(s);
    }
    const url = `${window.location.origin}/punch/${s.token}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { await copyText(url, "Link copied"); }
  }

  async function reopenSignoff() {
    if (!(await ask({ title: "Reopen the punch list?", body: "This clears the client's sign-off so they can add more items.", confirm: "Reopen" }))) return;
    await supabase.from("punch_shares").update({ signed_off_by: null, signed_off_at: null, signoff_note: null }).eq("job_id", jobId);
    load();
  }

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const today = new Date().toISOString().slice(0, 10);
  const open = rows.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
  const photoBtn = "cursor-pointer rounded-md border border-neutral-700 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-300 hover:border-neutral-500";

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="text-sm font-semibold text-neutral-300">
          Punch list{open.length ? ` — ${open.length} open` : rows.length ? " — all clear" : ""}
        </div>
        {overdue ? (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/40">{overdue} overdue</span>
        ) : null}
        <button onClick={shareLink} className="ml-auto rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-semibold text-neutral-200 hover:border-neutral-500">
          {copied ? "Link copied ✓" : share ? "Copy client link" : "Share with client"}
        </button>
      </div>

      {share ? (
        <div className="mb-2 text-xs text-neutral-400">
          {share.signed_off_at ? (
            <span className="text-emerald-400 font-semibold">
              Signed off by {share.signed_off_by} on {fmtDate(share.signed_off_at.slice(0, 10))}
              {share.signoff_note ? ` — “${share.signoff_note}”` : ""}
              <button onClick={reopenSignoff} className="ml-2 font-normal text-neutral-500 underline">reopen</button>
            </span>
          ) : share.viewed_at ? `Client opened the link ${fmtDate(share.viewed_at.slice(0, 10))} · not signed off yet` : "Link made · client hasn't opened it yet"}
        </div>
      ) : null}

      {rows.length ? (
        <div className="space-y-1.5 mb-2">
          {rows.map((t) => {
            const late = !t.done && t.due_date && t.due_date < today;
            return (
              <div key={t.id} className={`flex items-start gap-2.5 rounded-xl border bg-neutral-950 px-3 py-2 ${late ? "border-red-500/50" : t.priority === "high" && !t.done ? "border-amber-500/40" : "border-white/[0.08]"}`}>
                <button onClick={() => toggle(t)}
                  className={`shrink-0 mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center text-xs ${t.done ? "bg-emerald-400 border-emerald-400 text-neutral-900" : "border-neutral-600 text-transparent"}`}>✓</button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${t.done ? "text-neutral-400 line-through" : "text-white font-semibold"}`}>
                    {t.priority === "high" && !t.done ? <span className="text-amber-300 mr-1">!</span> : null}{t.item}
                  </div>
                  <div className="text-xs text-neutral-400 flex flex-wrap gap-x-2">
                    {t.added_via === "client" ? <span className="text-sky-300 font-semibold">from client link</span> : null}
                    {t.due_date ? <span className={late ? "text-red-300 font-semibold" : ""}>due {fmtDate(t.due_date)}{late ? " · overdue" : ""}</span> : null}
                    {t.raised_by ? <span>raised by {t.raised_by}</span> : null}
                    {t.done && t.done_at ? <span className="text-emerald-400/80">done {fmtDate(t.done_at.slice(0, 10))}</span> : null}
                  </div>
                  {t.notes ? <div className="text-xs text-neutral-400 mt-0.5">{t.notes}</div> : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {t.photo_b64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.photo_b64} alt="Issue" onClick={() => openImage(t.photo_b64!)} className="h-12 w-12 cursor-pointer rounded-md object-cover border border-neutral-700" />
                    ) : (
                      <label className={photoBtn}>+ Issue photo
                        <input type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) setPhoto(t, "photo_b64", f); }} />
                      </label>
                    )}
                    {t.fixed_photo_b64 ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={t.fixed_photo_b64} alt="Fixed" onClick={() => openImage(t.fixed_photo_b64!)} className="h-12 w-12 cursor-pointer rounded-md object-cover border border-emerald-600" />
                        <span className="absolute -bottom-1 -right-1 rounded bg-emerald-500 px-1 text-[9px] font-bold text-neutral-900">FIXED</span>
                      </div>
                    ) : (
                      <label className={photoBtn}>+ Fixed photo
                        <input type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) setPhoto(t, "fixed_photo_b64", f); }} />
                      </label>
                    )}
                  </div>
                </div>
                <button onClick={() => remove(t)} className="shrink-0 text-neutral-500 hover:text-red-400 text-xs">✕</button>
              </div>
            );
          })}
        </div>
      ) : <p className="text-xs text-neutral-500 mb-2">Nothing outstanding on this job.</p>}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
        <input className={input + " min-w-0 flex-1"} placeholder="What needs fixing before this closes out?" value={form.item}
          onChange={(e) => setForm({ ...form, item: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Dictate hasText={!!form.item} onText={(t) => setForm((p) => ({ ...p, item: p.item + t }))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="Raised by (optional)" value={form.raised_by}
            onChange={(e) => setForm({ ...form, raised_by: e.target.value })} />
          <input className={input} type="date" value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </div>
        <div className="flex gap-2">
          {(["normal", "high"] as const).map((lvl) => (
            <button key={lvl} type="button" onClick={() => setForm({ ...form, priority: lvl })}
              className={`flex-1 rounded-lg border py-2 text-xs font-semibold ${form.priority === lvl ? (lvl === "high" ? "border-amber-500/60 text-amber-300 bg-neutral-800" : "border-neutral-300 text-white bg-neutral-800") : "border-neutral-700 text-neutral-400"}`}>
              {lvl === "high" ? "! Priority" : "Normal"}
            </button>
          ))}
          <label className={`shrink-0 cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold ${form.photo ? "border-emerald-600 text-emerald-300" : "border-neutral-700 text-neutral-300"}`}>
            {form.photo ? "Photo ✓" : "Photo"}
            <input type="file" accept="image/*" capture="environment" className="hidden"
              onChange={async (e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) { const b = await compressImage(f); setForm((x) => ({ ...x, photo: b })); } }} />
          </label>
          <button onClick={add} disabled={busy}
            className="shrink-0 rounded-lg bg-white text-neutral-900 px-4 text-xs font-bold disabled:opacity-60">{busy ? "…" : "+ Add"}</button>
        </div>
      </div>
      <p className="text-xs text-neutral-500 mt-1.5">Anything left to fix before this job closes out. Adding a fixed photo checks the item off.</p>
    </div>
  );
}
