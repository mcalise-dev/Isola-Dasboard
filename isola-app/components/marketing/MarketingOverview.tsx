"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ArrowRight, Megaphone, Target as TargetIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { todayISO } from "@/lib/format";
import { PageHeader, Stat, Skeleton, Empty, SectionTitle } from "@/components/ui/bits";
import SourceHealth from "@/components/marketing/cc/SourceHealth";
import { Segmented } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MContact, TierBadge, addDays, rel, isFollowDue, isOpen, jobPrice, daysBetween } from "./lib";

type Range = "year" | "90" | "all";
const WON = ["booked", "progress", "complete"];
const QUOTED = ["awaiting", "booked", "progress", "complete", "lost"];
const usd0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const wonDate = (j: any): string => (j.won_date || j.start_date || j.completed_date || String(j.created_at ?? "").slice(0, 10)) as string;

export default function MarketingOverview() {
  const sb = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState<MContact[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("year");

  useEffect(() => {
    (async () => {
      const [c, j] = await Promise.all([
        sb.from("contacts").select("id,name,company,tier,stage,last_touch,next_action,next_date,campaign_id"),
        sb.from("jobs").select("id,job_name,customer,status,price,price_amount,quoted_date,won_date,start_date,completed_date,created_at,lead_source"),
      ]);
      setContacts((c.data as any) ?? []);
      setJobs(j.data ?? []);
      setLoading(false);
    })();
  }, [sb]);

  const today = todayISO();
  const from = range === "year" ? today.slice(0, 4) + "-01-01" : range === "90" ? addDays(today, -90) : "0000-01-01";
  const inRange = (iso: string | null | undefined) => !!iso && iso.slice(0, 10) >= from;

  const m = useMemo(() => {
    const active = contacts.filter((c) => isOpen(c) && c.tier !== "Broker").length;
    const due = contacts.filter(isFollowDue);
    const monthStart = today.slice(0, 7) + "-01";
    const touched = contacts.filter((c) => c.last_touch && c.last_touch >= monthStart).length;
    const won = jobs.filter((j) => WON.includes(j.status) && inRange(wonDate(j)));
    const inq = jobs.filter((j) => inRange(String(j.created_at).slice(0, 10)));
    const quoted = inq.filter((j) => QUOTED.includes(j.status) && (j.quoted_date || j.status !== "lost"));
    const wonInq = inq.filter((j) => WON.includes(j.status));
    // channels
    const ch = new Map<string, { inq: number; quoted: number; won: number; dollars: number }>();
    inq.forEach((j) => {
      const k = j.lead_source?.trim() || "Not set";
      const r = ch.get(k) ?? { inq: 0, quoted: 0, won: 0, dollars: 0 };
      r.inq++;
      if (QUOTED.includes(j.status) && (j.quoted_date || j.status !== "lost")) r.quoted++;
      if (WON.includes(j.status)) { r.won++; r.dollars += jobPrice(j); }
      ch.set(k, r);
    });
    const channels = [...ch.entries()].sort((a, b) => b[1].dollars - a[1].dollars || b[1].inq - a[1].inq);
    // chart: last 12 months
    const months: { key: string; label: string; won: number }[] = [];
    const [y, mo] = today.split("-").map(Number);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(y, mo - 1 - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleDateString("en-US", { month: "short" }), won: 0 });
    }
    jobs.filter((j) => WON.includes(j.status)).forEach((j) => {
      const k = wonDate(j)?.slice(0, 7);
      const row = months.find((x) => x.key === k);
      if (row) row.won += jobPrice(j);
    });
    const aStale = contacts.filter((c) => c.tier === "A" && isOpen(c) && (!c.last_touch || daysBetween(c.last_touch, today) > 30));
    return {
      active, due, touched, won, wonDollars: won.reduce((a, j) => a + jobPrice(j), 0),
      inq, quoted, wonInq, wonInqDollars: wonInq.reduce((a, j) => a + jobPrice(j), 0), channels, months, aStale,
      unset: inq.filter((j) => !j.lead_source).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, jobs, range]);

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");
  const rangeLabel = range === "year" ? "this year" : range === "90" ? "last 90 days" : "all time";

  return (
    <div>
      <PageHeader title="Marketing command center" sub="Is marketing turning into work? CRM numbers below come from your jobs and prospects; connector numbers appear only once a source is connected."
        actions={<>
          <Segmented<Range> value={range} onChange={setRange} options={[{ value: "year", label: "This year" }, { value: "90", label: "90 days" }, { value: "all", label: "All" }]} />
          <Button asChild size="sm"><Link href="/marketing/targets?view=due">Work follow-ups</Link></Button>
        </>} />

      <SourceHealth />
      {loading ? (
        <div className="space-y-3"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[84px]" />)}</div><Skeleton className="h-64" /><Skeleton className="h-48" /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Link href="/marketing/targets?view=all"><Stat label="Active targets" value={m.active} hint="Not won, dead or client" className="w-full h-full" /></Link>
            <Link href="/marketing/targets?view=due"><Stat label="Follow-ups due" value={m.due.length} tone={m.due.length ? "warn" : undefined} hint="Due today or earlier" className="w-full h-full" /></Link>
            <Stat label="Touched this month" value={m.touched} hint="Contacts with a logged touch" />
            <Stat label={`Jobs won ${rangeLabel}`} value={m.won.length} tone={m.won.length ? "ok" : undefined} hint={usd0(m.wonDollars) + " won"} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <section>
              <SectionTitle>Lead funnel</SectionTitle>
              <div className="rounded-xl border border-border bg-card p-4">
                {[
                  { label: "Inquiries", n: m.inq.length, sub: "Every job created in range" },
                  { label: "Quoted", n: m.quoted.length, sub: pct(m.quoted.length, m.inq.length) + " of inquiries" },
                  { label: "Won", n: m.wonInq.length, sub: `${pct(m.wonInq.length, m.quoted.length)} of quoted · ${usd0(m.wonInqDollars)}` },
                ].map((s, i, arr) => (
                  <div key={s.label} className="mb-3 last:mb-0">
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-semibold text-white">{s.label}</span>
                      <span className="text-neutral-400 tabular-nums"><span className="text-white font-semibold">{s.n}</span> · {s.sub}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className={i === arr.length - 1 ? "h-full rounded-full bg-emerald-400/80" : "h-full rounded-full bg-white/70"} style={{ width: (arr[0].n ? Math.max(2, (s.n / arr[0].n) * 100) : 0) + "%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <SectionTitle>Won by month</SectionTitle>
              <div className="h-[196px] rounded-xl border border-border bg-card p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={m.months} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: "#a3a3a3", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fill: "#737373", fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)} />
                    <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, color: "#fff", fontSize: 12 }}
                      formatter={(v: any) => [usd0(Number(v)), "Won"]} />
                    <Bar dataKey="won" fill="#e5e5e5" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section>
            <SectionTitle right={m.unset ? <span className="text-xs text-amber-300">{m.unset} job{m.unset === 1 ? "" : "s"} with no lead source</span> : null}>Channel results</SectionTitle>
            {m.channels.length === 0 ? (
              <Empty title="No jobs in this range" body="Pick a wider range above." />
            ) : (
              <TableWrap>
                <Table>
                  <THead><TR><TH>Lead source</TH><TH className="text-right">Inquiries</TH><TH className="text-right">Quoted</TH><TH className="text-right">Won</TH><TH className="text-right">Won $</TH></TR></THead>
                  <TBody>
                    {m.channels.map(([k, r]) => (
                      <TR key={k}>
                        <TD className={k === "Not set" ? "text-neutral-400" : "font-medium text-white"}>{k}</TD>
                        <TD className="text-right tabular-nums">{r.inq}</TD>
                        <TD className="text-right tabular-nums">{r.quoted}</TD>
                        <TD className="text-right tabular-nums">{r.won}</TD>
                        <TD className="text-right tabular-nums font-semibold text-white">{usd0(r.dollars)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
            {m.unset ? <p className="mt-2 text-xs text-neutral-500">Set a lead source on each job (open the job, edit, Lead source) so this table can show which channels bring in work.</p> : null}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <SectionTitle right={<Link href="/marketing/targets?view=due" className="text-[13px] text-neutral-400 hover:text-white">All due <ArrowRight className="inline" size={13} /></Link>}>Overdue follow-ups</SectionTitle>
              {m.due.length === 0 ? <Empty icon={<TargetIcon size={20} />} title="Nothing due" body="Every target's next follow-up is in the future." /> : (
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                  {[...m.due].sort((a, b) => (a.next_date ?? "").localeCompare(b.next_date ?? "")).slice(0, 8).map((c) => (
                    <Link key={c.id} href={`/marketing/targets?c=${c.id}`} className="flex min-h-[52px] items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
                      <TierBadge tier={c.tier} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">{c.name}</div>
                        <div className="truncate text-xs text-neutral-400">{c.next_action || "Follow up"}{c.company ? ` · ${c.company}` : ""}</div>
                      </div>
                      <span className={(c.next_date ?? "") < today ? "shrink-0 text-xs font-semibold text-red-300" : "shrink-0 text-xs font-semibold text-amber-300"}>{rel(c.next_date)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <section>
              <SectionTitle right={<Link href="/marketing/targets?view=a" className="text-[13px] text-neutral-400 hover:text-white">A tier <ArrowRight className="inline" size={13} /></Link>}>A-tier untouched 30+ days</SectionTitle>
              {m.aStale.length === 0 ? <Empty icon={<Megaphone size={20} />} title="A tier is warm" body="Every A-tier target was touched in the last 30 days." /> : (
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                  {m.aStale.slice(0, 8).map((c) => (
                    <Link key={c.id} href={`/marketing/targets?c=${c.id}`} className="flex min-h-[52px] items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
                      <TierBadge tier={c.tier} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">{c.name}</div>
                        <div className="truncate text-xs text-neutral-400">{c.company ?? ""}</div>
                      </div>
                      <span className="shrink-0 text-xs text-neutral-400">{c.last_touch ? rel(c.last_touch) : "Never touched"}</span>
                    </Link>
                  ))}
                  {m.aStale.length > 8 ? <div className="px-3 py-2 text-xs text-neutral-500">+{m.aStale.length - 8} more</div> : null}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
