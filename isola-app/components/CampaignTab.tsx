"use client";
import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Contact, LI_STATUSES, EM_STATUSES, SECTORS, genDrafts, scoreLetter, coShort, bldg, isDue } from "@/lib/crm";
import { todayISO } from "@/lib/format";
import { withTimeout, firstError } from "@/lib/load";
import { cn } from "@/lib/utils";
import { PageHeader, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, NativeSelect, Field, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { showError } from "@/components/Toaster";
import { copyText } from "@/components/Dialogs";
import { Copy, ChevronDown, ChevronRight, Clock, Info, Megaphone, Search, X } from "lucide-react";

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
const statusVariant = (s: string) => (RESP.includes(s) ? "success" : s === "Not Contacted" ? "muted" : s === "Not Interested" ? "danger" : "default") as "success" | "muted" | "danger" | "default";

function CampaignInner() {
  const supabase = useMemo(() => createClient(), []);
  const params = useSearchParams();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get("c"));
  const [fScore, setFScore] = useState("");
  const [fType, setFType] = useState("");
  const [fDue, setFDue] = useState(params.get("due") === "1");
  const [fSector, setFSector] = useState("");
  const [fCompany, setFCompany] = useState("");

  async function load() {
    setErr(null);
    try {
      const res = await withTimeout(supabase.from("contacts").select("*").neq("tier", "Client").neq("prospect_type", "Broker")
        .order("lead_score", { ascending: false }).order("company"));
      const e = firstError(res);
      if (e) throw new Error(e);
      setContacts((res.data as Contact[]) ?? []);
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function patch(c: Contact, fields: any) {
    const { error } = await supabase.from("contacts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) showError("Save failed: " + error.message);
    load();
  }

  const list = contacts ?? [];
  const rows = list.filter((c) => (!fScore || scoreLetter(c.lead_score) === fScore) && (!fType || c.prospect_type === fType) && (!fDue || isDue(c)) && (!fSector || (c.sector ?? "Medical") === fSector) && (!fCompany || coShort(c.company) === fCompany));
  const groups = (() => {
    const m = new Map<string, Contact[]>();
    rows.forEach((c) => {
      const k = coShort(c.company) || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    });
    const out = [...m.entries()];
    out.forEach(([, ps]) => ps.sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0) || a.name.localeCompare(b.name)));
    out.sort((a, b) => Math.max(...b[1].map((c) => c.lead_score ?? 0)) - Math.max(...a[1].map((c) => c.lead_score ?? 0)) || a[0].localeCompare(b[0]));
    return out;
  })();
  const liSent = list.filter((c) => c.li_status !== "Not Contacted").length;
  const connected = list.filter((c) => !["Not Contacted", "Connection Sent", "Not Interested"].includes(c.li_status)).length;
  const liResp = list.filter((c) => RESP.includes(c.li_status)).length;
  const emSent = list.filter((c) => c.em_status !== "Not Contacted").length;
  const emResp = list.filter((c) => RESP.includes(c.em_status)).length;
  const dueN = list.filter(isDue).length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");
  const companyOpts = [...new Set(list.filter((c) => (!fSector || (c.sector ?? "Medical") === fSector) && (!fScore || scoreLetter(c.lead_score) === fScore)).map((c) => coShort(c.company)))].sort();
  const anyFilter = !!(fScore || fType || fDue || fSector || fCompany);
  const clear = () => { setFScore(""); setFType(""); setFDue(false); setFSector(""); setFCompany(""); };

  if (err) return <LoadError message={err} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Campaign"
        sub="Nothing sends itself. Open a prospect, copy the message, send it from your own LinkedIn or Gmail, then set the status here."
        actions={<Button variant={fDue ? "default" : "outline"} onClick={() => setFDue(!fDue)}><Clock size={16} /> Due{dueN ? ` (${dueN})` : ""}</Button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        <Stat label="Prospects" value={contacts ? rows.length : "—"} hint={anyFilter ? "Filtered" : undefined} />
        <Stat label="Connected" value={pct(connected, liSent)} hint={`${connected} of ${liSent} requests`} />
        <Stat label="LinkedIn responses" value={pct(liResp, liSent)} tone={liResp ? "ok" : undefined} hint={`${liResp} replied`} />
        <Stat label="Email responses" value={pct(emResp, emSent)} tone={emResp ? "ok" : undefined} hint={`${emResp} of ${emSent} emailed`} />
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-neutral-400">
        <Info size={16} className="mt-0.5 shrink-0 text-neutral-500" />
        <p>The moment someone responds, stop the sequence — it&apos;s a conversation now.</p>
      </div>

      <div className="mb-4 space-y-2">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <NativeSelect value={fSector} onChange={(e) => { setFSector(e.target.value); setFCompany(""); }} aria-label="Sector">
            <option value="">All sectors</option>
            {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
          </NativeSelect>
          <NativeSelect value={fScore} onChange={(e) => { setFScore(e.target.value); setFCompany(""); }} aria-label="Grade">
            <option value="">All grades</option>
            <option value="A">Grade A</option>
            <option value="B">Grade B</option>
            <option value="C">Grade C</option>
          </NativeSelect>
          <NativeSelect value={fCompany} onChange={(e) => setFCompany(e.target.value)} aria-label="Company">
            <option value="">All companies</option>
            {companyOpts.map((co) => <option key={co} value={co}>{co}</option>)}
          </NativeSelect>
          <NativeSelect value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            {["Property Manager", "Facilities Director", "Owner / Developer", "General Contractor"].map((t) => <option key={t}>{t}</option>)}
          </NativeSelect>
        </div>
        {anyFilter ? (
          <button onClick={clear} className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-white">
            <X size={12} /> Clear filters
          </button>
        ) : null}
      </div>

      {!contacts ? <ListSkeleton /> : groups.length === 0 ? (
        list.length === 0
          ? <Empty icon={<Megaphone size={22} />} title="No prospects in the campaign" body="Add prospects on the Prospects screen and they show up here with drafted messages." />
          : <Empty icon={<Search size={22} />} title="Nothing matches" body="Try different filters." action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
      ) : (
        <div className="space-y-5">
          {groups.map(([co, ps]) => {
            const topGrade = scoreLetter(Math.max(...ps.map((p) => p.lead_score ?? 0)));
            const groupDue = ps.filter(isDue).length;
            return (
              <section key={co}>
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant={topGrade === "A" ? "solid" : "muted"} className="rounded-md">{topGrade}</Badge>
                  <span className="truncate text-[15px] font-semibold text-white">{co}</span>
                  <span className="shrink-0 text-xs text-neutral-500">{ps.length} contact{ps.length === 1 ? "" : "s"}</span>
                  {groupDue ? <Badge variant="warning">{groupDue} due</Badge> : null}
                </div>
                <div className="grid grid-cols-1 items-start gap-2.5 md:grid-cols-2">
                  {ps.map((c) => {
                    const isOpen = openId === c.id;
                    const D = isOpen ? genDrafts(c) : null;
                    return (
                      <Card key={c.id} className={cn(isDue(c) && "border-amber-500/50", isOpen && "md:col-span-2")}>
                        <button className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpenId(isOpen ? null : c.id)} aria-expanded={isOpen}>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-white">{c.name}</div>
                            <div className="truncate text-xs text-neutral-400">{c.title ?? ""}</div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge variant={statusVariant(c.li_status)}>LI: {c.li_status}</Badge>
                            <Badge variant={statusVariant(c.em_status)}>Email: {c.em_status}</Badge>
                          </div>
                          {isOpen ? <ChevronDown size={16} className="shrink-0 text-neutral-500" /> : <ChevronRight size={16} className="shrink-0 text-neutral-500" />}
                        </button>
                        {isOpen && D ? (
                          <div className="space-y-4 border-t border-border px-4 py-4">
                            {c.angle ? <p className="text-xs text-neutral-400"><b className="text-neutral-300">Angle: </b>{c.angle}</p> : null}
                            {bldg(c) ? <p className="text-xs text-neutral-400"><b className="text-neutral-300">Building: </b>{bldg(c)}</p> : null}
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                              <Field label="LinkedIn status">
                                <NativeSelect value={c.li_status} onChange={(e) => patch(c, { li_status: e.target.value, last_touch: e.target.value === "Not Contacted" ? c.last_touch : todayISO() })}>
                                  {LI_STATUSES.map((s) => <option key={s}>{s}</option>)}
                                </NativeSelect>
                              </Field>
                              <Field label="Email status">
                                <NativeSelect value={c.em_status} onChange={(e) => patch(c, { em_status: e.target.value, last_touch: e.target.value === "Not Contacted" ? c.last_touch : todayISO() })}>
                                  {EM_STATUSES.map((s) => <option key={s}>{s}</option>)}
                                </NativeSelect>
                              </Field>
                              <Field label="Last contact">
                                <Input type="date" value={c.last_touch ?? ""} onChange={(e) => patch(c, { last_touch: e.target.value || null })} />
                              </Field>
                              <Field label="Next action due">
                                <Input type="date" className={cn(isDue(c) && "border-amber-500/60")} value={c.next_date ?? ""} onChange={(e) => patch(c, { next_date: e.target.value || null })} />
                              </Field>
                            </div>
                            <div>
                              <Label>Sequence</Label>
                              <ol className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3 md:grid-cols-6">
                                {SEQ.map(([d, w]) => (
                                  <li key={d} className="rounded-lg border border-border bg-white/[0.03] px-2.5 py-2">
                                    <b className="block text-neutral-200">{d}</b>
                                    <span className="text-neutral-400">{w}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              {MSGS.map(([key, title]) => (
                                <div key={key} data-msg>
                                  <div className="mb-1 flex items-center justify-between gap-2">
                                    <Label className="mb-0">{title}</Label>
                                    <Button variant="outline" size="sm" onClick={(e) => {
                                      const box = (e.currentTarget.closest("[data-msg]")?.querySelector("textarea") as HTMLTextAreaElement | null);
                                      copyText(box?.value ?? D[key], "Copied");
                                    }}><Copy size={13} /> Copy</Button>
                                  </div>
                                  <Textarea
                                      rows={key.includes("subj") || key.startsWith("li_conn") ? 2 : 5}
                                      className="min-h-0 text-[13px]"
                                      defaultValue={D[key]}
                                      onBlur={(e) => {
                                        if (e.target.value !== D[key]) patch(c, { drafts: { ...(c.drafts ?? {}), [key]: e.target.value } });
                                      }}
                                  />
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-neutral-500">Drafts are generated from verified CRM data (building, role, company) — edit anything; edits save. Unverifiable details are never included.</p>
                          </div>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CampaignTab() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <CampaignInner />
    </Suspense>
  );
}
