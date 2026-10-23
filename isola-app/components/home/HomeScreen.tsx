"use client";
// v4.6 Home: a one-line brief, the money at a glance, a "needs attention" list you can
// clear (Linear inbox), today on site, and the next 7 days on the right.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAttention, type AttnItem, type Level } from "@/lib/attention";
import { STATUS_META, PIPELINE, fmtDate, todayISO, revenueOf, jobLabel, daysSince } from "@/lib/format";
import { openNew } from "@/components/SearchPalette";
import PayHeadline from "@/components/home/PayHeadline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stat, Empty, SectionTitle } from "@/components/ui/bits";
import { Segmented } from "@/components/ui/tabs";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { typeOf, timeWindow, isOutside } from "@/lib/schedule";
import { Check, Clock, Navigation, Camera, UserPlus, ListChecks, Plus, ChevronRight, CalendarDays, Sparkles, X } from "lucide-react";

const DOT: Record<Level, string> = { high: "bg-red-400", mid: "bg-amber-400", low: "bg-neutral-500" };
const KIND_DOT: Record<string, string> = { work: "bg-brand", visit: "bg-emerald-400", task: "bg-neutral-500", start: "bg-brand", invoice: "bg-amber-400" };
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
  // which money tile is open: tapping a tile lists what makes up its number
  const [tile, setTile] = useState<null | "owed" | "pipeline" | "booked" | "invoice">(null);
  const pick = (k: NonNullable<typeof tile>) => setTile((cur) => (cur === k ? null : k));
  const [today, setToday] = useState<any[] | null>(null);
  const t = todayISO();

  useEffect(() => {
    const go = () => sb.from("schedule_entries").select("id,label,job_id,assignee,assignees,sort,item_type,company,qty,start_time,end_time,status,jobs(id,job_name,customer,location)").eq("entry_date", t).neq("status", "cancelled").order("start_time", { nullsFirst: false }).order("sort").then(({ data }: any) => setToday(data ?? []));
    window.addEventListener("isola:changed", go);
    return () => window.removeEventListener("isola:changed", go);
  }, [sb, t]);
  useEffect(() => {
    sb.from("schedule_entries").select("id,label,job_id,assignee,assignees,sort,item_type,company,qty,start_time,end_time,status,jobs(id,job_name,customer,location)").eq("entry_date", t).neq("status", "cancelled").order("start_time", { nullsFirst: false }).order("sort").then(({ data }: any) => setToday(data ?? []));
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
    const unconfirmed = (today ?? []).filter((e: any) => isOutside(e) && (e.status ?? "scheduled") === "scheduled").length;
    const lead = parts.length ? `${parts.slice(0, 3).join(", ")}.` : "Nothing urgent.";
    return `${lead} ${crew ? `${crew} thing${crew === 1 ? "" : "s"} on the schedule today${unconfirmed ? `, ${unconfirmed} not confirmed` : ""}.` : "Nothing on the board today."}`;
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

      <PayHeadline />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {a ? <>
          <Stat label="Owed to me" value={k$(a.money.totalAr)} hint={a.money.overdue ? <span className="text-red-300">{k$(a.money.overdue)} overdue</span> : a.money.asOf ? `QuickBooks as of ${fmtDate(a.money.asOf).replace(/^\w+, /, "")}` : undefined} onClick={() => pick("owed")} className={cn(tile === "owed" && "border-white/30")} />
          <Stat label="Waiting on approval" value={k$(a.money.pipeline)} hint={`${a.counts.awaiting ?? 0} proposals out`} onClick={() => pick("pipeline")} className={cn(tile === "pipeline" && "border-white/30")} />
          <Stat label="Booked work" value={k$(a.money.booked)} hint={`${(a.counts.booked ?? 0) + (a.counts.progress ?? 0)} jobs booked or running`} onClick={() => pick("booked")} className={cn(tile === "booked" && "border-white/30")} />
          <Stat label="Ready to invoice" value={k$(a.money.toInvoice)} tone={a.money.toInvoice ? "warn" : undefined} hint={a.badges.jobs ? `${a.badges.jobs} finished, not invoiced` : "All caught up"} onClick={() => pick("invoice")} className={cn(tile === "invoice" && "border-white/30")} />
        </> : [0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[86px]" />)}
      </div>
      {a && tile ? <TileList kind={tile} a={a} onClose={() => setTile(null)} /> : null}

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
                  (() => {
                    const ty = typeOf(e);
                    const Icon = ty.icon;
                    const st = e.status ?? "scheduled";
                    return (
                      <Link key={e.id} href={e.job_id ? `/jobs/${e.job_id}?tab=schedule` : "/schedule"} className={cn("flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-white/20", st === "done" && "opacity-60")}>
                        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]", ty.tint)}><Icon size={17} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-white">
                            {e.start_time ? <span className="tabular-nums text-neutral-300">{timeWindow(e)} · </span> : null}{e.jobs?.job_name || e.jobs?.customer || e.label || ty.label}
                          </span>
                          <span className="block truncate text-xs text-neutral-400">
                            {(isOutside(e) ? [e.company || ty.label, e.qty] : [e.item_type && e.item_type !== "crew" ? ty.label : null, e.company, e.assignee, e.jobs?.location]).filter(Boolean).join(" · ") || "—"}
                          </span>
                        </span>
                        {st === "confirmed" ? <Check size={15} className="shrink-0 text-emerald-300" aria-label="Confirmed" />
                          : isOutside(e) && st === "scheduled" ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Not confirmed" /> : null}
                      </Link>
                    );
                  })()
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

// ---------------- what's behind each money tile ----------------
const money$ = (n: number) => "$" + Math.round(n).toLocaleString();
function TileList({ kind, a, onClose }: { kind: "owed" | "pipeline" | "booked" | "invoice"; a: NonNullable<ReturnType<typeof useAttention>>; onClose: () => void }) {
  type Row = { key: string; title: string; sub: string; amount: number; href: string; tone?: "bad" | "warn" };
  const jobs = a.jobs;
  const norm = (x: string) => x.replace(/\s/g, "").toLowerCase();
  const byRef = (ref: string) => jobs.find((j) => String(j.qbo_invoice_ref ?? "").split(",").map(norm).includes(norm(String(ref))));
  let title = ""; let rows: Row[] = []; let all = { href: "/", label: "All jobs" };
  if (kind === "owed") {
    title = "Owed to me — open QuickBooks invoices";
    all = { href: "/money", label: "Money tab" };
    rows = [...a.invoices].sort((x, y) => (y.days_overdue ?? 0) - (x.days_overdue ?? 0) || y.amount - x.amount).map((i: any) => {
      const j = byRef(i.ref);
      const late = Number(i.days_overdue ?? 0);
      return {
        key: "inv" + i.ref, title: j ? jobLabel(j) : i.customer,
        sub: `Invoice #${i.ref}${j ? " · " + i.customer : ""} · ${late > 0 ? `${late} days overdue` : `due ${fmtDate(i.due).replace(/^\w+, /, "")}`}`,
        amount: Number(i.amount ?? 0), href: j ? `/jobs/${j.id}?tab=money` : "/money", tone: late > 30 ? "bad" : late > 0 ? "warn" : undefined,
      };
    });
  } else {
    const pickJobs = kind === "pipeline" ? jobs.filter((x) => x.status === "awaiting")
      : kind === "booked" ? jobs.filter((x) => x.status === "booked" || x.status === "progress")
      : jobs.filter((x) => x.status === "complete" && !x.invoiced_date && !x.paid_date);
    title = kind === "pipeline" ? "Waiting on approval — proposals out" : kind === "booked" ? "Booked work — booked or running" : "Ready to invoice — finished, not invoiced";
    if (kind === "pipeline") all = { href: "/proposals", label: "Proposals" };
    rows = pickJobs.map((j) => {
      const d = kind === "pipeline" && j.quoted_date ? daysSince(j.quoted_date) : null;
      const sub = kind === "pipeline" ? (j.quoted_date ? `Sent ${fmtDate(j.quoted_date).replace(/^\w+, /, "")} · ${d} days out` : "Sent, no date")
        : kind === "booked" ? `${STATUS_META[j.status]?.label ?? j.status}${j.start_date ? " · starts " + fmtDate(j.start_date).replace(/^\w+, /, "") : ""}`
        : `Finished ${j.completed_date ? fmtDate(j.completed_date).replace(/^\w+, /, "") : ""}`;
      return { key: j.id, title: jobLabel(j), sub, amount: revenueOf(j), href: `/jobs/${j.id}`, tone: d != null && d > 30 ? "bad" : d != null && d > 14 ? "warn" : undefined } as Row;
    }).sort((x, y) => y.amount - x.amount);
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Card className="-mt-3 mb-6 p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[15px] font-semibold text-white">{title}</h3>
        <span className="text-sm tabular-nums text-neutral-400">{rows.length} · {money$(total)}</span>
        <Link href={all.href} className="ml-auto text-xs font-semibold text-neutral-500 hover:text-white">{all.label}</Link>
        <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-neutral-500 hover:bg-white/5 hover:text-white"><X size={16} /></button>
      </div>
      {rows.length ? (
        <div className="divide-y divide-white/[0.06]">
          {rows.map((r) => (
            <Link key={r.key} href={r.href} className="flex items-center gap-3 py-2.5 hover:opacity-80">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{r.title}</span>
                <span className={cn("block truncate text-xs", r.tone === "bad" ? "text-red-300" : r.tone === "warn" ? "text-amber-300" : "text-neutral-500")}>{r.sub}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{money$(r.amount)}</span>
              <ChevronRight size={15} className="shrink-0 text-neutral-600" />
            </Link>
          ))}
        </div>
      ) : <p className="text-sm text-neutral-500">Nothing here right now.</p>}
      {kind === "owed" && a.money.asOf ? <p className="mt-2 text-xs text-neutral-500">From QuickBooks as of {fmtDate(a.money.asOf).replace(/^\w+, /, "")}. Tap one to open its job.</p> : null}
    </Card>
  );
}
