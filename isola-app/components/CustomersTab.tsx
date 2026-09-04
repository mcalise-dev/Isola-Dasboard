"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { parsePrice } from "@/lib/format";

const TYPES: Record<string, { label: string; cls: string }> = {
  medical:       { label: "Medical",       cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  property_mgmt: { label: "Property mgmt", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  commercial:    { label: "Commercial",    cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  municipal:     { label: "Municipal",     cls: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  partner:       { label: "Partner",       cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  residential:   { label: "Residential",   cls: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
};
const fmt$ = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const digits = (s: any) => String(s ?? "").replace(/\D/g, "").slice(-10);
const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export default function CustomersTab() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [props, setProps] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [merging, setMerging] = useState<{ a: any; b: any } | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [dupsOpen, setDupsOpen] = useState(true);

  async function load() {
    const [{ data: c }, { data: j }, { data: p }] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase.from("jobs").select("id,customer_id,status,price"),
      supabase.from("properties").select("id,customer_id,address"),
    ]);
    setRows(c ?? []); setJobs(j ?? []); setProps(p ?? []); setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const jobsFor = (id: string) => jobs.filter((j) => j.customer_id === id);
  const propsFor = (id: string) => props.filter((p) => p.customer_id === id);

  // Likely the same person entered twice: same phone, or one name is the start of
  // the other ("Laurie" / "Laurie Nickels"), or the same property address.
  const dupes = useMemo(() => {
    const live = rows.filter((c) => !c.archived);
    const out: { a: any; b: any; why: string }[] = [];
    for (let i = 0; i < live.length; i++) {
      for (let k = i + 1; k < live.length; k++) {
        const a = live[i], b = live[k];
        const pa = digits(a.phone), pb = digits(b.phone);
        const na = norm(a.name), nb = norm(b.name);
        let why = "";
        if (pa && pa === pb) why = "same phone number";
        else if (na && nb && (na.startsWith(nb) || nb.startsWith(na))) why = "almost the same name";
        else {
          const aa = propsFor(a.id).map((p: any) => norm(p.address));
          const bb = propsFor(b.id).map((p: any) => norm(p.address));
          if (aa.some((x) => x && bb.includes(x))) why = "same property address";
        }
        if (why) out.push({ a, b, why });
      }
    }
    return out;
  }, [rows, props]);

  const filtered = rows.filter((c) => {
    if (!showArchived && c.archived) return false;
    if (filter && c.client_type !== filter) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [c.name, c.contact_name, c.phone, c.email, c.address, ...(c.tags ?? [])]
      .some((v: any) => String(v ?? "").toLowerCase().includes(s));
  });

  if (loading) return <p className="pt-4 text-sm text-neutral-500">Loading…</p>;

  const active = rows.filter((c) => !c.archived);
  const totalValue = jobs.reduce((a, j) => a + parsePrice(j.price), 0);
  const repeat = active.filter((c) => jobsFor(c.id).length > 1).length;

  return (
    <div className="pt-2 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Tile v={String(active.length)} l="Customers" />
        <Tile v={String(repeat)} l="Repeat" />
        <Tile v={fmt$(totalValue)} l="Lifetime value" />
      </div>

      {dupes.length && dupsOpen ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3.5 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
              ⚠️ {dupes.length} possible duplicate{dupes.length === 1 ? "" : "s"}
            </div>
            <button onClick={() => setDupsOpen(false)} className="text-[11px] text-neutral-500 underline">hide</button>
          </div>
          <div className="space-y-1.5">
            {dupes.map(({ a, b, why }, i) => (
              <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{a.name} &nbsp;·&nbsp; {b.name}</div>
                  <div className="text-[11px] text-neutral-500">{why}</div>
                </div>
                <button onClick={() => setMerging({ a, b })}
                  className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-amber-500/50 bg-amber-500/10 text-amber-300">
                  Merge
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, contact, phone, tag…"
          className="flex-1 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600" />
        <button onClick={() => setAdding(true)} className="rounded-xl bg-white text-black px-3.5 text-sm font-bold">+ New</button>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        <button onClick={() => setFilter("")}
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${filter === "" ? "border-white bg-neutral-800 text-white" : "border-neutral-700 text-neutral-400"}`}>All</button>
        {Object.entries(TYPES).map(([k, v]) => {
          const n = active.filter((c) => c.client_type === k).length;
          if (!n) return null;
          return (
            <button key={k} onClick={() => setFilter(filter === k ? "" : k)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${filter === k ? v.cls : "border-neutral-700 text-neutral-400"}`}>
              {v.label} {n}
            </button>
          );
        })}
        <button onClick={() => setMergeOpen(true)} className="ml-auto px-2.5 py-1 rounded-full text-[11px] font-bold border border-neutral-700 text-neutral-400 hover:border-neutral-500">
          ⇄ Merge two
        </button>
      </div>

      <div className="space-y-1.5">
        {filtered.map((c) => {
          const js = jobsFor(c.id);
          const val = js.reduce((a, j) => a + parsePrice(j.price), 0);
          const open = js.filter((j) => j.status !== "complete").length;
          const t = TYPES[c.client_type] ?? TYPES.residential;
          const np = propsFor(c.id).length;
          return (
            <Link key={c.id} href={`/customers/${c.id}`}
              className="block rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 hover:border-neutral-600">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {c.name}{c.archived ? <span className="ml-1.5 text-[10px] text-neutral-600">archived</span> : null}
                  </div>
                  <div className="text-xs text-neutral-500 truncate">
                    {[c.contact_name, c.phone].filter(Boolean).join(" · ") || "no contact on file"}
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${t.cls}`}>{t.label}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                <span>{js.length} job{js.length === 1 ? "" : "s"}</span>
                {np ? <span>{np} propert{np === 1 ? "y" : "ies"}</span> : null}
                {val ? <span>{fmt$(val)}</span> : null}
                {open ? <span className="text-amber-400">{open} open</span> : null}
                {(c.tags ?? []).slice(0, 3).map((tag: string) => (
                  <span key={tag} className="px-1.5 py-px rounded-full border border-neutral-800 text-neutral-400">{tag}</span>
                ))}
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 ? <p className="text-sm text-neutral-500 pt-2">No customers match that.</p> : null}
      </div>

      {rows.some((c) => c.archived) ? (
        <button onClick={() => setShowArchived(!showArchived)} className="text-[11px] text-neutral-500 underline">
          {showArchived ? "Hide" : "Show"} archived
        </button>
      ) : null}

      {adding ? <NewCustomer supabase={supabase} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} /> : null}
      {merging ? <MergeModal supabase={supabase} a={merging.a} b={merging.b} jobsFor={jobsFor} propsFor={propsFor}
        onClose={() => setMerging(null)} onDone={() => { setMerging(null); load(); }} /> : null}
      {mergeOpen ? <PickTwo rows={active} onClose={() => setMergeOpen(false)}
        onPick={(a, b) => { setMergeOpen(false); setMerging({ a, b }); }} /> : null}
    </div>
  );
}

function Tile({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-2.5 text-center">
      <div className="text-base font-bold text-white leading-none">{v}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">{l}</div>
    </div>
  );
}

const inp = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500";

function PickTwo({ rows, onClose, onPick }: any) {
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const ra = rows.find((r: any) => r.id === a), rb = rows.find((r: any) => r.id === b);
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-bold text-white mb-3">Merge two customers</div>
        <div className="space-y-2.5">
          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">First</span>
            <select value={a} onChange={(e) => setA(e.target.value)} className={inp}>
              <option value="">Pick a customer…</option>
              {rows.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Second</span>
            <select value={b} onChange={(e) => setB(e.target.value)} className={inp}>
              <option value="">Pick a customer…</option>
              {rows.filter((r: any) => r.id !== a).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <button onClick={() => ra && rb && onPick(ra, rb)} disabled={!ra || !rb}
            className="w-full rounded-xl bg-white text-black py-2.5 text-sm font-bold disabled:opacity-40">Next — choose which to keep</button>
        </div>
      </div>
    </div>
  );
}

function MergeModal({ supabase, a, b, jobsFor, propsFor, onClose, onDone }: any) {
  const [keepId, setKeepId] = useState(
    // default to the record that looks more complete
    (jobsFor(a.id).length + (a.email ? 1 : 0) + (a.address ? 1 : 0) + (a.notes ? 1 : 0)) >=
    (jobsFor(b.id).length + (b.email ? 1 : 0) + (b.address ? 1 : 0) + (b.notes ? 1 : 0)) ? a.id : b.id
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const keep = keepId === a.id ? a : b;
  const dead = keepId === a.id ? b : a;

  async function go() {
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("merge_customers", { p_keep: keep.id, p_dead: dead.id });
    setBusy(false);
    if (error || !data?.ok) { setErr(error?.message ?? data?.error ?? "Merge failed"); return; }
    onDone();
  }

  function card(c: any) {
    const js = jobsFor(c.id), ps = propsFor(c.id);
    const picked = keepId === c.id;
    return (
      <button onClick={() => setKeepId(c.id)}
        className={`w-full text-left rounded-xl border px-3 py-2.5 ${picked ? "border-emerald-500/60 bg-emerald-500/10" : "border-neutral-800 bg-neutral-950"}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-white truncate">{c.name}</div>
          {picked ? <span className="shrink-0 text-[10px] font-bold text-emerald-300">KEEP THIS NAME</span> : null}
        </div>
        <div className="mt-1 space-y-0.5 text-[11px] text-neutral-500">
          <div>{c.contact_name || "—"}{c.phone ? " · " + c.phone : ""}</div>
          {c.email ? <div className="truncate">{c.email}</div> : null}
          {c.address ? <div className="truncate">{c.address}</div> : null}
          <div className="text-neutral-400">{js.length} job{js.length === 1 ? "" : "s"} · {ps.length} propert{ps.length === 1 ? "y" : "ies"}</div>
        </div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 overflow-y-auto p-3" onClick={onClose}>
      <div className="mx-auto max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-4 my-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-bold text-white">Merge into one customer</div>
        <p className="text-[11px] text-neutral-500 mt-0.5 mb-3">Tap the one whose name you want to keep. Jobs, properties, notes and contacts all move onto it — nothing is thrown away.</p>
        <div className="space-y-2">{card(a)}{card(b)}</div>

        <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-[11px] text-neutral-400">
          Keeping <span className="text-white font-semibold">{keep.name}</span>. Everything under{" "}
          <span className="text-white font-semibold">{dead.name}</span> moves across, and &quot;{dead.name}&quot; is kept as a
          QuickBooks alias so invoices under the old name still match.
        </div>

        {err ? <p className="mt-2 text-xs text-red-400">{err}</p> : null}
        <button onClick={go} disabled={busy} className="mt-3 w-full rounded-xl bg-white text-black py-2.5 text-sm font-bold disabled:opacity-50">
          {busy ? "Merging…" : `Merge into ${keep.name}`}
        </button>
        <button onClick={onClose} className="mt-1.5 w-full text-xs text-neutral-500 underline">Cancel</button>
      </div>
    </div>
  );
}

function NewCustomer({ supabase, onClose, onSaved }: any) {
  const [f, setF] = useState({ name: "", kind: "company", contact_name: "", phone: "", email: "", address: "", client_type: "residential" });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    if (!f.name.trim()) { alert("Name is required."); return; }
    setBusy(true);
    const { error } = await supabase.from("customers").insert({ ...f, name: f.name.trim(), client_since: new Date().toISOString().slice(0, 10) });
    setBusy(false);
    if (error) alert(error.message.includes("duplicate") ? "You already have a customer with that name." : "Save failed: " + error.message);
    else onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-white">New customer</div>
          <button onClick={onClose} className="text-neutral-500 text-lg leading-none">✕</button>
        </div>
        <div className="space-y-2.5">
          <input value={f.name} onChange={set("name")} placeholder="Customer / company name" className={inp} />
          <div className="grid grid-cols-2 gap-2">
            <select value={f.kind} onChange={set("kind")} className={inp}><option value="company">Company</option><option value="individual">Individual</option></select>
            <select value={f.client_type} onChange={set("client_type")} className={inp}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <input value={f.contact_name} onChange={set("contact_name")} placeholder="Contact person" className={inp} />
          <div className="grid grid-cols-2 gap-2">
            <input value={f.phone} onChange={set("phone")} placeholder="Phone" inputMode="tel" className={inp} />
            <input value={f.email} onChange={set("email")} placeholder="Email" inputMode="email" className={inp} />
          </div>
          <input value={f.address} onChange={set("address")} placeholder="Billing address" className={inp} />
          <button onClick={save} disabled={busy} className="w-full rounded-xl bg-white text-black py-2.5 text-sm font-bold disabled:opacity-50">
            {busy ? "Saving…" : "Add customer"}
          </button>
          <p className="text-[11px] text-neutral-600">Properties, extra contacts, tags and notes all live on the profile once it exists.</p>
        </div>
      </div>
    </div>
  );
}
