"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* Public page (no login) where a sub or supplier sends Isola their
   COI and/or W-9. Calls the security-definer RPC public.vendor_submit,
   which can only insert — nothing is readable from here. */

const inp =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none";
const lbl = "block text-sm font-semibold text-neutral-800 mb-1";

type F = { b64: string; name: string; mime: string } | null;

async function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function FilePick({ label, file, onPick, onError }: { label: string; file: F; onPick: (f: F) => void; onError: (msg: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-neutral-400 bg-neutral-50 px-3 py-3 hover:border-neutral-900">
      <span className="text-sm font-semibold text-neutral-800">{label}</span>
      <span className={`truncate text-xs ${file ? "text-emerald-700 font-semibold" : "text-neutral-500"}`}>{file ? `${file.name} ✓` : "PDF or photo"}</span>
      <input type="file" accept="image/*,application/pdf" className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]; e.currentTarget.value = "";
          if (!f) return;
          if (f.size > 10_000_000) return onError("That file is over 10 MB. Try a photo or a smaller PDF.");
          onError("");
          onPick({ b64: await readFile(f), name: f.name, mime: f.type });
        }} />
    </label>
  );
}

export default function VendorSubmit() {
  const [v, setV] = useState({ company: "", contact: "", trade: "", phone: "", email: "", address: "", insurer: "", expires: "" });
  const [coi, setCoi] = useState<F>(null);
  const [w9, setW9] = useState<F>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!v.company.trim()) return setErr("Company name is required.");
    if (!coi && !w9) return setErr("Attach your certificate of insurance, your W-9, or both.");
    if (coi && !v.expires) return setErr("Enter the policy expiration date from your certificate.");
    setBusy(true);
    const { data, error } = await createClient().rpc("vendor_submit", {
      p_company: v.company, p_contact: v.contact, p_trade: v.trade, p_phone: v.phone, p_email: v.email, p_address: v.address,
      p_coi_b64: coi?.b64 ?? null, p_coi_name: coi?.name ?? null, p_coi_mime: coi?.mime ?? null,
      p_coi_expires: coi ? v.expires || null : null, p_insurer: v.insurer,
      p_w9_b64: w9?.b64 ?? null, p_w9_name: w9?.name ?? null, p_w9_mime: w9?.mime ?? null,
    });
    setBusy(false);
    if (error) return setErr("Something went wrong sending that. Please try again.");
    if (!(data as any)?.ok) return setErr((data as any)?.error || "Something went wrong.");
    fetch('/api/push/flush', { method: 'POST', keepalive: true }).catch(() => {});
    setDone(true);
  }

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <div className="bg-neutral-950 px-5 py-5">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Isola" className="h-10 w-auto" />
          <div>
            <div className="text-sm font-bold tracking-wide text-white">ISOLA EXCAVATION &amp; DESIGN</div>
            <div className="text-xs text-neutral-400">Vendor &amp; subcontractor documents</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 py-6">
        {done ? (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="text-lg font-bold">Thanks — got it.</div>
            <p className="mt-2 text-sm text-neutral-600">Your documents were sent to Isola. When your insurance renews, come back to this same page and send the new certificate.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-600">
              Before working on an Isola job we need a current certificate of insurance and a W-9 on file.
              Fill in your info and attach them below.
            </p>

            <div className="space-y-3">
              <div><label className={lbl}>Company name *</label><input className={inp} value={v.company} onChange={set("company")} autoComplete="organization" /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className={lbl}>Contact name</label><input className={inp} value={v.contact} onChange={set("contact")} autoComplete="name" /></div>
                <div><label className={lbl}>Trade / what you supply</label><input className={inp} value={v.trade} onChange={set("trade")} /></div>
                <div><label className={lbl}>Phone</label><input className={inp} type="tel" value={v.phone} onChange={set("phone")} autoComplete="tel" /></div>
                <div><label className={lbl}>Email</label><input className={inp} type="email" value={v.email} onChange={set("email")} autoComplete="email" /></div>
              </div>
              <div><label className={lbl}>Mailing address</label><input className={inp} value={v.address} onChange={set("address")} autoComplete="street-address" /></div>
            </div>

            <div className="space-y-3 border-t border-neutral-200 pt-5">
              <div className="text-sm font-bold">Certificate of insurance</div>
              <FilePick label="Attach COI" file={coi} onPick={setCoi} onError={setErr} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className={lbl}>Policy expires{coi ? " *" : ""}</label><input className={inp} type="date" value={v.expires} onChange={set("expires")} /></div>
                <div><label className={lbl}>Insurance company</label><input className={inp} value={v.insurer} onChange={set("insurer")} /></div>
              </div>
            </div>

            <div className="space-y-3 border-t border-neutral-200 pt-5">
              <div className="text-sm font-bold">W-9</div>
              <FilePick label="Attach W-9" file={w9} onPick={setW9} onError={setErr} />
            </div>

            {err ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</div> : null}

            <button type="submit" disabled={busy} className="w-full rounded-lg bg-neutral-950 px-4 py-3 text-[15px] font-bold text-white hover:bg-neutral-800 disabled:opacity-50">
              {busy ? "Sending…" : "Send to Isola"}
            </button>
          </form>
        )}
        <div className="mt-6 text-center text-xs text-neutral-500">Questions? Call 508-933-2661</div>
      </div>
    </div>
  );
}
