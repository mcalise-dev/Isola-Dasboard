"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, fmtDate } from "@/lib/format";
import { withTimeout } from "@/lib/load";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { showError, showToast } from "@/components/Toaster";
import { copyText } from "@/components/Dialogs";
import { PageHeader, SectionTitle, Stat, Empty, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import Link from "next/link";
import ThmStatement from "@/components/field/ThmStatement";
import { AlertTriangle, BookOpen, Check, Copy, Link2, Receipt, Trash2, Truck } from "lucide-react";

type Entry = {
  id: string;
  entry_date: string | null;
  description: string;
  ref: string | null;
  side: "owes_isola" | "owes_thm";
  amount: number;
  bucket: string;
  is_open: boolean;
  sort: number;
};

export default function ThmTab() {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [thmJobs, setThmJobs] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  async function load() {
    setErr(null);
    try {
      const [{ data, error }, it] = await withTimeout(Promise.all([
        supabase.from("thm_ledger").select("*").order("bucket").order("sort"),
        supabase.from("thm_job_items").select("id,job_id,kind,category,label,vendor,status,submitted_by,amount,entry_date,receipt_mime,jobs(id,job_name,customer,contract_holder,thm_deal,status)"),
      ]));
      // every job THM is on shows here, even before it has any THM lines
      const tj = await supabase.from("jobs").select("id,job_name,customer,contract_holder,thm_deal,status,updated_at")
        .or("partner.eq.THM,contract_holder.eq.thm").neq("status", "lost");
      setThmJobs(tj.data ?? []);
      const lk = await supabase.from("thm_submit_links").select("token").eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      setLink(lk.data?.token ?? null);
      if (error) throw new Error(error.message);
      setEntries((data as Entry[]) ?? []);
      setItems(it.error ? [] : (it.data ?? []));
    } catch (e: any) {
      setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Tyler's receipts land as "submitted" — nothing counts until Mike approves.
  async function approve(id: string) {
    setBusy(id);
    const { error } = await supabase.from("thm_job_items").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", id);
    setBusy("");
    if (error) return showError("Couldn't approve: " + error.message);
    showToast("Approved — it's on the tab");
    load();
  }
  async function reject(id: string) {
    if (!confirm("Remove this receipt? It won't go on the tab.")) return;
    setBusy(id);
    const { error } = await supabase.from("thm_job_items").delete().eq("id", id);
    setBusy("");
    if (error) return showError("Couldn't remove: " + error.message);
    load();
  }
  async function viewReceipt(id: string) {
    const w = window.open("", "_blank");
    const { data, error } = await supabase.from("thm_job_items").select("receipt_b64").eq("id", id).maybeSingle();
    if (error || !data?.receipt_b64) { w?.close(); return showError("No receipt on that one."); }
    if (w) w.document.write(`<title>Receipt</title><body style="margin:0;background:#111"><iframe src="${data.receipt_b64}" style="border:0;width:100vw;height:100vh"></iframe></body>`);
  }
  async function newLink() {
    if (link && !confirm("Make a new link? The old one Tyler has will stop working.")) return;
    const a = new Uint8Array(12); crypto.getRandomValues(a);
    const token = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    if (link) await supabase.from("thm_submit_links").update({ active: false }).eq("token", link);
    const { error } = await supabase.from("thm_submit_links").insert({ token, label: "Tyler" });
    if (error) return showError("Couldn't make the link: " + error.message);
    setLink(token);
    copyText(`${window.location.origin}/thm-submit/${token}`, "New link copied");
  }

  const header = (
    <PageHeader
      title="THM tab"
      sub="What you and THM owe each other, job by job, plus the Invoice #94 history"
    />
  );

  if (err) return <div>{header}<LoadError message={err} onRetry={load} /></div>;
  if (!entries) return <div>{header}<ListSkeleton /></div>;

  const inv94 = entries.filter((e) => e.bucket === "inv94");
  const standalone = entries.filter((e) => e.bucket !== "inv94");
  const sum = (list: Entry[], side: string) => list.filter((e) => e.side === side && !e.is_open).reduce((a, e) => a + Number(e.amount), 0);
  const inv94Balance = sum(inv94, "owes_isola") - sum(inv94, "owes_thm");
  const standaloneBal = sum(standalone, "owes_isola") - sum(standalone, "owes_thm");
  const openItems = entries.filter((e) => e.is_open);

  // v5.8 running tab: every job THM is on, from its THM lines (job record > THM tab).
  // Isola holds the contract -> Isola owes THM. THM holds it -> THM owes Isola.
  const jobs = new Map<string, { id: string; name: string; holder: string; deal: string; status: string; total: number; lines: number; last: string | null }>();
  const pendingItems = items.filter((it) => it.status === "submitted");
  for (const j of thmJobs) {
    jobs.set(j.id, { id: j.id, name: j.job_name || j.customer, holder: j.contract_holder, deal: j.thm_deal, status: j.status, total: 0, lines: 0, last: null });
  }
  for (const it of items) {
    const j = it.jobs;
    if (!j || it.status === "submitted") continue;
    const cur = jobs.get(j.id) ?? { id: j.id, name: j.job_name || j.customer, holder: j.contract_holder, deal: j.thm_deal, status: j.status, total: 0, lines: 0, last: null };
    cur.total += Number(it.amount || 0); cur.lines += 1;
    if (it.entry_date && (!cur.last || it.entry_date > cur.last)) cur.last = it.entry_date;
    jobs.set(j.id, cur);
  }
  const OPEN_FIRST: Record<string, number> = { progress: 0, booked: 1, future: 2, awaiting: 3, lead: 4, complete: 5 };
  const jobRows = [...jobs.values()].sort((a, b) =>
    (OPEN_FIRST[a.status] ?? 6) - (OPEN_FIRST[b.status] ?? 6) || String(b.last ?? "").localeCompare(String(a.last ?? "")));
  const running = sum(entries.filter((e) => e.bucket === "running"), "owes_isola") - sum(entries.filter((e) => e.bucket === "running"), "owes_thm");
  const tab = jobRows.reduce((a, j) => a + (j.holder === "thm" ? j.total : -j.total), 0) + running;
  const pending = jobRows.filter((j) => j.status !== "complete").reduce((a, j) => a + (j.holder === "thm" ? j.total : -j.total), 0);

  function row(e: Entry) {
    return (
      <div key={e.id} className={cn("flex items-start gap-3 border-b border-border px-4 py-3 last:border-0", e.is_open && "bg-amber-500/[0.06]")}>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{e.description}</div>
          <div className="text-xs text-neutral-400">
            {[e.ref, e.entry_date ? fmtDate(e.entry_date) : null].filter(Boolean).join(" · ")}
            {e.is_open ? <span className="text-amber-300">{" · OPEN — number pending"}</span> : ""}
          </div>
        </div>
        <div className={cn("shrink-0 text-sm font-bold tabular-nums", e.side === "owes_isola" ? "text-white" : "text-emerald-300")}>
          {e.is_open ? "—" : (e.side === "owes_thm" ? "−" : "") + money(Number(e.amount))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}

      <ThmStatement owner />

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="THM owes ISOLA — Invoice #94"
          value={money(inv94Balance)}
          hint={`$40,155.50 opening · ${money(sum(inv94, "owes_thm"))} applied`}
        />
        {standalone.length ? (
          <Stat label="Standalone (not part of #94)" value={money(standaloneBal)} hint="owed to ISOLA" />
        ) : null}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link2 size={18} className="shrink-0 text-neutral-400" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">Tyler's receipt link</div>
            <div className="text-xs text-neutral-400">Text it to him once. He picks the job, enters what he paid, snaps the receipt — it shows up below for you to approve.</div>
          </div>
          {link ? (
            <Button size="sm" onClick={() => copyText(`${window.location.origin}/thm-submit/${link}`, "Link copied — paste it to Tyler")}><Copy size={14} /> Copy link</Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={newLink}>{link ? "New link" : "Make link"}</Button>
        </div>
      </Card>

      {pendingItems.length ? (
        <section>
          <SectionTitle>Receipts from Tyler — approve to put them on the tab</SectionTitle>
          <Card className="overflow-hidden">
            {pendingItems.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-3 border-b border-border bg-amber-500/[0.05] px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">{it.label || "Materials"}</div>
                  <div className="text-xs text-neutral-400">
                    {[it.jobs?.job_name || it.jobs?.customer, it.vendor, it.entry_date ? fmtDate(it.entry_date) : null, it.submitted_by ? "from " + it.submitted_by : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="text-sm font-bold tabular-nums text-emerald-300">−{money(Number(it.amount))}</div>
                <div className="flex gap-1.5">
                  {it.receipt_mime ? <Button size="sm" variant="outline" onClick={() => viewReceipt(it.id)}><Receipt size={14} /> Receipt</Button> : null}
                  <Button size="sm" disabled={busy === it.id} onClick={() => approve(it.id)}><Check size={14} /> Approve</Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9" disabled={busy === it.id} onClick={() => reject(it.id)} aria-label="Remove"><Trash2 size={15} /></Button>
                </div>
              </div>
            ))}
          </Card>
          <p className="mt-1.5 text-xs text-neutral-500">Approved materials are what you owe THM at cost — they come off what THM owes you and count as a cost on that job.</p>
        </section>
      ) : null}

      {openItems.length ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{openItems.length} open item{openItems.length > 1 ? "s" : ""} not in the balance yet — tell Claude the number when you have it.</span>
        </div>
      ) : null}


      <section>
        <SectionTitle>Applied against Invoice #94</SectionTitle>
        {inv94.length ? <Card className="overflow-hidden">{inv94.map(row)}</Card>
          : <Empty icon={<BookOpen size={24} />} title="No entries yet" body="Job closeouts, payments and reimbursements against #94 show up here." />}
      </section>

      {standalone.length ? (
        <section>
          <SectionTitle>Standalone settlements</SectionTitle>
          <Card className="overflow-hidden">{standalone.map(row)}</Card>
        </section>
      ) : null}

      <p className="text-xs text-neutral-500">Green negative amounts pay the tab down. To log a new job closeout, payment, or reimbursement, tell Claude — the ledger and this tab stay in sync with QuickBooks Invoice #94.</p>
    </div>
  );
}
