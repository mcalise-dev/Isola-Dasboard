"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, jobLabel, parsePrice } from "@/lib/format";

const fmt$ = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function newToken() {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => abc[b % abc.length]).join("");
}

export default function ProposalsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<any[]>([]);
  const [links, setLinks] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [copied, setCopied] = useState("");

  async function load() {
    const { data } = await supabase
      .from("jobs")
      .select("id,job_name,customer,location,job,price,status,proposal_status,quoted_date,scope_of_work,contact_phone,updated_at")
      .neq("proposal_status", "none")
      .not("proposal_status", "is", null)
      .order("quoted_date", { ascending: true });
    setJobs(data ?? []);
    const { data: pl } = await supabase
      .from("proposal_links")
      .select("*")
      .order("created_at", { ascending: false });
    const byJob: Record<string, any> = {};
    (pl ?? []).forEach((l: any) => { if (!byJob[l.job_id]) byJob[l.job_id] = l; });
    setLinks(byJob);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function setProposal(j: any, proposal_status: string) {
    const patch: any = { proposal_status, updated_at: new Date().toISOString() };
    if (proposal_status === "sent" && !j.quoted_date) patch.quoted_date = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("jobs").update(patch).eq("id", j.id);
    if (error) alert("Update failed: " + error.message); else load();
  }

  const linkUrl = (t: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/p/${t}`;

  async function copy(t: string) {
    const url = linkUrl(t);
    try { await navigator.clipboard.writeText(url); } catch { window.prompt("Copy this link:", url); }
    setCopied(t); setTimeout(() => setCopied(""), 2000);
  }

  const daysOut = (j: any) => (j.quoted_date ? Math.floor((Date.now() - new Date(j.quoted_date + "T12:00:00").getTime()) / 86400000) : null);

  const sent = jobs.filter((j) => j.proposal_status === "sent").sort((a, b) => (daysOut(b) ?? -1) - (daysOut(a) ?? -1));
  const signed = jobs.filter((j) => j.proposal_status === "signed" || j.proposal_status === "accepted");
  const declined = jobs.filter((j) => j.proposal_status === "declined");
  const outTotal = sent.reduce((a, j) => a + parsePrice(j.price), 0);
  const expiring = sent.filter((j) => (daysOut(j) ?? 0) > 21 && (daysOut(j) ?? 0) <= 30).length;
  const expired = sent.filter((j) => (daysOut(j) ?? 0) > 30).length;
  const viewedCount = sent.filter((j) => links[j.id] && links[j.id].view_count > 0).length;

  function pill(j: any) {
    const d = daysOut(j);
    if (d == null) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-neutral-700 text-neutral-400">no date</span>;
    if (d > 30) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-red-500/40 bg-red-500/10 text-red-300">expired · {d}d</span>;
    if (d > 21) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">{30 - d}d left</span>;
    if (d > 14) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-200">{d}d out — check in</span>;
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-neutral-700 text-neutral-300">{d}d out</span>;
  }

  function hubRow(j: any) {
    const l = links[j.id];
    if (!l) return (
      <button onClick={() => setEditing({ job: j })}
        className="mt-2 w-full rounded-lg border border-dashed border-neutral-700 py-1.5 text-[11px] font-semibold text-neutral-400 hover:border-neutral-500 hover:text-neutral-200">
        🔗 Create client link
      </button>
    );
    const tone = l.status === "approved" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : l.status === "declined" ? "border-neutral-700 bg-neutral-900 text-neutral-400"
      : l.view_count > 0 ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
      : "border-neutral-700 bg-neutral-900 text-neutral-400";
    const label = l.status === "approved" ? `✍️ Approved by ${l.approved_by ?? "client"}`
      : l.status === "declined" ? "🚫 Declined online"
      : l.view_count > 0 ? `👀 Opened ${l.view_count}×${l.viewed_at ? " · last " + new Date(l.viewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}`
      : "🔗 Link sent — not opened yet";
    return (
      <div className="mt-2 space-y-1.5">
        <div className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${tone}`}>{label}</div>
        <div className="flex gap-1.5">
          <a href={`/p/${l.token}`} target="_blank" rel="noopener noreferrer" className={btn}>View</a>
          <button onClick={() => copy(l.token)} className={btn}>{copied === l.token ? "Copied ✓" : "Copy link"}</button>
          <button onClick={() => setEditing({ job: j, link: l })} className={btn}>Edit</button>
        </div>
      </div>
    );
  }

  function card(j: any, actions: { label: string; to: string }[]) {
    return (
      <div key={j.id} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{jobLabel(j)}</div>
            <div className="text-xs text-neutral-500 mt-0.5">{j.quoted_date ? "sent " + fmtDate(j.quoted_date) : "no send date"}{j.price ? " · " + j.price : ""}</div>
          </div>
          <div className="shrink-0">{j.proposal_status === "sent" ? pill(j) : null}</div>
        </div>
        {hubRow(j)}
        <div className="flex gap-1.5 mt-2">
          {actions.map((a) => (
            <button key={a.to} onClick={() => setProposal(j, a.to)} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-neutral-700 text-neutral-300 hover:border-neutral-500">
              {a.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loading) return <p className="pt-4 text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="pt-2 space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <Tile v={String(sent.length)} l="Out now" />
        <Tile v={fmt$(outTotal)} l="Value out" />
        <Tile v={String(viewedCount)} l="Opened" tone={viewedCount ? "blue" : undefined} />
        <Tile v={String(expiring + expired)} l="Expiring" tone={expiring + expired ? "amber" : undefined} />
      </div>

      {sent.length === 0 ? <p className="text-sm text-neutral-500">Nothing out right now. Mark a job&apos;s proposal &quot;Sent&quot; on the Jobs tab and it shows up here with the 30-day clock running.</p> : (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Out for signature — 30-day validity</div>
          <div className="space-y-1.5">{sent.map((j) => card(j, [{ label: "✍️ Signed", to: "signed" }, { label: "🚫 Declined", to: "declined" }]))}</div>
        </div>
      )}

      {signed.length ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-1.5">✍️ Signed</div>
          <div className="space-y-1.5">{signed.map((j) => card(j, [{ label: "↩︎ Back to sent", to: "sent" }]))}</div>
        </div>
      ) : null}

      {declined.length ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">🚫 Declined</div>
          <div className="space-y-1.5">{declined.map((j) => card(j, [{ label: "↩︎ Back to sent", to: "sent" }]))}</div>
        </div>
      ) : null}

      <p className="text-xs text-neutral-600">Proposals expire 30 days after sending per your standard terms. A client link lets them read the scope, approve it, and sign right on their phone — you see the moment they open it.</p>

      {editing ? <LinkEditor supabase={supabase} job={editing.job} link={editing.link} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} newToken={newToken} /> : null}
    </div>
  );
}

const btn = "px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-neutral-700 text-neutral-300 hover:border-neutral-500";

function Tile({ v, l, tone }: { v: string; l: string; tone?: "amber" | "blue" }) {
  const border = tone === "amber" ? "border-amber-500/50" : tone === "blue" ? "border-blue-500/50" : "border-neutral-800";
  const text = tone === "amber" ? "text-amber-300" : tone === "blue" ? "text-blue-300" : "text-white";
  return (
    <div className={`rounded-xl border ${border} bg-neutral-900 p-2.5 text-center`}>
      <div className={`text-base font-bold leading-none ${text}`}>{v}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">{l}</div>
    </div>
  );
}

function LinkEditor({ supabase, job, link, onClose, onSaved, newToken }: any) {
  const price = link?.price ?? parsePrice(job.price);
  const [f, setF] = useState({
    title: link?.title ?? job.job_name ?? "",
    intro: link?.intro ?? "",
    scope: link?.scope ?? job.scope_of_work ?? "",
    price: String(price || ""),
    deposit_pct: String(link?.deposit_pct ?? 33),
    pay_url: link?.pay_url ?? "",
    expires_at: link?.expires_at ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    const p = Number(f.price) || null;
    const pct = Number(f.deposit_pct) || null;
    const row: any = {
      job_id: job.id,
      title: f.title || null,
      intro: f.intro || null,
      scope: f.scope || null,
      price: p,
      deposit_pct: pct,
      deposit_amount: p && pct ? Math.round(((p * pct) / 100) * 100) / 100 : null,
      pay_url: f.pay_url || null,
      expires_at: f.expires_at || null,
    };
    let error;
    if (link) ({ error } = await supabase.from("proposal_links").update(row).eq("id", link.id));
    else ({ error } = await supabase.from("proposal_links").insert({ ...row, token: newToken() }));
    setBusy(false);
    if (error) alert("Save failed: " + error.message); else onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-4 my-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-white">{link ? "Edit client link" : "Create client link"}</div>
          <button onClick={onClose} className="text-neutral-500 text-lg leading-none">✕</button>
        </div>
        <div className="space-y-2.5">
          <F l="Title"><input value={f.title} onChange={set("title")} className={inp} placeholder="e.g. 148 West River St — Concrete Replacement" /></F>
          <F l="Opening note (optional)"><textarea value={f.intro} onChange={set("intro")} rows={2} className={inp} placeholder="Thanks for having us out. Here's what we'd do…" /></F>
          <F l="Work included — one line per item"><textarea value={f.scope} onChange={set("scope")} rows={6} className={inp} placeholder={"Saw cut and remove existing slab\nBase prep and compaction\nPour 4in 3500psi concrete, broom finish"} /></F>
          <div className="grid grid-cols-3 gap-2">
            <F l="Price"><input value={f.price} onChange={set("price")} inputMode="decimal" className={inp} /></F>
            <F l="Deposit %"><input value={f.deposit_pct} onChange={set("deposit_pct")} inputMode="numeric" className={inp} /></F>
            <F l="Expires"><input type="date" value={f.expires_at} onChange={set("expires_at")} className={inp} /></F>
          </div>
          <F l="Deposit payment link (optional — paste a QuickBooks payment link)">
            <input value={f.pay_url} onChange={set("pay_url")} className={inp} placeholder="https://…" />
          </F>
          <button onClick={save} disabled={busy} className="w-full rounded-xl bg-white text-black py-2.5 text-sm font-bold disabled:opacity-50">
            {busy ? "Saving…" : link ? "Save changes" : "Create link"}
          </button>
          <p className="text-[11px] text-neutral-600">Nothing here shows your costs — the client sees the scope, the total, and the deposit only.</p>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500";
function F({ l, children }: { l: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">{l}</span>{children}</label>;
}
