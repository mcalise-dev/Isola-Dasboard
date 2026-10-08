"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";

/* Client-facing punch list (no login). The property manager sees each item,
   its photos and status, can add items, and signs off when all are done. */

const longDate = (iso: any) =>
  !iso ? "" : new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const inp =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none";

function Photo({ src, label, tone }: { src: string; label: string; tone: string }) {
  const [big, setBig] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setBig(true)} className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} className="h-20 w-20 rounded-md object-cover border border-neutral-300" />
        <span className={`absolute bottom-1 left-1 rounded px-1 text-[10px] font-bold text-white ${tone}`}>{label}</span>
      </button>
      {big ? (
        <div onClick={() => setBig(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={label} className="max-h-full max-w-full" />
        </div>
      ) : null}
    </>
  );
}

export default function PublicPunch({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [item, setItem] = useState("");
  const [photo, setPhoto] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [armed, setArmed] = useState(false); // two-step sign-off: first tap arms, second tap confirms
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  async function load() {
    const { data } = await supabase.rpc("public_punch", { p_token: token });
    setD(data);
    setLoading(false);
  }
  useEffect(() => {
    try { setName(localStorage.getItem("isola_punch_name") || ""); } catch {}
    load(); /* eslint-disable-next-line */
  }, [token]);

  function rememberName() { try { localStorage.setItem("isola_punch_name", name.trim()); } catch {} }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setMsg("");
    if (!item.trim()) return setErr("Describe what needs fixing.");
    setBusy(true);
    const { data, error } = await supabase.rpc("public_punch_add", { p_token: token, p_item: item, p_name: name, p_photo: photo || null });
    setBusy(false);
    if (error || !(data as any)?.ok) return setErr((data as any)?.error || "Couldn't add that. Please try again.");
    rememberName();
    setItem(""); setPhoto(""); setMsg("Added — it’s on Isola’s list now.");
    load();
  }

  async function signoff() {
    setErr(""); setMsg("");
    if (!name.trim()) return setErr("Type your name to sign off.");
    if (!armed) { setArmed(true); return; }
    setArmed(false);
    setBusy(true);
    const { data, error } = await supabase.rpc("public_punch_signoff", { p_token: token, p_name: name, p_note: note });
    setBusy(false);
    if (error || !(data as any)?.ok) return setErr((data as any)?.error || "Couldn't sign off. Please try again.");
    rememberName();
    load();
  }

  const items: any[] = d?.items ?? [];
  const open = items.filter((x) => !x.done);
  const doneN = items.length - open.length;
  const pct = items.length ? Math.round((doneN / items.length) * 100) : 0;
  const signed = !!d?.signed_off_at;

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <div className="bg-neutral-950 px-5 py-5">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Isola" className="h-10 w-auto" />
          <div>
            <div className="text-sm font-bold tracking-wide text-white">ISOLA EXCAVATION &amp; DESIGN</div>
            <div className="text-xs text-neutral-400">Punch list</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {loading ? <div className="text-sm text-neutral-500">Loading…</div> : !d?.ok ? (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="text-lg font-bold">This link isn't valid.</div>
            <p className="mt-2 text-sm text-neutral-600">Ask Isola for a new one — 508-933-2661.</p>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="text-lg font-bold">{d.job_name || "Project"}</div>
              {d.location ? <div className="text-sm text-neutral-600">{d.location}</div> : null}
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-semibold">{items.length ? `${doneN} of ${items.length} complete` : "No items yet"}</span>
                {signed ? <span className="font-semibold text-emerald-700">Signed off</span> : null}
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-200">
                <div className="h-full bg-emerald-600" style={{ width: `${pct}%` }} />
              </div>
              {signed ? (
                <p className="mt-3 text-sm text-neutral-700">
                  Signed off by <b>{d.signed_off_by}</b> on {longDate(d.signed_off_at)}.{d.signoff_note ? ` “${d.signoff_note}”` : ""}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              {items.map((t) => (
                <div key={t.id} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.done ? "bg-emerald-600 text-white" : "border-2 border-neutral-300"}`}>{t.done ? "✓" : ""}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[15px] ${t.done ? "text-neutral-500 line-through" : "font-semibold"}`}>{t.item}</div>
                      <div className="text-xs text-neutral-500">
                        {t.done ? `Completed ${longDate(t.done_at)}` : "Open"}
                        {t.raised_by ? ` · added by ${t.raised_by}` : ""}
                      </div>
                      {t.photo || t.fixed_photo ? (
                        <div className="mt-2 flex gap-2">
                          {t.photo ? <Photo src={t.photo} label="BEFORE" tone="bg-neutral-800" /> : null}
                          {t.fixed_photo ? <Photo src={t.fixed_photo} label="FIXED" tone="bg-emerald-600" /> : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!signed ? (
              <>
                <form onSubmit={add} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
                  <div className="text-sm font-bold">Add an item</div>
                  <input className={inp} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  <textarea className={inp} rows={2} placeholder="What needs attention?" value={item} onChange={(e) => setItem(e.target.value)} />
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-neutral-400 bg-neutral-50 px-3 py-3">
                    <span className="text-sm font-semibold">{photo ? "Photo attached ✓" : "Add a photo (optional)"}</span>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={async (e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) setPhoto(await compressImage(f)); }} />
                  </label>
                  <button type="submit" disabled={busy} className="w-full rounded-lg bg-neutral-950 px-4 py-3 text-[15px] font-bold text-white disabled:opacity-50">
                    {busy ? "Saving…" : "Add to punch list"}
                  </button>
                </form>

                {items.length > 0 && open.length === 0 ? (
                  <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
                    <div className="text-sm font-bold">Everything's complete — sign off</div>
                    <input className={inp} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                    <input className={inp} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <button onClick={signoff} disabled={busy} className={`w-full rounded-lg px-4 py-3 text-[15px] font-bold text-white disabled:opacity-50 ${armed ? "bg-emerald-900 ring-2 ring-emerald-500" : "bg-emerald-700"}`}>
                      {busy ? "Saving…" : armed ? "Tap again to confirm — all items complete" : "Sign off punch list"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {err ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</div> : null}
            {msg ? <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{msg}</div> : null}
          </>
        )}
        <div className="text-center text-xs text-neutral-500">Questions? Call Isola at 508-933-2661</div>
      </div>
    </div>
  );
}
