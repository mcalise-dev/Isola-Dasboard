"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildSignedPdf, downloadBytes, fileSafe } from "@/lib/signedPdf";

const money = (n: any) =>
  n == null || n === "" ? null : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const longDate = (iso: any) =>
  !iso ? "" : new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const CORE_TERMS: { h: string; b: string }[] = [
  { h: "Payment Terms", b: "33% deposit due upon contract signing. 33% due at project midpoint. Balance due upon substantial completion of work." },
  { h: "Unforeseen Conditions", b: "If conditions are encountered during excavation or demolition that are not visible or known at the time of this proposal — including but not limited to buried debris, undisclosed utilities, subsurface obstructions, or unsuitable soil conditions — additional costs may apply. Isola Excavation & Design will notify the customer and obtain written or verbal approval before proceeding with any additional work." },
  { h: "Proposal Validity", b: "This proposal is valid for 30 days from the date of issue. Pricing is subject to change if work has not commenced within 90 days of signing." },
  { h: "Permits", b: "Permits not included. A building permit may be required for this scope of work. Permit fees and responsibility for filing to be confirmed prior to project start." },
  { h: "Acceptance", b: "By signing below, both parties agree to the scope of work and total price as outlined in this proposal." },
];

const ERRORS: Record<string, string> = {
  expired: "This document has expired. Please contact us for an updated price.",
  name_required: "Please enter your full name.",
  consent_required: "Please check the box agreeing to sign electronically.",
  signature_required: "Please draw your signature in the box.",
  bad_email: "That email address doesn't look right.",
  not_open: "This document is no longer open for signature.",
};

function b64ToBlobUrl(b64: string, mime: string) {
  const s = atob(b64.replace(/^data:[^,]*,/, ""));
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return URL.createObjectURL(new Blob([a], { type: mime }));
}

export default function PublicProposal({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfB64, setPdfB64] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const padRef = useRef<SigPadHandle>(null);

  async function load() {
    const supabase = createClient();
    const { data: d, error } = await supabase.rpc("public_proposal", { p_token: token });
    if (error) setErr(error.message);
    setData(d ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  async function getPdf(): Promise<string | null> {
    if (pdfB64) return pdfB64;
    const supabase = createClient();
    const { data: r } = await supabase.rpc("public_proposal_pdf", { p_token: token });
    if (!r?.ok) return null;
    setPdfB64(r.file_b64);
    setPdfUrl(b64ToBlobUrl(r.file_b64, r.mime_type || "application/pdf"));
    return r.file_b64;
  }

  async function openPdf() {
    setPdfBusy(true);
    // open the tab synchronously so phones don't block it as a popup
    const w = window.open("", "_blank");
    const b64 = await getPdf();
    setPdfBusy(false);
    if (!b64) { w?.close(); setErr("Couldn't load the PDF. Please call 508-933-2661."); return; }
    const url = pdfUrl ?? b64ToBlobUrl(b64, "application/pdf");
    if (w) w.location.href = url; else window.location.href = url;
  }

  async function approve() {
    setErr("");
    if (!name.trim()) { setErr(ERRORS.name_required); return; }
    if (!hasInk) { setErr(ERRORS.signature_required); return; }
    if (!consent) { setErr(ERRORS.consent_required); return; }
    const png = padRef.current?.toPng();
    if (!png) { setErr(ERRORS.signature_required); return; }
    setBusy(true);
    const supabase = createClient();
    const { data: r, error } = await supabase.rpc("public_approve_proposal", {
      p_token: token, p_name: name.trim(), p_signature_png: png, p_email: email.trim() || null, p_consent: consent,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (!r?.ok) { setErr(ERRORS[r?.error] ?? "Could not record your signature. Please call us at 508-933-2661."); return; }
    fetch("/api/push/flush", { method: "POST", keepalive: true }).catch(() => {});
    load();
  }

  async function decline() {
    setBusy(true);
    const supabase = createClient();
    await supabase.rpc("public_decline_proposal", { p_token: token, p_reason: reason });
    setBusy(false);
    setDeclineOpen(false);
    load();
  }

  async function downloadSigned() {
    setDlBusy(true);
    try {
      const b64 = data.has_pdf ? await getPdf() : null;
      const bytes = await buildSignedPdf({
        pdfB64: b64, kind: data.kind, title: data.title, customer: data.customer, location: data.location,
        scope: data.scope, price: data.price, name: data.approved_by, email: data.signer_email,
        signedAt: data.approved_at, ip: data.signer_ip, hash: data.doc_hash, signaturePng: data.signature_png, token,
      });
      downloadBytes(bytes, `${fileSafe(data.title)}_Signed.pdf`);
    } catch (e: any) {
      setErr("Couldn't build the signed copy: " + (e?.message ?? e));
    }
    setDlBusy(false);
  }

  if (loading) return <Shell><p className="text-neutral-500 text-sm">Loading…</p></Shell>;

  if (!data?.ok) return (
    <Shell>
      <h1 className="text-xl font-bold text-neutral-900">Document not found</h1>
      <p className="mt-2 text-sm text-neutral-600">This link isn&apos;t valid. Please check the link or call us at <a className="underline" href="tel:5089332661">508-933-2661</a>.</p>
    </Shell>
  );

  const isCO = data.kind === "change_order";
  const docWord = isCO ? "change order" : "proposal";
  const total = money(data.price);
  const deposit = isCO ? null : (money(data.deposit_amount) ?? (data.price && data.deposit_pct ? money((Number(data.price) * Number(data.deposit_pct)) / 100) : null));
  const approved = data.status === "approved";
  const declined = data.status === "declined";
  const expired = data.status === "expired";
  const open = !approved && !declined && !expired;

  return (
    <Shell>
      {/* letterhead */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Isola" className="h-14 w-14 rounded-full object-cover" />
          <div>
            <div className="text-base font-extrabold tracking-tight text-black leading-tight">ISOLA EXCAVATION &amp; DESIGN</div>
            <div className="text-[11px] text-neutral-600 leading-snug">Providence, RI · Serving RI &amp; MA</div>
            <div className="text-[11px] text-neutral-600 leading-snug">508-933-2661 · mcalise@isola-ri.com</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">{isCO ? "Change Order" : "Proposal"}</div>
          <div className="text-[11px] text-neutral-600 mt-1">{longDate(data.sent_at)}</div>
        </div>
      </div>

      {approved && (
        <Banner tone="ok" title="Signed — thank you.">
          Signed by {data.approved_by} on {longDate(data.approved_at)}.{isCO ? " We'll proceed with the added work." : " We'll be in touch to schedule."}
          {deposit ? <> Your deposit of <strong>{deposit}</strong> holds the date.</> : null}
        </Banner>
      )}
      {declined && <Banner tone="off" title={`${isCO ? "Change order" : "Proposal"} declined`}>Thanks for letting us know. If anything changes, call 508-933-2661.</Banner>}
      {expired && <Banner tone="warn" title="This document has expired">Pricing was valid for 30 days. Call 508-933-2661 and we&apos;ll get you an updated number.</Banner>}

      <div className="mt-6">
        <div className="bg-black text-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]">Project</div>
        <div className="border border-t-0 border-neutral-300 px-3 py-3">
          <div className="text-lg font-bold text-black">{data.title}</div>
          <div className="text-sm text-neutral-700 mt-0.5">
            {[data.customer, data.location].filter(Boolean).join(" · ")}
            {data.job_type ? <span className="text-neutral-500"> · {data.job_type}</span> : null}
          </div>
        </div>
      </div>

      {data.has_pdf ? (
        <button onClick={openPdf} disabled={pdfBusy}
          className="mt-4 w-full flex items-center justify-between border-2 border-black px-4 py-3 text-left disabled:opacity-60">
          <span>
            <span className="block text-sm font-bold text-black">📄 Read the full {docWord}</span>
            <span className="block text-[11px] text-neutral-600">{data.pdf_title || "PDF"} — opens in a new tab</span>
          </span>
          <span className="text-sm font-bold text-black">{pdfBusy ? "…" : "Open →"}</span>
        </button>
      ) : null}

      {data.intro ? <p className="mt-4 text-sm leading-relaxed text-neutral-800 whitespace-pre-wrap">{data.intro}</p> : null}

      {data.scope ? (
        <div className="mt-5">
          <div className="bg-black text-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]">{isCO ? "Change in Work" : "Work Included"}</div>
          <div className="border border-t-0 border-neutral-300">
            {String(data.scope).split("\n").filter((l: string) => l.trim()).map((line: string, i: number) => (
              <div key={i} className={`px-3 py-2 text-sm text-neutral-800 leading-relaxed ${i % 2 ? "bg-neutral-50" : "bg-white"}`}>
                {line.replace(/^[-•*]\s*/, "")}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {total ? (
        <div className="mt-5 bg-black text-white px-4 py-3 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em]">{isCO ? "Change Order Amount" : "Total Contract Price"}</span>
          <span className="text-2xl font-extrabold tabular-nums">{total}</span>
        </div>
      ) : null}
      {deposit && open ? (
        <div className="border border-t-0 border-neutral-300 px-4 py-2 flex items-center justify-between text-sm">
          <span className="text-neutral-600">Deposit to schedule ({data.deposit_pct ?? 33}%)</span>
          <span className="font-bold tabular-nums text-black">{deposit}</span>
        </div>
      ) : null}
      {!isCO ? <p className="mt-2 text-[11px] text-neutral-500">Permits are not included in the price above.</p> : null}

      {/* terms before signing */}
      {!data.has_pdf || data.terms ? (
        <div className="mt-7">
          <div className="bg-black text-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]">Terms</div>
          <div className="border border-t-0 border-neutral-300 px-4 py-3 space-y-3">
            {(data.terms ? [{ h: "", b: String(data.terms) }] : CORE_TERMS).map((t, i) => (
              <div key={i}>
                {t.h ? <div className="text-[11px] font-bold uppercase tracking-wide text-black">{t.h}</div> : null}
                <p className="text-[12px] leading-relaxed text-neutral-700 whitespace-pre-wrap">{t.b}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="mt-7 border-2 border-black">
          <div className="bg-black text-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]">Sign</div>
          <div className="px-4 py-4 space-y-3">
            <p className="text-sm text-neutral-700">
              By signing below, you agree to the scope of work and price in this {docWord}
              {data.has_pdf ? <>, including the full PDF linked above</> : null}.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Full name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="name"
                  className="w-full border border-neutral-400 px-3 py-2 text-base text-black bg-white focus:outline-none focus:border-black" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Email (for your records)</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" autoComplete="email" inputMode="email"
                  className="w-full border border-neutral-400 px-3 py-2 text-base text-black bg-white focus:outline-none focus:border-black" />
              </label>
            </div>

            <div>
              <div className="flex items-end justify-between mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Draw your signature</span>
                <button type="button" onClick={() => { padRef.current?.clear(); setHasInk(false); }} className="text-[11px] text-neutral-600 underline">Clear</button>
              </div>
              <SigPad ref={padRef} onInk={() => setHasInk(true)} />
              <div className="text-[10px] text-neutral-500 mt-1">Use your finger or mouse.</div>
            </div>

            <label className="flex items-start gap-2.5 text-[12px] text-neutral-700 leading-snug">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-black" />
              <span>I have reviewed this {docWord}, I agree to sign it electronically, and I understand my electronic signature is legally binding, the same as signing on paper.</span>
            </label>

            {err ? <p className="text-sm text-red-700">{err}</p> : null}
            <button onClick={approve} disabled={busy}
              className="w-full bg-black text-white py-3 text-sm font-bold uppercase tracking-[0.14em] disabled:opacity-50">
              {busy ? "Recording…" : `Sign & accept ${docWord}`}
            </button>
            {data.pay_url && deposit ? (
              <a href={data.pay_url} target="_blank" rel="noopener noreferrer"
                className="block w-full text-center border-2 border-black py-3 text-sm font-bold uppercase tracking-[0.14em] text-black">
                Pay {deposit} deposit
              </a>
            ) : null}
            {!declineOpen ? (
              <button onClick={() => setDeclineOpen(true)} className="w-full text-xs text-neutral-500 underline pt-1">
                Not moving forward
              </button>
            ) : (
              <div className="border border-neutral-300 p-3 space-y-2">
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Anything we should know? (optional)"
                  className="w-full border border-neutral-300 px-2 py-1.5 text-sm text-black bg-white" />
                <div className="flex gap-2">
                  <button onClick={decline} disabled={busy} className="flex-1 border border-neutral-400 py-2 text-xs font-semibold text-neutral-700">Send</button>
                  <button onClick={() => setDeclineOpen(false)} className="flex-1 py-2 text-xs text-neutral-500">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {approved && data.pay_url && deposit ? (
        <a href={data.pay_url} target="_blank" rel="noopener noreferrer"
          className="mt-6 block w-full text-center bg-black text-white py-3 text-sm font-bold uppercase tracking-[0.14em]">
          Pay {deposit} deposit
        </a>
      ) : null}

      {approved ? (
        <div className="mt-6 border border-neutral-300 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Accepted by</div>
          {data.signature_png
            ? <img src={data.signature_png} alt="Signature" className="mt-1 h-16 w-auto max-w-full object-contain" />
            : <div className="mt-1 text-2xl text-black" style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive" }}>{data.signature}</div>}
          <div className="text-[11px] text-neutral-600 mt-1">
            {data.approved_by} · {data.approved_at ? new Date(data.approved_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }) : ""}
          </div>
          {data.signature_png ? (
            <button onClick={downloadSigned} disabled={dlBusy}
              className="mt-3 w-full border-2 border-black py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-black disabled:opacity-50">
              {dlBusy ? "Preparing…" : "⬇ Download signed copy (PDF)"}
            </button>
          ) : null}
          {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
        </div>
      ) : null}

      <div className="mt-8 border-t border-neutral-300 pt-3 text-center text-[11px] text-neutral-500">
        Questions? Call Mike at <a className="underline" href="tel:5089332661">508-933-2661</a> or email <a className="underline" href="mailto:mcalise@isola-ri.com">mcalise@isola-ri.com</a>
      </div>
    </Shell>
  );
}

/* ---------------- signature pad ---------------- */

type SigPadHandle = { clear: () => void; toPng: () => string | null };

const SigPad = forwardRef<SigPadHandle, { onInk: () => void }>(function SigPad({ onInk }, ref) {
  const cv = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const inked = useRef(false);

  function setup() {
    const c = cv.current; if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#000";
    inked.current = false;
  }
  useEffect(() => {
    setup();
    let w = window.innerWidth;
    const onResize = () => { if (Math.abs(window.innerWidth - w) > 40 && !inked.current) { w = window.innerWidth; setup(); } };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function down(e: React.PointerEvent) {
    e.preventDefault();
    cv.current!.setPointerCapture(e.pointerId);
    drawing.current = true; last.current = pos(e);
    const ctx = cv.current!.getContext("2d")!;
    ctx.beginPath(); ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = "#000"; ctx.fill();
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const p = pos(e); const ctx = cv.current!.getContext("2d")!;
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    const d = Math.hypot(p.x - last.current.x, p.y - last.current.y);
    last.current = p;
    if (d > 0 && !inked.current) { inked.current = true; onInk(); }
  }
  function up() { drawing.current = false; last.current = null; }

  useImperativeHandle(ref, () => ({
    clear() {
      const c = cv.current; if (!c) return;
      c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
      inked.current = false;
    },
    toPng() {
      const c = cv.current; if (!c || !inked.current) return null;
      // crop to the ink so the signature sits cleanly on the certificate
      const ctx = c.getContext("2d")!;
      const { width: W, height: H } = c;
      const px = ctx.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (px[(y * W + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) return null;
      const pad = 12;
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
      const out = document.createElement("canvas");
      // cap size so the stored image stays small
      const scale = Math.min(1, 900 / (x1 - x0 + 1));
      out.width = Math.round((x1 - x0 + 1) * scale); out.height = Math.round((y1 - y0 + 1) * scale);
      out.getContext("2d")!.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, out.width, out.height);
      return out.toDataURL("image/png");
    },
  }));

  return (
    <canvas ref={cv}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
      className="block w-full h-40 border border-neutral-400 bg-white cursor-crosshair"
      style={{ touchAction: "none" }} />
  );
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-200 py-6 px-3 print:bg-white print:py-0">
      <div className="mx-auto max-w-2xl bg-white shadow-xl px-5 py-6 sm:px-8 sm:py-8 print:shadow-none">{children}</div>
    </div>
  );
}

function Banner({ tone, title, children }: { tone: "ok" | "warn" | "off"; title: string; children: React.ReactNode }) {
  const cls = tone === "ok" ? "border-emerald-700 bg-emerald-50 text-emerald-900"
    : tone === "warn" ? "border-amber-700 bg-amber-50 text-amber-900"
    : "border-neutral-500 bg-neutral-100 text-neutral-800";
  return (
    <div className={`mt-5 border-l-4 px-4 py-3 ${cls}`}>
      <div className="text-sm font-bold">{title}</div>
      <div className="text-[12px] mt-0.5 leading-relaxed">{children}</div>
    </div>
  );
}
