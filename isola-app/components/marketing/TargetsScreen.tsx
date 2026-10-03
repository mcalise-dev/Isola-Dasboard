"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { Plus, Search, ArrowUpDown, ChevronDown, ChevronUp, Target as TargetIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STAGES, SECTORS, TIER_ORDER } from "@/lib/crm";
import { PageHeader, Skeleton, Empty } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MContact, Campaign, TierBadge, SeqBar, Chips, stepsOf, rel, dueTone, isFollowDue, isOpen } from "./lib";
import TargetPeek from "./TargetPeek";
import TargetForm from "./TargetForm";

type View = "due" | "a" | "none" | "outreach" | "all";
const VIEWS: View[] = ["due", "a", "none", "outreach", "all"];

function DueCell({ c }: { c: MContact }) {
  const tone = dueTone(c.next_date);
  if (!c.next_action && !c.next_date) return <span className="text-neutral-600">—</span>;
  return (
    <div className="min-w-0">
      <div className="truncate text-sm text-neutral-200">{c.next_action || "Follow up"}</div>
      {c.next_date ? <div className={cn("text-xs", tone === "bad" ? "font-semibold text-red-300" : tone === "warn" ? "font-semibold text-amber-300" : "text-neutral-500")}>{rel(c.next_date)}</div> : null}
    </div>
  );
}

function Inner() {
  const sb = useMemo(() => createClient(), []);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [contacts, setContacts] = useState<MContact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const initialView = (params.get("view") as View) ?? null;
  const [view, setView] = useState<View>(initialView && VIEWS.includes(initialView) ? initialView : "all");
  const [q, setQ] = useState("");
  const [fTier, setFTier] = useState("");
  const [fStage, setFStage] = useState("");
  const [fSector, setFSector] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [peekId, setPeekId] = useState<string | null>(params.get("c"));
  const [formOpen, setFormOpen] = useState(params.get("new") === "1");
  const [editing, setEditing] = useState<MContact | null>(null);
  const [showTiers, setShowTiers] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, k] = await Promise.all([
        sb.from("contacts").select("*").order("company"),
        sb.from("campaigns").select("*").order("created_at"),
      ]);
      setContacts((c.data as MContact[]) ?? []);
      setCampaigns((k.data as Campaign[]) ?? []);
      setLoading(false);
    })();
  }, [sb]);

  // keep ?c= in the URL in step with the open peek (so a link can be shared / back works)
  function openPeek(id: string | null) {
    setPeekId(id);
    const sp = new URLSearchParams(params.toString());
    if (id) sp.set("c", id); else sp.delete("c");
    sp.delete("new");
    router.replace(`${pathname}${sp.toString() ? "?" + sp.toString() : ""}`, { scroll: false });
  }

  const campById = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c])), [campaigns]);

  const counts = useMemo(() => ({
    due: contacts.filter(isFollowDue).length,
    a: contacts.filter((c) => c.tier === "A" && isOpen(c)).length,
    none: contacts.filter((c) => !c.last_touch && c.stage === "Not started").length,
    outreach: contacts.filter((c) => !!c.campaign_id && isOpen(c)).length,
    all: contacts.length,
  }), [contacts]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return contacts.filter((c) => {
      if (view === "due" && !isFollowDue(c)) return false;
      if (view === "a" && !(c.tier === "A" && isOpen(c))) return false;
      if (view === "none" && !(!c.last_touch && c.stage === "Not started")) return false;
      if (view === "outreach" && !(c.campaign_id && isOpen(c))) return false;
      if (fTier && c.tier !== fTier) return false;
      if (fStage && c.stage !== fStage) return false;
      if (fSector && (c.sector ?? "") !== fSector) return false;
      if (ql && ![c.name, c.company, c.title, c.buildings, c.notes, c.email].join(" ").toLowerCase().includes(ql)) return false;
      return true;
    }).sort((a, b) =>
      view === "due" ? (a.next_date ?? "").localeCompare(b.next_date ?? "")
        : (TIER_ORDER[a.tier ?? "C"] ?? 9) - (TIER_ORDER[b.tier ?? "C"] ?? 9) || (a.company ?? "").localeCompare(b.company ?? "") || a.name.localeCompare(b.name));
  }, [contacts, view, q, fTier, fStage, fSector]);

  const seqInfo = (c: MContact) => {
    const camp = c.campaign_id ? campById[c.campaign_id] : null;
    if (!c.campaign_id) return null;
    const steps = stepsOf(camp);
    return { name: camp?.name ?? "Campaign", total: steps.length, done: Math.min(c.seq_step ?? 0, steps.length) };
  };

  const columns = useMemo<ColumnDef<MContact>[]>(() => [
    { id: "tier", header: "Tier", accessorFn: (c) => TIER_ORDER[c.tier ?? "C"] ?? 9, cell: ({ row }) => <TierBadge tier={row.original.tier} />, size: 56 },
    { id: "name", header: "Name", accessorFn: (c) => c.name.toLowerCase(), cell: ({ row }) => (
      <div className="min-w-0 max-w-[260px]">
        <div className="truncate font-semibold text-white">{row.original.name}</div>
        <div className="truncate text-xs text-neutral-400">{[row.original.title, row.original.company].filter(Boolean).join(" · ")}</div>
      </div>) },
    { id: "sector", header: "Sector / type", accessorFn: (c) => `${c.sector ?? ""} ${c.prospect_type ?? ""}`, cell: ({ row }) => (
      <div className="text-xs"><div className="text-neutral-200">{row.original.sector ?? "—"}</div><div className="text-neutral-500">{row.original.prospect_type ?? ""}</div></div>) },
    { id: "stage", header: "Stage", accessorFn: (c) => STAGES.indexOf(c.stage), cell: ({ row }) => {
      const s = row.original.stage;
      return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", s === "Won" || s === "Client" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : s === "Dead" ? "border-red-500/30 text-red-300/80" : s === "Not started" ? "border-white/10 text-neutral-400" : "border-white/20 text-neutral-100")}>{s}</span>;
    } },
    { id: "seq", header: "Sequence", accessorFn: (c) => (c.campaign_id ? (c.seq_step ?? 0) + 1 : 0), cell: ({ row }) => {
      const s = seqInfo(row.original);
      if (!s) return <span className="text-neutral-600">—</span>;
      return <div className="w-[130px]"><div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate text-neutral-300">{s.name}</span><span className="tabular-nums text-neutral-500">{s.done}/{s.total}</span></div><SeqBar total={s.total} done={s.done} /></div>;
    } },
    { id: "last", header: "Last touch", accessorFn: (c) => c.last_touch ?? "", cell: ({ row }) => <span className="whitespace-nowrap text-xs text-neutral-400">{row.original.last_touch ? rel(row.original.last_touch) : "Never"}</span> },
    { id: "next", header: "Next action", accessorFn: (c) => c.next_date ?? "9999", cell: ({ row }) => <DueCell c={row.original} /> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [campById]);

  const table = useReactTable({ data: rows, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  const peek = contacts.find((c) => c.id === peekId) ?? null;

  const patchLocal = (id: string, p: Partial<MContact>) => setContacts((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));

  return (
    <div>
      <PageHeader title="Targets" sub="The people at accounts you want work from — A, B and C."
        actions={<>
          <Button variant="ghost" size="sm" asChild><Link href="/marketing/prospects">Classic view</Link></Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={16} />Add target</Button>
        </>} />

      <div className="mb-3">
        <button onClick={() => setShowTiers((v) => !v)} className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white">
          What the tiers mean {showTiers ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {showTiers ? (
          <div className="mt-2 grid gap-2 text-xs text-neutral-400 sm:grid-cols-3">
            <div className="flex items-start gap-2 rounded-lg bg-white/[0.04] p-2.5"><TierBadge tier="A" /><span><b className="text-neutral-200">A</b> — decision maker at a target account. Personal outreach, calls, walk-throughs.</span></div>
            <div className="flex items-start gap-2 rounded-lg bg-white/[0.04] p-2.5"><TierBadge tier="B" /><span><b className="text-neutral-200">B</b> — worth a sequence. Enroll in a campaign and let the steps run.</span></div>
            <div className="flex items-start gap-2 rounded-lg bg-white/[0.04] p-2.5"><TierBadge tier="C" /><span><b className="text-neutral-200">C</b> — keep warm. Connect on LinkedIn, check in a few times a year.</span></div>
          </div>
        ) : null}
      </div>

      <Chips<View> value={view} onChange={setView} className="mb-3" options={[
        { value: "due", label: "Due today", count: counts.due },
        { value: "a", label: "A tier", count: counts.a },
        { value: "none", label: "No contact yet", count: counts.none },
        { value: "outreach", label: "In outreach", count: counts.outreach },
        { value: "all", label: "All", count: counts.all },
      ]} />

      <div className="mb-4 grid grid-cols-3 gap-2 md:flex md:flex-wrap md:items-center">
        <div className="relative col-span-3 md:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, building…" className="pl-9" />
        </div>
        <NativeSelect value={fTier} onChange={(e) => setFTier(e.target.value)} className="md:w-32"><option value="">All tiers</option>{["A", "B", "C", "Broker", "Client"].map((t) => <option key={t}>{t}</option>)}</NativeSelect>
        <NativeSelect value={fStage} onChange={(e) => setFStage(e.target.value)} className="md:w-40"><option value="">All stages</option>{STAGES.map((t) => <option key={t}>{t}</option>)}</NativeSelect>
        <NativeSelect value={fSector} onChange={(e) => setFSector(e.target.value)} className="md:w-36"><option value="">All sectors</option>{SECTORS.map((t) => <option key={t}>{t}</option>)}</NativeSelect>
        <span className="col-span-3 text-xs text-neutral-500 md:ml-auto md:col-auto">{rows.length} shown</span>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : rows.length === 0 ? (
        <Empty icon={<TargetIcon size={20} />} title={view === "due" ? "No follow-ups due" : "No targets match"}
          body={view === "due" ? "Nice. Set next actions on A-tier targets so the list fills back up." : "Clear the filters or add a new target."}
          action={<Button variant="outline" onClick={() => { setView("all"); setFTier(""); setFStage(""); setFSector(""); setQ(""); }}>Show all targets</Button>} />
      ) : (
        <>
          {/* desktop table */}
          <TableWrap className="hidden md:block">
            <Table>
              <THead>
                {table.getHeaderGroups().map((hg) => (
                  <TR key={hg.id}>
                    {hg.headers.map((h) => (
                      <TH key={h.id}>
                        <button className="inline-flex items-center gap-1 hover:text-white" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === "asc" ? <ChevronUp size={12} /> : h.column.getIsSorted() === "desc" ? <ChevronDown size={12} /> : <ArrowUpDown size={11} className="opacity-40" />}
                        </button>
                      </TH>
                    ))}
                  </TR>
                ))}
              </THead>
              <TBody>
                {table.getRowModel().rows.map((r) => (
                  <TR key={r.id} data-state={r.original.id === peekId ? "selected" : undefined} onClick={() => openPeek(r.original.id)} className="cursor-pointer hover:bg-white/[0.03]">
                    {r.getVisibleCells().map((cell) => <TD key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TD>)}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>

          {/* phone cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((c) => {
              const s = seqInfo(c);
              const tone = dueTone(c.next_date);
              return (
                <button key={c.id} onClick={() => openPeek(c.id)} className="block w-full rounded-xl border border-border bg-card p-3 text-left active:bg-white/[0.04]">
                  <div className="flex items-start gap-3">
                    <TierBadge tier={c.tier} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-white">{c.name}</div>
                      <div className="truncate text-xs text-neutral-400">{[c.title, c.company].filter(Boolean).join(" · ")}</div>
                    </div>
                    <span className="shrink-0 text-xs text-neutral-400">{c.stage}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <span className="min-w-0 flex-1 truncate text-neutral-300">{c.next_action || (c.next_date ? "Follow up" : <span className="text-neutral-600">No next action</span>)}</span>
                    {c.next_date ? <span className={cn("shrink-0", tone === "bad" ? "font-semibold text-red-300" : tone === "warn" ? "font-semibold text-amber-300" : "text-neutral-500")}>{rel(c.next_date)}</span> : null}
                  </div>
                  {s ? <div className="mt-2 flex items-center gap-2"><SeqBar total={s.total} done={s.done} className="flex-1" /><span className="text-[11px] tabular-nums text-neutral-500">{s.done}/{s.total}</span></div> : null}
                </button>
              );
            })}
          </div>
        </>
      )}

      <Sheet open={!!peek} onOpenChange={(v) => { if (!v) openPeek(null); }}>
        <SheetContent title={peek?.name ?? "Target"}>
          {peek ? (
            <TargetPeek contact={peek} campaigns={campaigns} onPatch={patchLocal}
              onEdit={() => { setEditing(peek); setFormOpen(true); }}
              onDeleted={(c, restore) => {
                if (restore) setContacts((cs) => [...cs, c]);
                else { setContacts((cs) => cs.filter((x) => x.id !== c.id)); openPeek(null); }
              }} />
          ) : null}
        </SheetContent>
      </Sheet>

      <TargetForm open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v && params.get("new")) { const sp = new URLSearchParams(params.toString()); sp.delete("new"); router.replace(`${pathname}${sp.toString() ? "?" + sp : ""}`, { scroll: false }); } }}
        contact={editing}
        onSaved={(c) => setContacts((cs) => (cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? c : x)) : [c, ...cs]))} />
    </div>
  );
}

export default function TargetsScreen() {
  return (
    <Suspense fallback={<div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>}>
      <Inner />
    </Suspense>
  );
}
