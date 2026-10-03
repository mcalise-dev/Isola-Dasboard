"use client";
// v4.6 Customers & properties list (Attio-style expandable accounts + a flat properties table).
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, ChevronRight, GitMerge, MapPin, Plus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, PageHeader, Skeleton, Stat } from "@/components/ui/bits";
import { Input, NativeSelect } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  MergeDialog, NewCustomerDialog, PickTwoDialog, StageChip, StageCounts, TYPES,
  digits, invoicesFor, jobDate, jobName, jobPrice, jobsByCustomer, money0, norm,
} from "@/components/customers/shared";

type View = "accounts" | "properties";

export default function CustomersList() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [props, setProps] = useState<any[]>([]);
  const [snap, setSnap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<View>("accounts");
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [pickTwo, setPickTwo] = useState(false);
  const [merging, setMerging] = useState<{ a: any; b: any } | null>(null);
  const [dupsHidden, setDupsHidden] = useState(false);

  async function load() {
    const [c, j, p, m] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase.from("jobs").select("id,job_name,customer,customer_id,property_id,location,job,status,price,price_amount,quoted_date,start_date,completed_date,created_at"),
      supabase.from("properties").select("id,customer_id,label,address,city,state,zip,access_notes"),
      supabase.from("money_snapshot").select("data").eq("id", 1).maybeSingle(),
    ]);
    setRows(c.data ?? []); setJobs(j.data ?? []); setProps(p.data ?? []); setSnap((m.data as any)?.data ?? null);
    setLoading(false);
  }
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("isola:changed", on);
    return () => window.removeEventListener("isola:changed", on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const jobMap = useMemo(() => jobsByCustomer(rows, jobs), [rows, jobs]);
  const jobsFor = (id: string) => jobMap[id] ?? [];
  const propsFor = (id: string) => props.filter((p) => p.customer_id === id);
  const custById = useMemo(() => Object.fromEntries(rows.map((c) => [c.id, c])), [rows]);

  // per-account roll-up
  const stats = useMemo(() => {
    const out: Record<string, { lifetime: number; open: any[]; owed: number; overdue: boolean; last: string; nProps: number }> = {};
    rows.forEach((c) => {
      const js = jobMap[c.id] ?? [];
      const inv = invoicesFor(c, snap);
      out[c.id] = {
        lifetime: js.filter((j) => j.status === "complete").reduce((a, j) => a + jobPrice(j), 0),
        open: js.filter((j) => ["lead", "awaiting", "booked", "progress"].includes(j.status)),
        owed: inv.reduce((a: number, i: any) => a + Number(i.amount ?? 0), 0),
        overdue: inv.some((i: any) => (i.days_overdue ?? 0) > 0),
        last: js.map(jobDate).filter(Boolean).sort().pop() ?? "",
        nProps: props.filter((p) => p.customer_id === c.id).length,
      };
    });
    return out;
  }, [rows, jobMap, snap, props]);

  // likely duplicates: same phone, one name starts the other, or same property address
  const dupes = useMemo(() => {
    const live = rows.filter((c) => !c.archived);
    const out: { a: any; b: any; why: string }[] = [];
    for (let i = 0; i < live.length; i++) for (let k = i + 1; k < live.length; k++) {
      const a = live[i], b = live[k];
      const pa = digits(a.phone), pb = digits(b.phone), na = norm(a.name), nb = norm(b.name);
      let why = "";
      if (pa && pa === pb) why = "same phone number";
      else if (na && nb && (na.startsWith(nb) || nb.startsWith(na))) why = "almost the same name";
      else {
        const aa = props.filter((p) => p.customer_id === a.id).map((p) => norm(p.address));
        const bb = props.filter((p) => p.customer_id === b.id).map((p) => norm(p.address));
        if (aa.some((x) => x && bb.includes(x))) why = "same property address";
      }
      if (why) out.push({ a, b, why });
    }
    return out;
  }, [rows, props]);

  const s = q.trim().toLowerCase();
  const matchFilter = (c: any) => !filter || (filter.startsWith("kind:") ? (c.kind ?? "company") === filter.slice(5) : c.client_type === filter);
  const filtered = rows.filter((c) => {
    if (!showArchived && c.archived) return false;
    if (!matchFilter(c)) return false;
    if (!s) return true;
    const ps = propsFor(c.id);
    return [c.name, c.contact_name, c.phone, c.email, c.address, ...(c.tags ?? []), ...(c.qbo_names ?? []), ...ps.map((p) => p.address), ...ps.map((p) => p.label)]
      .some((v: any) => String(v ?? "").toLowerCase().includes(s));
  });
  const propRows = props
    .filter((p) => { const c = custById[p.customer_id]; return c && (showArchived || !c.archived) && matchFilter(c); })
    .filter((p) => !s || [p.address, p.label, p.city, custById[p.customer_id]?.name].some((v) => String(v ?? "").toLowerCase().includes(s)))
    .map((p) => {
      const js = jobs.filter((j) => j.property_id === p.id);
      return { p, c: custById[p.customer_id], js, last: js.map(jobDate).filter(Boolean).sort().pop() ?? "" };
    })
    .sort((a, b) => (b.last || "").localeCompare(a.last || "") || String(a.p.address).localeCompare(String(b.p.address)));

  const active = rows.filter((c) => !c.archived);
  const totalLifetime = active.reduce((a, c) => a + (stats[c.id]?.lifetime ?? 0), 0);
  const totalOwed = active.reduce((a, c) => a + (stats[c.id]?.owed ?? 0), 0);
  const repeat = active.filter((c) => jobsFor(c.id).length > 1).length;

  const toggle = (id: string) => setExpanded((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const header = (
    <PageHeader
      title="Customers & properties"
      sub={loading ? " " : `${active.length} accounts · ${props.length} properties`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setPickTwo(true)}><GitMerge size={14} /> Merge two</Button>
          <Button onClick={() => setAdding(true)}><Plus size={16} /> Customer</Button>
        </>
      }
    />
  );

  if (loading) {
    return (
      <div>
        {header}
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[74px]" />)}</div>
        <div className="space-y-2" aria-busy="true">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      </div>
    );
  }

  return (
    <div>
      {header}

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Accounts" value={active.length} hint={`${repeat} repeat`} />
        <Stat label="Lifetime revenue" value={money0(totalLifetime)} hint="Completed jobs" />
        <Stat label="Owed" value={money0(totalOwed)} tone={totalOwed ? "warn" : undefined} hint={snap?.as_of ? `QuickBooks as of ${snap.as_of}` : "QuickBooks open invoices"} />
        <Stat label="Properties" value={props.length} />
      </div>

      {dupes.length && !dupsHidden ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3.5 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-amber-300">{dupes.length} possible duplicate{dupes.length === 1 ? "" : "s"}</span>
            <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Hide duplicates" onClick={() => setDupsHidden(true)}><X size={15} /></Button>
          </div>
          <div className="grid gap-1.5 md:grid-cols-2">
            {dupes.map(({ a, b, why }, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{a.name} · {b.name}</div>
                  <div className="text-xs text-neutral-400">{why}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setMerging({ a, b })}>Merge</Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, contact, phone, address, tag…" className="pl-9" />
        </div>
        <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto min-w-[150px]" aria-label="Filter">
          <option value="">All types</option>
          <option value="kind:company">Companies</option>
          <option value="kind:individual">Individuals</option>
          {Object.entries(TYPES).map(([k, v]) => {
            const n = active.filter((c) => c.client_type === k).length;
            return n ? <option key={k} value={k}>{v.label} ({n})</option> : null;
          })}
        </NativeSelect>
        <Segmented<View> value={view} onChange={setView} options={[{ value: "accounts", label: "Accounts" }, { value: "properties", label: "Properties" }]} />
      </div>

      {view === "accounts" ? (
        filtered.length === 0 ? (
          <Empty icon={<Building2 size={22} />} title={rows.length ? "No customers match that" : "No customers yet"}
            body={rows.length ? "Try a different search or filter." : "Add your first customer — jobs, properties and contacts hang off it."}
            action={<Button onClick={() => setAdding(true)}><Plus size={16} /> Customer</Button>} />
        ) : (
          <>
            {/* desktop: expandable rows */}
            <TableWrap className="hidden md:block">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-8" />
                    <TH>Customer</TH>
                    <TH>Type</TH>
                    <TH className="text-right">Properties</TH>
                    <TH>Open jobs</TH>
                    <TH className="text-right">Lifetime</TH>
                    <TH className="text-right">Owed</TH>
                    <TH className="text-right">Last job</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((c) => {
                    const st = stats[c.id];
                    const open = expanded.has(c.id);
                    return (
                      <Fragment key={c.id}>
                        <TR className={cn("cursor-pointer hover:bg-white/[0.03]", open && "bg-white/[0.03]")} onClick={() => toggle(c.id)}>
                          <TD className="pr-0 text-neutral-500">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</TD>
                          <TD className="max-w-[320px]">
                            <Link href={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-semibold text-white hover:underline">{c.name}</Link>
                            <div className="truncate text-xs text-neutral-500">{[c.contact_name, c.phone].filter(Boolean).join(" · ") || "No contact on file"}</div>
                          </TD>
                          <TD>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="muted">{c.kind === "individual" ? "Individual" : "Company"}</Badge>
                              {c.client_type ? <Badge>{TYPES[c.client_type]?.label ?? c.client_type}</Badge> : null}
                              {c.archived ? <Badge variant="danger">Archived</Badge> : null}
                            </div>
                          </TD>
                          <TD className="text-right tabular-nums text-neutral-300">{st.nProps || "—"}</TD>
                          <TD><StageCounts jobs={st.open} /></TD>
                          <TD className="text-right tabular-nums text-neutral-200">{st.lifetime ? money0(st.lifetime) : "—"}</TD>
                          <TD className={cn("text-right tabular-nums", st.overdue ? "text-red-300" : st.owed ? "text-amber-300" : "text-neutral-500")}>{st.owed ? money0(st.owed) : "—"}</TD>
                          <TD className="text-right text-neutral-400">{st.last ? fmtDate(st.last) : "—"}</TD>
                        </TR>
                        {open ? (
                          <tr className="border-b border-border bg-white/[0.02]">
                            <td colSpan={8} className="px-4 pb-4 pt-1">
                              <AccountExpansion c={c} props={propsFor(c.id)} jobs={jobsFor(c.id)} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>

            {/* phone: cards */}
            <div className="space-y-2 md:hidden">
              {filtered.map((c) => {
                const st = stats[c.id];
                return (
                  <Link key={c.id} href={`/customers/${c.id}`} className="block rounded-xl border border-border bg-card px-3.5 py-3 active:bg-white/[0.04]">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-white">{c.name}</div>
                        <div className="truncate text-xs text-neutral-400">{[c.contact_name, c.phone].filter(Boolean).join(" · ") || "No contact on file"}</div>
                      </div>
                      <Badge className="shrink-0">{TYPES[c.client_type]?.label ?? (c.kind === "individual" ? "Individual" : "Company")}</Badge>
                    </div>
                    <div className="mt-2"><StageCounts jobs={st.open} /></div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-neutral-400">
                      <span>{jobsFor(c.id).length} job{jobsFor(c.id).length === 1 ? "" : "s"}</span>
                      {st.nProps ? <span>{st.nProps} propert{st.nProps === 1 ? "y" : "ies"}</span> : null}
                      {st.lifetime ? <span>{money0(st.lifetime)} lifetime</span> : null}
                      {st.owed ? <span className={st.overdue ? "text-red-300" : "text-amber-300"}>{money0(st.owed)} owed</span> : null}
                      {st.last ? <span>Last {fmtDate(st.last)}</span> : null}
                      {c.archived ? <span className="text-red-300">Archived</span> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )
      ) : propRows.length === 0 ? (
        <Empty icon={<MapPin size={22} />} title={props.length ? "No properties match that" : "No properties yet"} body="Properties are added on a customer's record, or automatically when a job gets an address." />
      ) : (
        <>
          <TableWrap className="hidden md:block">
            <Table>
              <THead>
                <TR><TH>Address</TH><TH>City</TH><TH>Customer</TH><TH className="text-right">Jobs</TH><TH className="text-right">Last work</TH></TR>
              </THead>
              <TBody>
                {propRows.map(({ p, c, js, last }) => (
                  <TR key={p.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => router.push(`/customers/${c.id}?p=${p.id}`)}>
                    <TD className="max-w-[340px]">
                      <div className="truncate font-medium text-white">{p.address}</div>
                      {p.label ? <div className="truncate text-xs text-neutral-500">{p.label}</div> : null}
                    </TD>
                    <TD className="text-neutral-300">{[p.city, p.state].filter(Boolean).join(", ") || "—"}</TD>
                    <TD><Link href={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="text-neutral-200 hover:underline">{c.name}</Link></TD>
                    <TD className="text-right tabular-nums text-neutral-300">{js.length || "—"}</TD>
                    <TD className="text-right text-neutral-400">{last ? fmtDate(last) : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          <div className="space-y-2 md:hidden">
            {propRows.map(({ p, c, js, last }) => (
              <Link key={p.id} href={`/customers/${c.id}?p=${p.id}`} className="block rounded-xl border border-border bg-card px-3.5 py-3">
                <div className="truncate font-semibold text-white">{p.label ? `${p.label} — ` : ""}{p.address}</div>
                <div className="truncate text-xs text-neutral-400">{[[p.city, p.state].filter(Boolean).join(", "), c.name].filter(Boolean).join(" · ")}</div>
                <div className="mt-1.5 flex gap-3 text-xs tabular-nums text-neutral-400">
                  <span>{js.length} job{js.length === 1 ? "" : "s"}</span>
                  {last ? <span>Last {fmtDate(last)}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {rows.some((c) => c.archived) ? (
        <button onClick={() => setShowArchived(!showArchived)} className="mt-4 min-h-[44px] text-sm text-neutral-400 underline-offset-4 hover:text-white hover:underline">
          {showArchived ? "Hide" : "Show"} archived ({rows.filter((c) => c.archived).length})
        </button>
      ) : null}

      <NewCustomerDialog open={adding} onOpenChange={setAdding} supabase={supabase} customers={rows} onSaved={(id) => { setAdding(false); router.push(`/customers/${id}`); }} />
      <PickTwoDialog open={pickTwo} onOpenChange={setPickTwo} rows={active} onPick={(a, b) => { setPickTwo(false); setMerging({ a, b }); }} />
      <MergeDialog pair={merging} onOpenChange={(o) => { if (!o) setMerging(null); }} supabase={supabase} jobsFor={jobsFor} propsFor={propsFor} onDone={() => { setMerging(null); load(); }} />
    </div>
  );
}

function AccountExpansion({ c, props, jobs }: { c: any; props: any[]; jobs: any[] }) {
  const loose = jobs.filter((j) => !j.property_id || !props.some((p) => p.id === j.property_id));
  const groups = [
    ...props.map((p) => ({ key: p.id, title: p.label ? `${p.label} — ${p.address}` : p.address, sub: [p.city, p.state].filter(Boolean).join(", "), js: jobs.filter((j) => j.property_id === p.id) })),
    ...(loose.length ? [{ key: "__loose", title: "No property on file", sub: "", js: loose }] : []),
  ];
  if (!groups.length) {
    return <p className="py-2 text-sm text-neutral-500">No properties or jobs yet. <Link href={`/customers/${c.id}`} className="text-neutral-300 underline">Open the record</Link> to add one.</p>;
  }
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {groups.map((g) => (
        <div key={g.key} className="rounded-lg border border-white/[0.06] bg-neutral-950 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <MapPin size={14} className="mt-0.5 shrink-0 text-neutral-500" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{g.title}</div>
              {g.sub ? <div className="text-xs text-neutral-500">{g.sub}</div> : null}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-neutral-500">{g.js.length} job{g.js.length === 1 ? "" : "s"}</span>
          </div>
          {g.js.length ? (
            <ul className="mt-2 space-y-1 pl-5">
              {g.js.slice().sort((a, b) => jobDate(b).localeCompare(jobDate(a))).map((j) => (
                <li key={j.id} className="flex items-center gap-2 text-sm">
                  <Link href={`/jobs/${j.id}`} className="min-w-0 flex-1 truncate text-neutral-200 hover:text-white hover:underline">{jobName(j)}</Link>
                  <StageChip status={j.status} />
                  <span className="w-20 shrink-0 text-right tabular-nums text-neutral-400">{fmtPrice(j.price_amount ?? j.price) || "—"}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
