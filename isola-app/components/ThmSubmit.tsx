"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* Public page (no login) for Tyler / THM. He picks one of the Isola-held jobs
   THM is on and enters materials he paid for, with a receipt photo.
   Calls security-definer RPCs that check the link token:
     thm_submit_jobs  -> job names only (no money, no customers' contacts)
     thm_submit       -> insert-only; lands as "submitted" on the job's THM lines
   Nothing counts on the THM tab until Mike approves it. */

const inp =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none";
const lbl = "block text-sm font-semibold text-neutral-800 mb-1";

type Job = { id: string; name: string; location: string | null };
type Rcpt = { b64: string; name: string; mime: string } | null;

const todayNY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// Shrink phone photos so receipts upload fast on one bar of signal.
async function readReceipt(file: File): Promise<Rcpt> {
  const raw: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  if (!file.type.startsWith("image/")) return { b64: raw, name: file.name, mime: file.type };
  try {
    const img: HTMLImageElement = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = raw;
    });
    const max = 1400;
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { b64: c.toDataURL("image/jpeg", 0.65), name: file.name, mime: "image/jpeg" };
  } catch {
    return { b64: raw, name: file.name, mime: file.type };
  }
}

export default function ThmSubmit({ token }: { token: string }) {
  const sb = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [dead, setDead] = useState("");
  const [f, setF] = useState({ job: "", what: "", amount: "", vendor: "", date: todayNY(), name: "Tyler" });
  const [rcpt, setRcpt] = useState<Rcpt>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await sb.rpc("thm_submit_jobs", { p_token: token });
      if (error || !(data as any)?.ok) return setDead((data as any)?.error || "This link isn't working. Call Mike at 508-933-2661.");
      const list: Job[] = (data as any).jobs ?? [];
      setJobs(list);
      if (list.length === 1) setF((x) => ({ ...x, job: list[0].id }));
    })();
  }, [sb, token]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const amount = Number(String(f.amount).replace(/[^0-9.]/g, ""));
    if (!f.job) return setErr("Pick the job.");
    if (!f.what.trim()) return setErr("Say what you bought.");
    if (!(amount > 0)) return setErr("Enter what you paid.");
    setBusy(true);
    const { data, error } = await sb.rpc("thm_submit", {
      p_token: token, p_job_id: f.job, p_amount: amount, p_date: f.date || null, p_vendor: f.vendor,
      p_what: f.what, p_receipt_b64: rcpt?.b64 ?? null, p_receipt_mime: rcpt?.mime ?? null, p_name: f.name,
    });
    setBusy(false);
    if (error) return setErr("That didn't go through. Check your signal and try again.");
    if (!(data as any)?.ok) return setErr((data as any)?.error || "That didn't go through.");
    fetch("/api/push/flush", { method: "POST", keepalive: true }).catch(() => {});
    const jobName = jobs?.find((j) => j.id === f.job)?.name ?? "";
    setSent((s) => [`$${amount.toFixed(2)} — ${f.what.trim()} (${jobName})`, ...s]);
    setF({ ...f, what: "", amount: "", vendor: "", date: todayNY() });
    setRcpt(null);
  }

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <div className="bg-neutral-950 px-5 py-5">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Isola" className="h-10 w-auto" />
          <div>
            <div className="text-sm font-bold tracking-wide text-white">ISOLA × THM</div>
            <div className="text-xs text-neutral-400">Materials you paid for on Isola jobs</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        {dead ? (
          <div className="rounded-xl bg-white p-6 shadow-sm text-sm font-semibold text-neutral-700">{dead}</div>
        ) : !jobs ? (
          <div className="rounded-xl bg-white p-6 shadow-sm text-sm text-neutral-500">Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="rounded-xl bg-white p-6 shadow-sm text-sm text-neutral-700">No open jobs to put materials on right now. Call Mike at 508-933-2661.</div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-600">
              Bought something for an Isola job? Put it in here with the receipt. It goes on the THM tab and
              comes off what you owe once Mike checks it.
            </p>

            <div>
              <label className={lbl}>Job *</label>
              <select className={inp} value={f.job} onChange={set("job")}>
                <option value="">Pick the job…</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </div>
            <div><label className={lbl}>What did you buy? *</label>
              <input className={inp} value={f.what} onChange={set("what")} placeholder="e.g. 6 bags concrete, 4in pipe, stone" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Amount paid *</label>
                <input className={inp} inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="$0.00" /></div>
              <div><label className={lbl}>Date</label>
                <input className={inp} type="date" value={f.date} onChange={set("date")} /></div>
            </div>
            <div><label className={lbl}>Where (store)</label>
              <input className={inp} value={f.vendor} onChange={set("vendor")} placeholder="Home Depot, supply yard…" /></div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-neutral-400 bg-neutral-50 px-3 py-3 hover:border-neutral-900">
              <span className="text-sm font-semibold text-neutral-800">📷 Receipt photo</span>
              <span className={`truncate text-xs ${rcpt ? "font-semibold text-emerald-700" : "text-neutral-500"}`}>{rcpt ? "Attached ✓" : "Take or choose a photo"}</span>
              <input type="file" accept="image/*,application/pdf" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]; e.currentTarget.value = "";
                  if (!file) return;
                  if (file.size > 15_000_000) return setErr("That file is too big. Try a photo.");
                  setErr("");
                  setRcpt(await readReceipt(file));
                }} />
            </label>

            <div><label className={lbl}>Your name</label>
              <input className={inp} value={f.name} onChange={set("name")} /></div>

            {err ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</div> : null}

            <button type="submit" disabled={busy} className="w-full rounded-lg bg-neutral-950 px-4 py-3 text-[15px] font-bold text-white hover:bg-neutral-800 disabled:opacity-50">
              {busy ? "Sending…" : "Send to Mike"}
            </button>
          </form>
        )}

        {sent.length ? (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="text-sm font-bold text-emerald-700">✓ Sent — waiting on Mike to approve</div>
            <ul className="mt-2 space-y-1 text-sm text-neutral-700">{sent.map((s, i) => <li key={i}>{s}</li>)}</ul>
            <p className="mt-2 text-xs text-neutral-500">Got another receipt? Fill the form again.</p>
          </div>
        ) : null}

        <div className="text-center text-xs text-neutral-500">Questions? Call Mike at 508-933-2661</div>
      </div>
    </div>
  );
}
