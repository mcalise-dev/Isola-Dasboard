"use client";
// v4.6 Home: a one-line brief, the money at a glance, a "needs attention" list you can
// clear (Linear inbox), today on site, and the next 7 days on the right.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAttention, type AttnItem, type Level } from "@/lib/attention";
import { STATUS_META, PIPELINE, fmtDate, todayISO } from "@/lib/format";
import { openNew } from "@/components/SearchPalette";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stat, Empty, SectionTitle } from "@/components/ui/bits";
import { Segmented } from "@/components/ui/tabs";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Check, Clock, Navigation, Camera, UserPlus, ListChecks, Plus, ChevronRight, CalendarDays, Sparkles } from "lucide-react";

const DOT: Record<Level, string> = { high: "bg-red-400", mid: "bg-amber-400", low: "bg-neutral-500" };
const KIND_DOT: Record<string, string> = { work: "bg-white", visit: "bg-emerald-400", task: "bg-neutral-500", start: "bg-white", invoice: "bg-amber-400" };
const k$ = (n: number) => n >= 10000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n).toLocaleString()}`;

function useDismissed() {
  const [d, setD] = useState<Record<string, number>>({});
  useEffect(() => { try { const raw = JSON.parse(localStorage.getItem("isola.home.dismissed") || "{}"); const now = Date.now(); setD(Object.fromEntries(Object.entries(raw).filter(([, t]) => (t as number) > now)) as any); } catch {} }, []);
  const snooze = (id: string, days: number) => setD((cur) => { const n = { ...cur, [id]: Date.now() + days * 86400000 }; try { localStorage.setItem("isola.home.dismissed", JSON.stringify(n)); } catch {} return n; });
  const clear = () => { setD({}); try { localStorage.removeItem("isola.home.dismissed"); } catch {} };
  return { d, snooze, clear };
}

export default function HomeScreen() {
  const a = useAttention();
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const { d, snooze, clear } = useDismissed();
  const [filter, setFilter] = useState<"all" | "money" | "jobs" | "marketing">("all");
  const [today, setToday] = useState<any[] | null>(null);
  const t = todayISO();

  useEffect(() => {
    const go = () => sb.from("schedule_entries").select("id,label,job_id,assignee,sort,jobs(id,job_name,customer,location)").eq("entry_date", t).order("sort").then(({ data }: any) => setToday(data ?? []));
    window.addEventListener("isola:changed", go);
    return () => window.removeEventListener("isola:changed", go);
  }, [sb, t]);
  useEffect(() => {
    sb.from("schedule_entries").select("id,label,job_id,assignee,sort,jobs(id,job_name,customer,location)").eq("entry_date", t).order("sort").then(({ data }: any) => setToday(data ?? []));
  }, [sb, t]);

  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLine = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const group = (i: AttnItem) => i.kind.includes("invoice") || i.kind === "To invoice" || i.kind === "Receipts" ? "money"
    : i.kind.includes("Follow") || i.kind.includes("review") ? "marketing" : "jobs";
  const items = (a?.items ?? []).filter((i) => !d[i.id]).filter((i) => filter === "all" || group(i) === filter);
  const hidden = (a?.items ?? []).filter((i) => d[i.id]).length;

  // the one-line brief
  const brief = (() => {
    if (!a) return "";
    const parts: string[] = [];
    const overdueInv = a.items.filter((i) => i.kind === "Overdue invoice");
    if (overdueInv.length) parts.push(`${k$(overdueInv.reduce((s, i) => s + (i.amount ?? 0), 0))} overdue from ${overdueInv.length} invoice${overdueInv.length === 1 ? "" : "s"}`);
    const toInv = a.items.filter((i) => i.kind === "To invoice").length;
    if (toInv) parts.push(`${toInv} job${toInv === 1 ? "" : "s"} to invoice`);
    const stale = a.items.filter((i) => i.kind.startsWith("Proposal")).length;
    if (stale) parts.push(`${stale} proposal${stale === 1 ? "" : "s"} going stale`);
    const uns = a.badges.dispatch;
    if (uns) parts.push(`${uns} booked job${uns === 1 ? "" : "s"} not on the board`);
    const crew = today?.length ?? 0;
    const lead = parts.length ? `${parts.slice(0, 3).join(", ")}.` : "Nothing urgent.";
    return `${lead} ${crew ? `${crew} job${crew === 1 ? "" : "s"} on the board today.` : "Nothing on the board today."}`;
  })();

  const stops = (today ?? []).map((e: any) => e.jobs?.location).filter((x: string | undefined): x is string => !!x && x.trim().length > 2);
  const routeUrl = !stops.length ? null : stops.length === 1 ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stops[0])}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stops[stops.length - 1])}&waypoints=${stops.slice(0, -1).map(encodeURIComponent).join("|")}&travelmode=driving`;

  // horizon grouped by day
  const days = useMemo(() => {
    const out: { date: string; evs: NonNullable<typeof a>["horizon"] }[] = [];
    (a?.horizon ?? []).forEach((e) => { const last = out[out.length - 1]; if (last && last.date === e.date) last.evs.push(e); else out.push({ date: e.date, evs: [e] }); });
    return out;
  }, [a]);

  return (
    <div>
      <div className="mb-5">
        <div className="text-[13px] text-neutral-500">{dateLine}</div>
        <h1 className="mt-0.5 text-2xl font-semibold text-white md:text-[28px]">{hello}, Mike</h1>
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <Sparkles size={18} className="mt-0.5 shrink-0 text-neutral-400" />
          {a ? <p className="text-[15px] leading-snug text-neutral-200">{brief}</p> : <div className="skeleton h-5 w-full max-w-xl" />}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {a ? <>
          <Stat label="Owed to me" value={k$(a.money.totalAr)} hint={a.money.overdue ? <span className="text-red-300">{k$(a.money.overdue)} overdue</span> : a.money.asOf ? `QuickBooks as of ${fmtDate(a.money.asOf).replace(/^\w+, /, "")}` : undefined} onClick={() => router.push("/money")} />
          <Stat label="Waiting on approval" value={k$(a.money.pipeline)} hint={`${a.counts.awaiting ?? 0} proposals out`} onClick={() => router.push("/proposals")} />
          <Stat label="Booked work" value={k$(a.money.booked)} hint={`${(a.counts.booked ?? 0) + (a.counts.progress ?? 0)} jobs booked or running`} onClick={() => router.push("/")} />
          <Stat label="Ready to invoice" value={k$(a.money.toInvoice)} tone={a.money.toInvoice ? "warn" : undefined} hint={a.badges.jobs ? `${a.badges.jobs} finished, not invoiced` : "All caught up"} onClick={() => router.push("/")} />
        </> : [0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[86px]" />)}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-7">
          <section>
            <SectionTitle right={<Segmented value={filter} onChange={(v) => setFilter(v as typeof filter)} options={[{ value: "all", label: "All" }, { value: "money", label: "Money" }, { value: "jobs", label: "Jobs" }, { value: "marketing", label: "Marketing" }]} />}>
              Needs attention {a ? <span className="ml-1 text-sm font-normal text-neutral-500">{items.length}</span> : null}
            </SectionTitle>
            {!a ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-14" />)}</div>
              : !items.length ? <Empty icon={<Check size={26} />} title="All clear" body={hidden ? `${hidden} item${hidden === 1 ? "" : "s"} snoozed.` : "Nothing needs you right now."} action={hidden ? <Button variant="outline" size="sm" onClick={clear}>Show snoozed</Button> : undefined} />
              : (
                <div className="overflow-hidden rounded-xl border border-border">
                  {items.slice(0, 25).map((i) => (
                    <div key={i.id} className="group flex items-center gap-3 border-b border-border bg-card px-4 py-3 last:border-0 hover:bg-white/[0.03]">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[i.level])} />
                      <Link href={i.href} className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-neutral-500">{i.kind}</div>
                        <div className="truncate text-sm font-medium text-white">{i.title}</div>
                        <div className="truncate text-xs text-neutral-400">{i.sub}</div>
                      </Link>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                        <Tip label="Snooze until tomorrow"><button onClick={() => snooze(i.id, 1)} className="rounded-md p-2 text-neutral-500 hover:bg-accent hover:text-white" aria-label="Snooze"><Clock size={16} /></button></Tip>
                        <Tip label="Hide for a week"><button onClick={() => snooze(i.id, 7)} className="rounded-md p-2 text-neutral-500 hover:bg-accent hover:text-white" aria-label="Hide for a week"><Check size={16} /></button></Tip>
                      </div>
                      <ChevronRight size={16} className="hidden shrink-0 text-neutral-600 md:block" />
                    </div>
                  ))}
                  {items.length > 25 ? <div className="bg-card px-4 py-2.5 text-xs text-neutral-500">+ {items.length - 25} more</div> : null}
                </div>
              )}
            {hidden && items.length ? <button onClick={clear} className="mt-2 text-xs text-neutral-500 hover:text-white">{hidden} snoozed · show</button> : null}
          </section>

          <section>
            <SectionTitle right={routeUrl ? <Button asChild size="sm" variant="outline"><a href={routeUrl} target="_blank" rel="noreferrer"><Navigation size={14} /> Route</a></Button> : <Link href="/dispatch" className="text-sm font-semibold text-neutral-400 hover:text-white">Dispatch board</Link>}>On site today</SectionTitle>
            {today === null ? <div className="skeleton h-14" /> : !today.length ? (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-neutral-500">Nothing on the board today. <Link href="/dispatch" className="font-semibold text-neutral-300 hover:text-white">Plan the week</Link></p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {today.map((e: any) => (
                  <Link key={e.id} href={e.job_id ? `/jobs/${e.job_id}` : "/schedule"} className="rounded-xl border border-border bg-card px-4 py-3 hover:border-white/20">
                    <div className="truncate text-sm font-medium text-white">{e.jobs?.job_name || e.jobs?.customer || e.label || "Work"}</div>
                    <div className="truncate text-xs text-neutral-400">{[e.assignee, e.jobs?.location].filter(Boolean).join(" · ") || "—"}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[76px]">
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2"><CalendarDays size={16} className="text-neutral-400" /><h3 className="text-[15px] font-semibold text-white">Next 7 days</h3>
              <Link href="/schedule" className="ml-auto text-xs font-semibold text-neutral-500 hover:text-white">Calendar</Link></div>
            {!a ? <div className="space-y-2"><div className="skeleton h-10" /><div className="skeleton h-10" /></div>
              : !days.length ? <p className="py-3 text-sm text-neutral-500">Nothing scheduled this week.</p>
              : days.map((day) => (
                <div key={day.date} className="grid grid-cols-[64px_1fr] gap-2 border-t border-white/[0.06] py-2.5 first:border-0">
                  <div><div className={cn("text-[13px] font-semibold", day.date === t ? "text-white" : "text-neutral-300")}>{day.date === t ? "Today" : new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}</div>
                    <div className="text-xs text-neutral-500">{new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div></div>
                  <div className="min-w-0 space-y-1.5">
                    {day.evs.map((e) => (
                      <Link key={e.id} href={e.href} className="flex items-start gap-2 hover:opacity-80">
                        <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", KIND_DOT[e.kind])} />
                        <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-neutral-100">{e.title}</span>{e.sub ? <span className="block truncate text-xs text-neutral-500">{e.sub}</span> : null}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center"><h3 className="text-[15px] font-semibold text-white">Pipeline</h3><Link href="/" className="ml-auto text-xs font-semibold text-neutral-500 hover:text-white">All jobs</Link></div>
            {PIPELINE.map((s) => {
              const n = a?.counts[s] ?? 0;
              const max = Math.max(1, ...PIPELINE.map((x) => a?.counts[x] ?? 0));
              return (
                <Link key={s} href={`/?stage=${s}`} className="grid grid-cols-[92px_1fr_28px] items-center gap-2 py-1.5 text-[13px] hover:opacity-80">
                  <span className="text-neutral-400">{STATUS_META[s].label}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><span className={cn("block h-full rounded-full", s === "complete" ? "bg-emerald-400" : "bg-white/80")} style={{ width: `${(n / max) * 100}%` }} /></span>
                  <span className="text-right font-semibold tabular-nums text-white">{n}</span>
                </Link>
              );
            })}
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-[15px] font-semibold text-white">Quick add</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => openNew("receipt")}><Camera size={15} /> Receipt</Button>
              <Button variant="outline" size="sm" onClick={() => openNew("lead")}><UserPlus size={15} /> Lead</Button>
              <Button variant="outline" size="sm" onClick={() => openNew("task")}><ListChecks size={15} /> Task</Button>
              <Button variant="outline" size="sm" onClick={() => openNew("job")}><Plus size={15} /> Job</Button>
            </div>
            <Link href="/today" className="mt-3 block text-xs font-semibold text-neutral-500 hover:text-white">Open the day sheet (game plan, follow-up emails)</Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
