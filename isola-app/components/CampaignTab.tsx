"use client";
import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Contact, LI_STATUSES, EM_STATUSES, SECTORS, genDrafts, scoreLetter, coShort, bldg, isDue } from "@/lib/crm";
import { todayISO } from "@/lib/format";

const RESP = ["Responded", "Conversation"];
const SEQ = [
  ["Day 1", "LinkedIn connection"],
  ["Day 2–3", "Email #1 + one-pager"],
  ["Day 5–7", "LinkedIn msg (if accepted)"],
  ["Day 10–14", "Email follow-up"],
  ["Day 18–21", "LinkedIn follow-up"],
  ["Day 25–30", "Final email"],
];
const MSGS: [string, string][] = [
  ["li_conn", "Day 1 — Connection request"],
  ["em1_subj", "Day 2–3 — Email subject"],
  ["em1", "Day 2–3 — Email #1 (attach one-pager)"],
  ["li_msg", "Day 5–7 — LinkedIn message after accept"],
  ["em2", "Day 10–14 — Email follow-up (case-study angle)"],
  ["li_fu1", "Day 18–21 — LinkedIn follow-up (proof story)"],
  ["em3", "Day 25–30 — Final email (seasonal hook)"],
  ["li_fu2", "Optional — LinkedIn close-out"],
];

function CampaignInner() {
  const supabase = useMemo(() => createClient(), []);
  const params = useSearchParams();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(params.get("c"));
  const [fScore, setFScore] = useState("");
  const [fType, setFType] = useState("");
  const [fDue, setFDue] = useState(params.get("due") === "1");
  const [fSector, setFSector] = useState("");
  const [fCompany, setFCompany] = useState("");

  async function load() {
    const { data } = await supabase.from("contacts").select("*").neq("tier", "Client").neq("prospect_type", "Broker")
      .order("lead_score", { ascending: false }).order("company");
    setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function patch(c: Contact, fields: any) {
    await supabase.from("contacts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", c.id);
    load();
  }

  const rows = contacts.filter((c) => (!fScore || scoreLetter(c.lead_score) === fScore) && (!fType || c.prospect_type === fType) && (!fDue || isDue(c)) && (!fSector || (c.sector ?? "Medical") === fSector) && (!fCompany || coShort(c.company) === fCompany));
  const groups = (() => {
    const m = new Map<string, Contact[]>();
    rows.forEach((c) => {
      const k = coShort(c.company) || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    });
    const list = [...m.entries()];
    list.forEach(([, ps]) => ps.sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0) || a.name.localeCompare(b.name)));
    list.sort((a, b) => Math.max(...b[1].map((c) => c.lead_score ?? 0)) - Math.max(...a[1].map((c) => c.lead_score ?? 0)) || a[0].localeCompare(b[0]));
    return list;
  })();
  const liSent = contacts.filter((c) => c.li_status !== "Not Contacted").length;
  const connected = contacts.filter((c) => !["Not Contacted", "Connection Sent", "Not Interested"].includes(c.li_status)).length;
  const liResp = contacts.filter((c) => RESP.includes(c.li_status)).length;
  const emSent = contacts.filter((c) => c.em_status !== "Not Contacted").length;
  const emResp = contacts.filter((c) => RESP.includes(c.em_status)).length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");

  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-400";

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[[rows.length, "Prospects"], [pct(connected, liSent), `Connected (${connected}/${liSent})`], [pct(liResp, liSent), "LI responses"], [pct(emResp, emSent), "Email responses"]].map(([n, l], i) => (
          <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900 p-2.5 text-center">
            <div className="text-base font-bold text-white leading-none tabular-nums">{n}</div>
            <div className="mt-1 text-[9px] uppercase tracking-wide text-neutral-500">{l}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-500 mb-3 leading-relaxed">
        Nothing sends itself. Open a prospect, copy the message, send it from your own LinkedIn or Gmail, then set the status here.
        The moment someone responds, stop the sequence — it&apos;s a conversation now.
      </p>

      <div className="sticky top-[57px] z-20 -mx-4 px-4 pt-2 pb-2 bg-black/95 backdrop-blur border-b border-neutral-800 mb-3">
      <div className="flex gap-2 mb-2">
        <select className={`${input} flex-1 min-w-0 font-semibold`} value={fSector} onChange={(e) => { setFSector(e.target.value); setFCompany(""); }}>
          <option value="">All sectors</option>
          <option value="Medical">🏥 Medical</option>
          <option value="Commercial">🏢 Commercial</option>
          <option value="Banks">🏦 Banks</option>
        </select>
        <select className={`${input} flex-1 min-w-0 font-semibold`} value={fScore} onChange={(e) => { setFScore(e.target.value); setFCompany(""); }}>
          <option value="">All grades</option>
          <option value="A">Grade A</option>
          <option value="B">Grade B</option>
          <option value="C">Grade C</option>
        </select>
      </div>
      <div className="flex gap-2">
        <select className={`${input} flex-1 min-w-0`} value={fCompany} onChange={(e) => setFCompany(e.target.value)}>
          <option value="">All companies</option>
          {[...new Set(contacts.filter((c) => (!fSector || (c.sector ?? "Medical") === fSector) && (!fScore || scoreLetter(c.lead_score) === fScore)).map((c) => coShort(c.company)))].sort().map((co) => <option key={co} value={co}>{co}</option>)}
        </select>
        <select className={`${input} w-28 shrink-0`} value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">All types</option>
          {["Property Manager", "Facilities Director", "Owner / Developer", "General Contractor"].map((t) => <option key={t}>{t}</option>)}
        </select>
        <button onClick={() => setFDue(!fDue)} className={`shrink-0 rounded-lg border px-3 text-xs font-semibold ${fDue ? "border-amber-400 text-amber-300" : "border-neutral-700 text-neutral-500"}`}>
          Due
        </button>
      </div>
      </div>

      {loading ? <p className="text-neutral-500 text-sm">Loading…</p> : null}

      <div className="space-y-4">
        {groups.map(([co, ps]) => {
          const topGrade = scoreLetter(Math.max(...ps.map((p) => p.lead_score ?? 0)));
          const dueN = ps.filter(isDue).length;
          return (
            <div key={co}>
              <div className="flex items-center gap-2 pb-1.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${topGrade === "A" ? "bg-white text-neutral-900 border-white" : "border-neutral-600 text-neutral-300"}`}>{topGrade}</span>
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-400 truncate">{co}</span>
                <span className="text-[10px] text-neutral-600">{ps.length} contact{ps.length === 1 ? "" : "s"}</span>
                {dueN ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">{dueN} due</span> : null}
              </div>
              <div className="space-y-2">
                {ps.map((c) => {
                  const isOpen = openId === c.id;
                  const D = isOpen ? genDrafts(c) : null;
                  return (
                    <div key={c.id} className={`rounded-xl border bg-neutral-900 ${isDue(c) ? "border-amber-500/50" : "border-neutral-800"}`}>
                      <button className="w-full text-left px-4 py-3" onClick={() => setOpenId(isOpen ? null : c.id)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate">{c.name}</div>
                            <div className="text-xs text-neutral-500 truncate">{c.title ?? ""}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0 text-[10px]">
                            <span className={`px-2 py-0.5 rounded-full border ${RESP.includes(c.li_status) ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : c.li_status === "Not Contacted" ? "border-neutral-700 text-neutral-500" : "border-neutral-600 text-neutral-300"}`}>LI: {c.li_status}</span>
                            <span className={`px-2 py-0.5 rounded-full border ${RESP.includes(c.em_status) ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : c.em_status === "Not Contacted" ? "border-neutral-700 text-neutral-500" : "border-neutral-600 text-neutral-300"}`}>Email: {c.em_status}</span>
                          </div>
                        </div>
                      </button>
                      {isOpen ? (
                        <div className="border-t border-neutral-800 px-4 py-3 space-y-3">
                          {c.angle ? <p className="text-xs text-neutral-400"><b className="text-neutral-500 uppercase">Angle: </b>{c.angle}</p> : null}
                          {bldg(c) ? <p className="text-xs text-neutral-400"><b className="text-neutral-500 uppercase">Building: </b>{bldg(c)}</p> : null}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">LinkedIn status</label>
                              <select className={input} value={c.li_status} onChange={(e) => patch(c, { li_status: e.target.value, last_touch: e.target.value === "Not Contacted" ? c.last_touch : todayISO() })}>
                                {LI_STATUSES.map((s) => <option key={s}>{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Email status</label>
                              <select className={input} value={c.em_status} onChange={(e) => patch(c, { em_status: e.target.value, last_touch: e.target.value === "Not Contacted" ? c.last_touch : todayISO() })}>
                                {EM_STATUSES.map((s) => <option key={s}>{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Last contact</label>
                              <input type="date" className={input} value={c.last_touch ?? ""} onChange={(e) => patch(c, { last_touch: e.target.value || null })} />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Next action due</label>
                              <input type="date" className={input} value={c.next_date ?? ""} onChange={(e) => patch(c, { next_date: e.target.value || null })} />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                            {SEQ.map(([d, w]) => (
                              <div key={d} className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5">
                                <b className="block text-neutral-300">{d}</b>
                                <span className="text-neutral-500">{w}</span>
                              </div>
                            ))}
                          </div>
                          {MSGS.map(([key, title]) => (
                            <div key={key}>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{title}</label>
                                <button
                                  onClick={(e) => {
                                    const btn = e.currentTarget;
                                    navigator.clipboard?.writeText(D![key]);
                                    btn.textContent = "Copied";
                                    setTimeout(() => { btn.textContent = "Copy"; }, 1200);
                                  }}
                                  className="rounded border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-300">Copy</button>
                              </div>
                              <textarea
                                rows={key.includes("subj") || key.startsWith("li_conn") ? 2 : 5}
                                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                defaultValue={D![key]}
                                onBlur={(e) => {
                                  if (e.target.value !== D![key]) patch(c, { drafts: { ...(c.drafts ?? {}), [key]: e.target.value } });
                                }}
                              />
                            </div>
                          ))}
                          <p className="text-[10px] text-neutral-600">Drafts are generated from verified CRM data (building, role, company) — edit anything; edits save. Unverifiable details are never included.</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

export default function CampaignTab() {
  return (
    <Suspense fallback={<p className="text-neutral-500 text-sm">Loading…</p>}>
      <CampaignInner />
    </Suspense>
  );
}
