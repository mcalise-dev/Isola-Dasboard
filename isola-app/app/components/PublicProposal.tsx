"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

export default function PublicProposal({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [sig, setSig] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function load() {
    const supabase = createClient();
    const { data: d, error } = await supabase.rpc("public_proposal", { p_token: token });
    if (error) setErr(error.message);
    setData(d ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  async function approve() {
    setErr("");
    if (!name.trim() || !sig.trim()) { setErr("Please enter your name and type your signature."); return; }
    setBusy(true);
    const supabase = createClient();
    const { data: r, error } = await supabase.rpc("public_approve_proposal", {
      p_token: token, p_name: name.trim(), p_signature: sig.trim(),
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (!r?.ok) { setErr(r?.error === "expired" ? "This proposal has expired. Please contact us for an updated price." : "Could not record approval. Please call us at 508-933-2661."); return; }
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

  if (loading) return <Shell><p className="text-neutral-500 text-sm">Loading…</p></Shell>;

  if (!data?.ok) return (
    <Shell>
      <h1 className="text-xl font-bold text-neutral-900">Proposal not found</h1>
      <p className="mt-2 text-sm text-neutral-600">This link isn&apos;t valid. Please check the link or call us at <a className="underline" href="tel:5089332661">508-933-2661</a>.</p>
    </Shell>
  );

  const total = money(data.price);
  const deposit = money(data.deposit_amount) ?? (data.price && data.deposit_pct ? money((Number(data.price) * Number(data.deposit_pct)) / 100) : null);
  const approved = data.status === "approved";
  const declined = data.status === "declined";
  const expired = data.status === "expired";
  const open = !approved && !declined && !expired;

  return (
    <Shell>
      {/* letterhead */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Isola Excavation & Design" className="h-14 w-14 rounded-full object-cover" />
          <div>
            <div className="text-base font-extrabold tracking-tight text-black leading-tight">ISOLA EXCAVATION &amp; DESIGN</div>
            <div className="text-[11px] text-neutral-600 leading-snug">Providence, RI · Serving RI &amp; MA</div>
            <div className="text-[11px] text-neutral-600 leading-snug">508-933-2661 · mcalise@isola-ri.com · isola-ri.com</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Proposal</div>
          <div className="text-[11px] text-neutral-600 mt-1">{longDate(data.sent_at)}</div>
        </div>
      </div>

      {/* status banner */}
      {approved && (
        <Banner tone="ok" title="Approved — thank you.">
          Signed by {data.approved_by} on {longDate(data.approved_at)}. We&apos;ll be in touch to schedule.
          {deposit ? <> Your deposit of <strong>{deposit}</strong> holds the date.</> : null}
        </Banner>
      )}
      {declined && <Banner tone="off" title="Proposal declined">Thanks for letting us know. If anything changes, call 508-933-2661.</Banner>}
      {expired && <Banner tone="warn" title="This proposal has expired">Pricing was valid for 30 days. Call 508-933-2661 and we&apos;ll get you an updated number.</Banner>}

      {/* project */}
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

      {data.intro ? <p className="mt-4 text-sm leading-relaxed text-neutral-800 whitespace-pre-wrap">{data.intro}</p> : null}

      {/* scope */}
      {data.scope ? (
        <div className="mt-5">
          <div className="bg-black text-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]">Work Included</div>
          <div className="border border-t-0 border-neutral-300">
            {String(data.scope).split("\n").filter((l: string) => l.trim()).map((line: string, i: number) => (
              <div key={i} className={`px-3 py-2 text-sm text-neutral-800 leading-relaxed ${i % 2 ? "bg-neutral-50" : "bg-white"}`}>
                {line.replace(/^[-•*]\s*/, "")}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* total */}
      {total ? (
        <div className="mt-5 bg-black text-white px-4 py-3 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em]">Project Total</span>
          <span className="text-2xl font-extrabold tabular-nums">{total}</span>
        </div>
      ) : null}
      {deposit && open ? (
        <div className="border border-t-0 border-neutral-300 px-4 py-2 flex items-center justify-between text-sm">
          <span className="text-neutral-600">Deposit to schedule ({data.deposit_pct ?? 33}%)</span>
          <span className="font-bold tabular-nums text-black">{deposit}</span>
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-neutral-500">Permits are not included in the price above.</p>

      {/* action */}
      {open ? (
        <div className="mt-7 border-2 border-black">
          <div className="bg-black text-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]">Acceptance</div>
          <div className="px-4 py-4 space-y-3">
            <p className="text-sm text-neutral-700">By signing below, both parties agree to the scope of work and total price as outlined in this proposal.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Your name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name"
                  className="w-full border border-neutral-400 px-3 py-2 text-sm text-black bg-white focus:outline-none focus:border-black" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Type your signature</span>
                <input value={sig} onChange={(e) => setSig(e.target.value)} placeholder="Sign here"
                  style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive" }}
                  className="w-full border border-neutral-400 px-3 py-2 text-lg text-black bg-white focus:outline-none focus:border-black" />
              </label>
            </div>
            {err ? <p className="text-sm text-red-700">{err}</p> : null}
            <button onClick={approve} disabled={busy}
              className="w-full bg-black text-white py-3 text-sm font-bold uppercase tracking-[0.14em] disabled:opacity-50">
              {busy ? "Recording…" : "Approve this proposal"}
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

      {/* terms */}
      <div className="mt-8">
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

      {approved ? (
        <div className="mt-6 border border-neutral-300 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Accepted by</div>
          <div className="mt-1 text-2xl text-black" style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive" }}>{data.signature}</div>
          <div className="text-[11px] text-neutral-600 mt-1">{data.approved_by} · {longDate(data.approved_at)}</div>
        </div>
      ) : null}

      <div className="mt-8 border-t border-neutral-300 pt-3 text-center text-[11px] text-neutral-500">
        Questions? Call Mike at <a className="underline" href="tel:5089332661">508-933-2661</a> or email <a className="underline" href="mailto:mcalise@isola-ri.com">mcalise@isola-ri.com</a>
      </div>
    </Shell>
  );
}

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
