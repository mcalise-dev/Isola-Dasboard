"use client";
// v4.6 Jobs: saved views, table or board, and a side "peek" (Linear) so you can click
// through jobs without leaving the list. The full record is /jobs/<id>.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender, type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { createClient } from "@/lib/supabase/client";
import { STATUS_META, PIPELINE, stageTag, fmtDate, fmtPrice, parsePrice, daysSince, todayISO } from "@/lib/format";
import { undoable, showError } from "@/components/Toaster";
import { editJob } from "@/components/job/JobForm";
import { nextStep } from "@/components/job/JobRecord";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { PageHeader, Empty, KV, Progress, Kbd } from "@/components/ui/bits";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Plus, Search, Table2, Columns3, ArrowUpDown, Briefcase, Star, Phone, Navigation, ArrowRight, ExternalLink } from "lucide-react";

type Ctx = { walked: Set<string>; drafting: Set<string>; scheduled: Set<string>; next: Record<string, any>; spent: Record<string, number> };
const VIEWS = [
  { key: "active", label: "Active" },
  { key: "selling", label: "Selling" },
  { key: "doing", label: "Doing" },
  { key: "attention", label: "Needs attention" },
  { key: "unscheduled", label: "Unscheduled" },
  { key: "toinvoice", label: "To invoice" },
  { key: "priority", label: "Priority" },
  { key: "complete", label: "Complete" },
  { key: "lost", label: "Lost" },
  { key: "all", label: "All" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];
const BAR: Record<string, string> = { lead: "bg-neutral-600", awaiting: "bg-neutral-400", booked: "bg-neutral-200", progress: "bg-white", complete: "bg-emerald-400", lost: "bg-red-400/60" };

const price = (j: any) => Number(j.price_amount) || parsePrice(j.price);

function StageChip({ s }: { s: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", STATUS_META[s]?.cls)}>{STATUS_META[s]?.label ?? s}</span>;
}

export default function JobsScreen() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [ctx, setCtx] = useState<Ctx>({ walked: new Set(), drafting: new Set(), scheduled: new Set(), next: {}, spent: {} });
  const [view, setView] = useState<ViewKey>("active");
  // v4.6.1: tap a stage card (To Quote, Sent, Booked, In Progress, Complete) to see just that stage
  const [stage, setStage] = useState<string | null>(null);
  const [mode, setMode] = useState<"table" | "board">("table");
  const [q, setQ] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [peek, setPeek] = useState<any | null>(null);
  const [isPhone, setIsPhone] = useState(false);

  // old deep links (/?job=<id>) from Money, Today, Tasks… now open the record
  useEffect(() => {
    try { const id = new URLSearchParams(window.location.search).get("job"); if (id) router.replace(`/jobs/${id}`); } catch {}
    // /?stage=progress (from Home's pipeline card) opens just that stage
    try { const st = new URLSearchParams(window.location.search).get("stage"); if (st && STATUS_META[st]) { setStage(st); window.history.replaceState(null, "", "/"); } } catch {}
    try {
      const v = localStorage.getItem("isola.jobs.view") as ViewKey | null; if (v && VIEWS.some((x) => x.key === v)) setView(v);
      const m = localStorage.getItem("isola.jobs.mode"); if (m === "board" || m === "table") setMode(m);
    } catch {}
    const mq = window.matchMedia("(max-width: 767px)");
    const f = () => setIsPhone(mq.matches); f(); mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [router]);
  useEffect(() => { try { localStorage.setItem("isola.jobs.view", view); localStorage.setItem("isola.jobs.mode", mode); } catch {} }, [view, mode]);

  async function load() {
    const [j, c, sv, est, se, ot] = await Promise.all([
      sb.from("jobs").select("*").order("priority", { ascending: false }).order("updated_at", { ascending: false }),
      sb.from("job_costs").select("job_id,amount"),
      sb.from("site_visits").select("job_id"),
      sb.from("estimates").select("job_id,sent_at"),
      sb.from("schedule_entries").select("job_id"),
      sb.from("tasks").select("job_id,title,due_date,created_at").eq("done", false).not("job_id", "is", null),
    ]);
    const next: Record<string, any> = {};
    (ot.data ?? []).forEach((t: any) => { const cur = next[t.job_id]; const k = (x: any) => (x.due_date ? "0" + x.due_date : "1" + x.created_at); if (!cur || k(t) < k(cur)) next[t.job_id] = t; });
    const spent: Record<string, number> = {};
    (c.data ?? []).forEach((r: any) => { if (r.job_id) spent[r.job_id] = (spent[r.job_id] ?? 0) + Number(r.amount ?? 0); });
    setCtx({
      walked: new Set((sv.data ?? []).map((r: any) => r.job_id).filter(Boolean)),
      drafting: new Set((est.data ?? []).filter((r: any) => r.job_id && !r.sent_at).map((r: any) => r.job_id)),
      scheduled: new Set((se.data ?? []).map((r: any) => r.job_id).filter(Boolean)),
      next, spent,
    });
    const list = j.data ?? [];
    setJobs(list);
    setPeek((p: any) => (p ? list.find((x: any) => x.id === p.id) ?? null : null));
  }
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("isola:changed", on);
    return () => window.removeEventListener("isola:changed", on);
    // eslint-disable-next-line
  }, []);

  const today = todayISO();
  const isAttn = (j: any) =>
    (j.status === "complete" && !j.invoiced_date && !j.paid_date) ||
    (j.status === "awaiting" && j.quoted_date && daysSince(j.quoted_date) > 14) ||
    (j.status === "booked" && !j.start_date && !ctx.scheduled.has(j.id)) ||
    (ctx.next[j.id]?.due_date && ctx.next[j.id].due_date < today);
  const inView = (j: any, v: ViewKey) => {
    switch (v) {
      case "active": return !["complete", "lost"].includes(j.status) || (j.status === "complete" && !j.paid_date);
      case "selling": return j.status === "lead" || j.status === "awaiting";
      case "doing": return j.status === "booked" || j.status === "progress";
      case "attention": return isAttn(j);
      case "unscheduled": return j.status === "booked" && !j.start_date && !ctx.scheduled.has(j.id);
      case "toinvoice": return j.status === "complete" && !j.invoiced_date && !j.paid_date;
      case "priority": return !!j.priority && j.status !== "lost";
      case "complete": return j.status === "complete";
      case "lost": return j.status === "lost";
      default: return true;
    }
  };
  const shown = useMemo(() => {
    if (!jobs) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return jobs.filter((j) => (stage ? j.status === stage : inView(j, view)) && (!words.length || words.every((w) => `${j.job_name ?? ""} ${j.customer} ${j.location ?? ""} ${j.job ?? ""} ${j.notes ?? ""} ${j.qbo_invoice_ref ?? ""}`.toLowerCase().includes(w))));
    // eslint-disable-next-line
  }, [jobs, view, stage, q, ctx]);
  const viewCount = (v: ViewKey) => (jobs ?? []).filter((j) => inView(j, v)).length;
  const totalShown = shown.reduce((a, j) => a + price(j), 0);

  function open(j: any) { if (isPhone) router.push(`/jobs/${j.id}`); else setPeek(j); }

  function move(j: any, status: string) {
    if (j.status === status) return;
    const p: any = { status };
    if (status === "complete" && !j.completed_date) p.completed_date = today;
    if (status === "awaiting" && !j.quoted_date) { p.quoted_date = today; p.proposal_status = "sent"; }
    if ((status === "booked" || status === "progress") && !j.won_date) p.won_date = today;
    applyPatch(j, p, `${j.job_name || j.customer} → ${STATUS_META[status].label}`);
  }
  function applyPatch(j: any, p: Record<string, any>, text: string) {
    const before = jobs ?? [];
    undoable({
      text,
      hide: () => { setJobs(before.map((x) => (x.id === j.id ? { ...x, ...p } : x))); setPeek((cur: any) => (cur && cur.id === j.id ? { ...cur, ...p } : cur)); },
      restore: () => setJobs(before),
      commit: async () => { const { error } = await sb.from("jobs").update({ ...p, updated_at: new Date().toISOString() }).eq("id", j.id); if (error) { setJobs(before); showError("Save failed: " + error.message); } window.dispatchEvent(new Event("isola:changed")); },
    });
  }

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      id: "job", header: "Job", accessorFn: (j) => (j.job_name || j.customer || "").toLowerCase(),
      cell: ({ row: { original: j } }) => (
        <div className="min-w-[220px]">
          <div className="flex items-center gap-1.5 font-medium text-white">{j.priority ? <Star size={13} className="shrink-0 fill-amber-300 text-amber-300" /> : null}<span className="truncate">{j.job_name || j.customer}</span></div>
          <div className="truncate text-xs text-neutral-500">{[j.job_name ? j.customer : null, j.location, j.job].filter(Boolean).join(" · ")}</div>
        </div>
      ),
    },
    {
      id: "stage", header: "Stage", accessorFn: (j) => PIPELINE.indexOf(j.status as any),
      cell: ({ row: { original: j } }) => {
        const tag = stageTag(j, { walked: ctx.walked.has(j.id), drafting: ctx.drafting.has(j.id), scheduled: ctx.scheduled.has(j.id) });
        return <div className="flex items-center gap-2 whitespace-nowrap"><StageChip s={j.status} />{tag ? <span className={cn("text-xs font-semibold", tag.cls)}>{tag.text}</span> : null}</div>;
      },
    },
    {
      id: "price", header: "Price", accessorFn: (j) => price(j),
      cell: ({ row: { original: j } }) => j.price ? (price(j) ? <span className="font-semibold tabular-nums text-white">{fmtPrice(j.price)}</span> : <Badge variant="muted">{fmtPrice(j.price)}</Badge>) : <span className="text-neutral-600">—</span>,
    },
    {
      id: "margin", header: "Spent", accessorFn: (j) => ctx.spent[j.id] ?? 0,
      cell: ({ row: { original: j } }) => {
        const p = price(j), s = ctx.spent[j.id] ?? 0;
        if (!s) return <span className="text-neutral-600">—</span>;
        const pct = p ? Math.round((s / p) * 100) : 0;
        return <div className="w-[110px]"><div className="text-xs tabular-nums text-neutral-300">${Math.round(s).toLocaleString()}{p ? ` · ${pct}%` : ""}</div>{p ? <Progress className="mt-1" value={pct} tone={pct >= 90 ? "bad" : pct >= 70 ? "warn" : "ok"} /> : null}</div>;
      },
    },
    {
      id: "next", header: "Next step", accessorFn: (j) => ctx.next[j.id]?.due_date ?? "9999",
      cell: ({ row: { original: j } }) => {
        const nx = ctx.next[j.id];
        if (!nx || j.status === "lost") return <span className="text-neutral-600">—</span>;
        const late = nx.due_date && nx.due_date < today;
        return <div className="max-w-[260px] truncate text-[13px]"><span className={late ? "text-red-400" : "text-neutral-300"}>{nx.title}</span>{nx.due_date ? <span className={cn("ml-1.5 text-xs", late ? "text-red-400" : "text-neutral-500")}>{late ? "late · " : ""}{fmtDate(nx.due_date).replace(/^\w+, /, "")}</span> : null}</div>;
      },
    },
    {
      id: "updated", header: "Updated", accessorFn: (j) => j.updated_at ?? "",
      cell: ({ row: { original: j } }) => <span className="whitespace-nowrap text-xs text-neutral-500">{j.updated_at ? fmtDate(String(j.updated_at).slice(0, 10)).replace(/^\w+, /, "") : ""}</span>,
    },
  ], [ctx, today]);

  const table = useReactTable({ data: shown, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });

  // keyboard: J/K to move through the list, Enter opens the record, E edits
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const rows = table.getRowModel().rows.map((r) => r.original);
      if (!rows.length) return;
      const i = peek ? rows.findIndex((r) => r.id === peek.id) : -1;
      if (e.key === "j") { e.preventDefault(); setPeek(rows[Math.min(rows.length - 1, i + 1)]); }
      else if (e.key === "k") { e.preventDefault(); setPeek(rows[Math.max(0, i - 1)]); }
      else if (e.key === "Enter" && peek) router.push(`/jobs/${peek.id}`);
      else if (e.key === "e" && peek) { e.preventDefault(); editJob(peek); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [table, peek, router]);

  const counts: Record<string, number> = {};
  (jobs ?? []).forEach((j) => { counts[j.status] = (counts[j.status] ?? 0) + 1; });

  return (
    <div>
      <PageHeader title="Jobs" sub={jobs ? `${shown.length} shown${totalShown ? ` · $${Math.round(totalShown).toLocaleString()}` : ""}` : "Loading…"}
        actions={<>
          <span className="hidden items-center gap-1 text-xs text-neutral-500 lg:flex"><Kbd>J</Kbd><Kbd>K</Kbd> move · <Kbd>E</Kbd> edit</span>
          <Segmented className="hidden md:inline-flex" value={mode} onChange={(v) => setMode(v as "table" | "board")} options={[{ value: "table", label: "Table", icon: <Table2 size={14} /> }, { value: "board", label: "Board", icon: <Columns3 size={14} /> }]} />
          <Button onClick={() => editJob()}><Plus size={16} /> New job</Button>
        </>} />

      {/* stage strip */}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:grid md:grid-cols-5 md:px-0">
        {PIPELINE.map((s) => {
          const sub = s === "lead" ? (jobs ?? []).filter((j) => j.status === "lead" && !ctx.walked.has(j.id)).length
            : s === "awaiting" ? (jobs ?? []).filter((j) => j.status === "awaiting" && j.quoted_date && daysSince(j.quoted_date) > 14).length
            : s === "booked" ? (jobs ?? []).filter((j) => j.status === "booked" && !j.start_date && !ctx.scheduled.has(j.id)).length
            : s === "complete" ? (jobs ?? []).filter((j) => j.status === "complete" && !j.paid_date).length : 0;
          const subLabel = s === "lead" ? "to walk" : s === "awaiting" ? "stale" : s === "booked" ? "no date" : s === "complete" ? "unpaid" : "";
          const sum = (jobs ?? []).filter((j) => j.status === s).reduce((a, j) => a + price(j), 0);
          return (
            <button key={s} onClick={() => setStage(stage === s ? null : s)} aria-pressed={stage === s}
              className={cn("min-w-[118px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition-colors md:min-w-0", stage === s ? "border-white bg-white/[0.08]" : "border-border bg-card hover:border-white/25")}>
              <div className="flex items-center gap-1.5"><span className={cn("h-1.5 w-1.5 rounded-full", BAR[s])} /><span className="truncate text-xs font-semibold text-neutral-400">{STATUS_META[s].label}</span></div>
              <div className="mt-1 flex items-baseline gap-2"><span className="text-xl font-semibold tabular-nums text-white">{counts[s] ?? 0}</span><span className="hidden truncate text-xs tabular-nums text-neutral-500 sm:inline">{sum ? `$${Math.round(sum / 1000)}k` : ""}</span></div>
              <div className={cn("truncate text-xs", sub ? (s === "complete" ? "text-red-300" : "text-amber-300") : "text-transparent")}>{sub ? `${sub} ${subLabel}` : "·"}</div>
            </button>
          );
        })}
      </div>

      {stage ? (
        <div className="mb-3 flex items-center gap-2 text-sm text-neutral-300">
          Showing <span className="font-semibold text-white">{STATUS_META[stage].label}</span> only
          <button onClick={() => setStage(null)} className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs font-semibold text-neutral-300 hover:text-white">Show all</button>
        </div>
      ) : null}
      {/* saved views + search */}
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar md:mx-0 md:flex-1 md:flex-wrap md:px-0">
          {VIEWS.map((v) => {
            const n = jobs ? viewCount(v.key) : 0;
            const on = !stage && view === v.key;
            return (
              <button key={v.key} onClick={() => { setStage(null); setView(v.key); }}
                className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold", on ? "border-white bg-white text-neutral-900" : "border-white/10 text-neutral-400 hover:border-white/25 hover:text-white")}>
                {v.label}<span className={cn("tabular-nums", on ? "text-neutral-500" : v.key === "attention" && n ? "text-amber-300" : "text-neutral-600")}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="relative md:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter jobs…" className="h-9 pl-9" />
        </div>
      </div>

      {jobs === null ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-14" />)}</div>
      ) : !shown.length ? (
        <Empty icon={<Briefcase size={28} />} title={q ? `No jobs match “${q}”` : "Nothing in this view"}
          body={q ? "Try a customer name, street, or work type." : "Pick another view above, or add a job."}
          action={q ? <Button variant="outline" onClick={() => setQ("")}>Clear filter</Button> : <Button onClick={() => editJob()}><Plus size={16} /> New job</Button>} />
      ) : mode === "board" && !isPhone ? (
        <Board jobs={shown} ctx={ctx} onOpen={open} onMove={move} showDone={stage === "complete" || (!stage && (view === "all" || view === "complete" || view === "active"))} />
      ) : isPhone ? (
        <div className="space-y-2">
          {table.getRowModel().rows.map(({ original: j }) => {
            const tag = stageTag(j, { walked: ctx.walked.has(j.id), drafting: ctx.drafting.has(j.id), scheduled: ctx.scheduled.has(j.id) });
            const nx = ctx.next[j.id];
            const late = nx?.due_date && nx.due_date < today;
            return (
              <Link key={j.id} href={`/jobs/${j.id}`} className="relative block overflow-hidden rounded-xl border border-border bg-card py-3 pl-4 pr-3 active:bg-white/[0.04]">
                <span className={cn("absolute inset-y-0 left-0 w-1", BAR[j.status])} />
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-white">{j.priority ? <Star size={13} className="mr-1 inline fill-amber-300 text-amber-300" /> : null}{j.job_name || j.customer}</div>
                    <div className="truncate text-sm text-neutral-400">{[j.job_name ? j.customer : j.location, j.job].filter(Boolean).join(" · ") || "—"}</div>
                    {nx && j.status !== "lost" ? <div className={cn("mt-1 truncate text-xs", late ? "text-red-400" : "text-neutral-300")}>→ {nx.title}</div> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    {j.price ? <div className="text-[15px] font-semibold tabular-nums text-white">{fmtPrice(j.price)}</div> : null}
                    {tag ? <div className={cn("mt-0.5 text-xs font-semibold", tag.cls)}>{tag.text}</div> : <div className="mt-0.5 text-xs text-neutral-500">{STATUS_META[j.status]?.label}</div>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <TableWrap className="max-h-[calc(100vh-330px)]">
          <Table>
            <THead>
              {table.getHeaderGroups().map((hg) => (
                <TR key={hg.id}>
                  {hg.headers.map((h) => (
                    <TH key={h.id}>
                      <button onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-white">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown size={12} className={h.column.getIsSorted() ? "text-white" : "text-neutral-600"} />
                      </button>
                    </TH>
                  ))}
                </TR>
              ))}
            </THead>
            <TBody>
              {table.getRowModel().rows.map((r) => (
                <TR key={r.id} data-state={peek?.id === r.original.id ? "selected" : undefined} onClick={() => open(r.original)} className="cursor-pointer hover:bg-white/[0.03]">
                  {r.getVisibleCells().map((c) => <TD key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TD>)}
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}

      <Sheet open={!!peek} onOpenChange={(o) => { if (!o) setPeek(null); }}>
        {peek ? <SheetContent title={peek.job_name || peek.customer}><Peek j={peek} ctx={ctx} onMove={move} onPatch={applyPatch} /></SheetContent> : null}
      </Sheet>
    </div>
  );
}

function Peek({ j, ctx, onMove, onPatch }: { j: any; ctx: Ctx; onMove: (j: any, s: string) => void; onPatch: (j: any, p: Record<string, any>, text: string) => void }) {
  const router = useRouter();
  const step = nextStep(j, { walked: ctx.walked.has(j.id), drafting: ctx.drafting.has(j.id), scheduled: ctx.scheduled.has(j.id) || !!j.start_date });
  const p = price(j), s = ctx.spent[j.id] ?? 0;
  const pct = p ? Math.round((s / p) * 100) : 0;
  const tel = String(j.contact_phone ?? "").replace(/[^0-9+]/g, "");
  const nx = ctx.next[j.id];
  const Icon = step?.icon;
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 pb-4 pt-5 pr-14">
        <div className="mb-1.5 flex items-center gap-1.5"><StageChip s={j.status} />{j.paid_date ? <Badge variant="success">Paid</Badge> : j.invoiced_date ? <Badge variant="warning">Invoiced</Badge> : null}</div>
        <h2 className="text-xl font-semibold leading-tight text-white">{j.job_name || j.customer}</h2>
        <p className="mt-0.5 truncate text-sm text-neutral-400">{[j.customer, j.location, j.job].filter(Boolean).join(" · ")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm"><Link href={`/jobs/${j.id}`}><ExternalLink size={14} /> Open record</Link></Button>
          {tel.length >= 7 ? <Button asChild size="sm" variant="outline"><a href={`tel:${tel.slice(0, 11)}`}><Phone size={14} /> Call</a></Button> : null}
          {j.location ? <Button asChild size="sm" variant="outline"><a href={`https://maps.google.com/?q=${encodeURIComponent(j.location)}`} target="_blank" rel="noreferrer"><Navigation size={14} /> Map</a></Button> : null}
          <Button size="sm" variant="outline" onClick={() => editJob(j)}>Edit</Button>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto scroll-thin px-5 py-4">
        {step && Icon ? (
          <button onClick={() => { if ("href" in step && step.href) router.push(step.href); else if ("tab" in step) router.push(`/jobs/${j.id}`); else if ("patch" in step && step.patch) onPatch(j, step.patch, step.toast ?? "Saved"); }}
            className="flex w-full items-center gap-3 rounded-xl border border-white/15 px-4 py-3 text-left hover:bg-white/[0.04]">
            <Icon size={18} className="text-white" /><span className="flex-1 text-sm font-semibold text-white">{step.label}</span><ArrowRight size={16} className="text-neutral-500" />
          </button>
        ) : null}
        <div>
          <div className="mb-1.5 text-xs font-semibold text-neutral-500">Move to</div>
          <div className="flex flex-wrap gap-1.5">
            {PIPELINE.map((st) => <Button key={st} size="sm" variant={j.status === st ? "default" : "outline"} onClick={() => onMove(j, st)}>{STATUS_META[st].label}</Button>)}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-border p-3">
          <div><div className="text-xs text-neutral-500">Contract</div><div className="truncate font-semibold tabular-nums text-white">{fmtPrice(j.price) || "—"}</div></div>
          <div><div className="text-xs text-neutral-500">Spent</div><div className="font-semibold tabular-nums text-white">${Math.round(s).toLocaleString()}</div></div>
          <div><div className="text-xs text-neutral-500">Margin</div><div className={cn("font-semibold tabular-nums", !p ? "text-neutral-500" : 100 - pct < 10 ? "text-red-300" : 100 - pct < 30 ? "text-amber-300" : "text-emerald-300")}>{p ? `${100 - pct}%` : "—"}</div></div>
          {p && s ? <Progress className="col-span-3" value={pct} tone={pct >= 90 ? "bad" : pct >= 70 ? "warn" : "ok"} /> : null}
        </div>
        <div>
          {nx ? <KV k="Next task">{nx.title}{nx.due_date ? ` · ${fmtDate(nx.due_date)}` : ""}</KV> : null}
          <KV k="Contact">{[j.contact_name, j.contact_phone].filter(Boolean).join(" · ") || "—"}</KV>
          <KV k="Quoted">{fmtDate(j.quoted_date)}</KV>
          <KV k="Start">{fmtDate(j.start_date)}</KV>
          <KV k="Completed">{fmtDate(j.completed_date)}</KV>
          <KV k="Source">{j.lead_source || "—"}</KV>
        </div>
        {j.scope_of_work ? <div><div className="mb-1 text-xs font-semibold text-neutral-500">Scope</div><p className="line-clamp-[10] whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{j.scope_of_work}</p></div> : null}
        {j.notes ? <div><div className="mb-1 text-xs font-semibold text-neutral-500">Notes</div><p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{j.notes}</p></div> : null}
      </div>
    </div>
  );
}

function Board({ jobs, ctx, onOpen, onMove, showDone }: { jobs: any[]; ctx: Ctx; onOpen: (j: any) => void; onMove: (j: any, s: string) => void; showDone: boolean }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const cols = showDone ? [...PIPELINE] : PIPELINE.filter((s) => s !== "complete");
  function end(e: DragEndEvent) {
    const j = jobs.find((x) => x.id === e.active.id);
    const to = e.over?.id as string | undefined;
    if (j && to && to !== j.status) onMove(j, to);
  }
  return (
    <DndContext sensors={sensors} onDragEnd={end}>
      <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto scroll-thin pb-2">
        {cols.map((s) => <Column key={s} s={s} jobs={jobs.filter((j) => j.status === s)} ctx={ctx} onOpen={onOpen} />)}
      </div>
    </DndContext>
  );
}

function Column({ s, jobs, ctx, onOpen }: { s: string; jobs: any[]; ctx: Ctx; onOpen: (j: any) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: s });
  const sum = jobs.reduce((a, j) => a + price(j), 0);
  return (
    <div ref={setNodeRef} className={cn("flex min-h-[200px] flex-col rounded-xl border bg-white/[0.02] p-2", isOver ? "border-white/40" : "border-border")}>
      <div className="flex items-baseline gap-2 px-1.5 pb-2 pt-1">
        <span className={cn("h-1.5 w-1.5 self-center rounded-full", BAR[s])} />
        <span className="text-sm font-semibold text-white">{STATUS_META[s].label}</span>
        <span className="text-xs text-neutral-500">{jobs.length}</span>
        <span className="ml-auto text-xs tabular-nums text-neutral-500">{sum ? `$${Math.round(sum).toLocaleString()}` : ""}</span>
      </div>
      <div className="space-y-2">{jobs.map((j) => <BoardCard key={j.id} j={j} ctx={ctx} onOpen={onOpen} />)}</div>
    </div>
  );
}

function BoardCard({ j, ctx, onOpen }: { j: any; ctx: Ctx; onOpen: (j: any) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: j.id });
  const tag = stageTag(j, { walked: ctx.walked.has(j.id), drafting: ctx.drafting.has(j.id), scheduled: ctx.scheduled.has(j.id) });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} onClick={() => onOpen(j)}
      className={cn("cursor-grab rounded-lg border border-border bg-neutral-950 p-3 hover:border-white/25 active:cursor-grabbing", isDragging && "z-50 opacity-90 shadow-2xl ring-1 ring-white/30")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{j.priority ? <Star size={12} className="mr-1 inline fill-amber-300 text-amber-300" /> : null}{j.job_name || j.customer}</div>
          <div className="truncate text-xs text-neutral-500">{[j.job_name ? j.customer : j.location, j.job].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {tag ? <span className={cn("text-xs font-semibold", tag.cls)}>{tag.text}</span> : null}
        {j.price ? <span className="ml-auto text-sm font-semibold tabular-nums text-white">{fmtPrice(j.price)}</span> : null}
      </div>
    </div>
  );
}
