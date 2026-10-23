"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Shell as SLShell, Label as SLLabel, Section as SLSection, Y, HEAD } from "@/components/siteline/ui";
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

  if (loading) return <SLShell><p className="text-[14px] text-[#777]">Loading…</p></SLShell>;

  if (!data?.ok) return (
    <SLShell>
      <h1 className="text-[22px] font-extrabold text-[#111]" style={HEAD}>Document not found</h1>
      <p className="mt-2 text-[14px] text-[#555]">This link isn&apos;t valid. Please check the link or call us at <a className="font-bold text-[#111] underline" href="tel:5089332661">508-933-2661</a>.</p>
    </SLShell>
  );

  const isCO = data.kind === "change_order";
  const docWord = isCO ? "change order" : "proposal";
  const total = money(data.price);
  const deposit = isCO ? null : (money(data.deposit_amount) ?? (data.price && data.deposit_pct ? money((Number(data.price) * Number(data.deposit_pct)) / 100) : null));
  const approved = data.status === "approved";
  const declined = data.status === "declined";
  const expired = data.status === "expired";
  const open = !approved && !declined && !expired;
  const field = "h-12 w-full border border-[#D2D9DE] bg-white px-3.5 text-[16px] text-[#111] placeholder:text-[#AAA] focus:border-[#111] focus:outline-none";

  return (
    <SLShell>
      {data.siteline_token ? (
        <a href={`/site/${data.siteline_token}`} className="mb-4 inline-block text-[12px] font-bold text-[#555] underline decoration-[#CCC] underline-offset-4">← Back to your project</a>
      ) : null}
      <SLLabel className="!text-[9px]">{isCO ? "Change order" : "Proposal"}{data.sent_at ? ` · ${longDate(data.sent_at)}` : ""}</SLLabel>
      <h1 className="mt-3 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-[#111]" style={HEAD}>{data.title}</h1>
      <div className="mt-1 text-[14px] text-[#555]">
        {[data.customer, data.location].filter(Boolean).join(" · ")}
        {data.job_type ? <span className="text-[#888]"> · {data.job_type}</span> : null}
      </div>

      {approved && (
        <Banner tone="ok" title="Signed. Thank you.">
          Signed by {data.approved_by} on {longDate(data.approved_at)}.{isCO ? " We'll proceed with the added work." : " We'll be in touch to schedule."}
          {deposit ? <> Your deposit of <strong>{deposit}</strong> holds the date.</> : null}
        </Banner>
      )}
      {declined && <Banner tone="off" title={`${isCO ? "Change order" : "Proposal"} declined`}>Thanks for letting us know. If anything changes, call 508-933-2661.</Banner>}
      {expired && <Banner tone="warn" title="This document has expired">Pricing was valid for 30 days. Call 508-933-2661 and we&apos;ll get you an updated number.</Banner>}

      {open ? (
        <a href="#sign" className="mt-5 flex items-center justify-between gap-3 px-4 py-3.5 text-[#111]" style={{ background: Y }}>
          <span className="text-[13px] font-extrabold leading-snug">Read it over, then sign at the bottom.</span>
          <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.08em]">Jump to sign ↓</span>
        </a>
      ) : null}

      {total ? (
        <div className="mt-5 flex items-center justify-between bg-[#111] px-4 py-3.5 text-white">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em]">{isCO ? "Change order amount" : "Total contract price"}</span>
          <span className="text-[24px] font-extrabold tabular-nums" style={HEAD}>{total}</span>
        </div>
      ) : null}
      {deposit && open ? (
        <div className="flex items-center justify-between border border-t-0 border-[#E2E2E2] px-4 py-2.5 text-[13px]">
          <span className="text-[#555]">Deposit to schedule ({data.deposit_pct ?? 33}%)</span>
          <span className="font-bold tabular-nums text-[#111]">{deposit}</span>
        </div>
      ) : null}
      {!isCO ? <p className="mt-2 text-[11px] text-[#888]">Permits are not included in the price above.</p> : null}

      {data.has_pdf ? (
        <button onClick={openPdf} disabled={pdfBusy}
          className="mt-4 flex w-full items-center gap-3 border border-[#E2E2E2] bg-white px-3.5 py-3 text-left transition-colors hover:border-[#111] disabled:opacity-60">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center bg-[#F3F3F3]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-[#111]">Read the full {docWord}</span>
            <span className="block text-[12px] text-[#777]">{data.pdf_title || "PDF"}, opens in a new tab</span>
          </span>
          <span className="flex h-9 shrink-0 items-center px-3 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#111]" style={{ background: Y }}>{pdfBusy ? "…" : "Open →"}</span>
        </button>
      ) : null}

      {data.intro ? <p className="mt-5 whitespace-pre-wrap text-[14px] leading-relaxed text-[#333]">{data.intro}</p> : null}

      {data.scope ? (
        <SLSection title={isCO ? "Change in work" : "Work included"}>
          <ul className="space-y-2">
            {String(data.scope).split("\n").filter((l: string) => l.trim()).map((line: string, i: number) => (
              <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-[#333]">
                <span aria-hidden className="mt-[8px] h-1.5 w-1.5 shrink-0" style={{ background: Y }} />
                <span>{line.replace(/^[-•*]\s*/, "")}</span>
              </li>
            ))}
          </ul>
        </SLSection>
      ) : null}

      {!data.has_pdf || data.terms ? (
        <SLSection title="Terms">
          <div className="space-y-3">
            {(data.terms ? [{ h: "", b: String(data.terms) }] : CORE_TERMS).map((t, i) => (
              <div key={i}>
                {t.h ? <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#111]">{t.h}</div> : null}
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#555]">{t.b}</p>
              </div>
            ))}
          </div>
        </SLSection>
      ) : null}

      {open ? (
        <section id="sign" className="mt-7 scroll-mt-4 bg-[#F5F5F5] p-4" style={{ borderTop: `4px solid ${Y}` }}>
          <SLLabel className="!text-[11px] !text-[#111]">Sign the {docWord}</SLLabel>
          <p className="mt-2 text-[13px] leading-relaxed text-[#555]">
            By signing below, you agree to the scope of work and price in this {docWord}
            {data.has_pdf ? <>, including the full PDF linked above</> : null}.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <SLLabel className="mb-1.5">Full name</SLLabel>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="name" className={field} />
            </label>
            <label className="block">
              <SLLabel className="mb-1.5">Email (for your records)</SLLabel>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" autoComplete="email" inputMode="email" className={field} />
            </label>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-end justify-between">
              <SLLabel>Draw your signature</SLLabel>
              <button type="button" onClick={() => { padRef.current?.clear(); setHasInk(false); }} className="text-[12px] font-bold text-[#555] underline">Clear</button>
            </div>
            <SigPad ref={padRef} onInk={() => setHasInk(true)} />
            <div className="mt-1 text-[11px] text-[#888]">Use your finger or mouse.</div>
          </div>

          <label className="mt-4 flex items-start gap-2.5 text-[12.5px] leading-snug text-[#444]">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#111]" />
            <span>I have reviewed this {docWord}, I agree to sign it electronically, and I understand my electronic signature is legally binding, the same as signing on paper.</span>
          </label>

          {err ? <p className="mt-3 text-[13px] text-[#B42318]">{err}</p> : null}
          <button onClick={approve} disabled={busy}
            className="mt-4 flex h-14 w-full items-center justify-center gap-2 bg-[#111] text-[13px] font-extrabold uppercase tracking-[0.1em] text-white disabled:opacity-50">
            {busy ? "Recording…" : <>Sign &amp; accept {docWord} <span aria-hidden style={{ color: Y }}>→</span></>}
          </button>
          {data.pay_url && deposit ? (
            <a href={data.pay_url} target="_blank" rel="noopener noreferrer"
              className="mt-3 flex h-12 w-full items-center justify-center text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#111]" style={{ background: Y }}>
              Pay {deposit} deposit
            </a>
          ) : null}
          {!declineOpen ? (
            <button onClick={() => setDeclineOpen(true)} className="mt-3 w-full text-[12px] text-[#777] underline">Not moving forward</button>
          ) : (
            <div className="mt-3 space-y-2 border border-[#E2E2E2] bg-white p-3">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Anything we should know? (optional)"
                className="w-full border border-[#D2D9DE] px-2.5 py-2 text-[14px] text-[#111] placeholder:text-[#AAA]" />
              <div className="flex gap-2">
                <button onClick={decline} disabled={busy} className="h-10 flex-1 border border-[#111] text-[12px] font-bold text-[#111]">Send</button>
                <button onClick={() => setDeclineOpen(false)} className="h-10 flex-1 text-[12px] text-[#777]">Cancel</button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {approved && data.pay_url && deposit ? (
        <a href={data.pay_url} target="_blank" rel="noopener noreferrer"
          className="mt-6 flex h-12 w-full items-center justify-center text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#111]" style={{ background: Y }}>
          Pay {deposit} deposit
        </a>
      ) : null}

      {approved ? (
        <SLSection title="Accepted by">
          {data.signature_png
            ? <img src={data.signature_png} alt="Signature" className="h-16 w-auto max-w-full object-contain" />
            : <div className="text-2xl text-[#111]" style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive" }}>{data.signature}</div>}
          <div className="mt-1 text-[12px] text-[#666]">
            {data.approved_by} · {data.approved_at ? new Date(data.approved_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }) : ""}
          </div>
          {data.signature_png ? (
            <button onClick={downloadSigned} disabled={dlBusy}
              className="mt-3 flex h-12 w-full items-center justify-center border-2 border-[#111] text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#111] disabled:opacity-50">
              {dlBusy ? "Preparing…" : "Download signed copy (PDF)"}
            </button>
          ) : null}
          {err ? <p className="mt-2 text-[13px] text-[#B42318]">{err}</p> : null}
        </SLSection>
      ) : null}

      {data.siteline_token ? (
        <a href={`/site/${data.siteline_token}`} className="mt-7 block text-center text-[12px] font-bold text-[#777]">← Back to your project</a>
      ) : null}
    </SLShell>
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
      className="block h-40 w-full cursor-crosshair border border-[#D2D9DE] bg-white"
      style={{ touchAction: "none" }} />
  );
});

function Banner({ tone, title, children }: { tone: "ok" | "warn" | "off"; title: string; children: React.ReactNode }) {
  const cls = tone === "ok" ? "border-[#2E7D32] bg-[#EEF7EE] text-[#1B5E20]"
    : tone === "warn" ? "border-[#B26A00] bg-[#FFF6E5] text-[#7A4A00]"
    : "border-[#999] bg-[#F3F3F3] text-[#333]";
  return (
    <div className={`mt-5 border-l-4 px-4 py-3 ${cls}`}>
      <div className="text-[14px] font-bold">{title}</div>
      <div className="mt-0.5 text-[12.5px] leading-relaxed">{children}</div>
    </div>
  );
}
