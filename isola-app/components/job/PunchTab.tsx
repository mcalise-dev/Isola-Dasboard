"use client";
// v90 Punch list tab — the end of the job: everything left before we get out and bill.
// Closeout strip on top (punch items → client sign-off → mark complete → invoice → paid),
// then the punch list itself (photos, client link, sign-off).
import { useState } from "react";
import PunchList from "@/components/PunchList";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Check, ArrowRight } from "lucide-react";

export default function PunchTab({ job, onStep, onMoney, onCount }: {
  job: any;
  onStep: (key: "complete" | "invoiced" | "paid") => void;
  onMoney: () => void;
  onCount?: (open: number) => void;
}) {
  const [items, setItems] = useState<{ done: boolean }[] | null>(null);
  const [share, setShare] = useState<{ signed_off_at: string | null; signed_off_by: string | null } | null>(null);
  const open = (items ?? []).filter((i) => !i.done).length;
  const total = items?.length ?? 0;
  const complete = ["complete"].includes(job.status) || !!job.completed_date;

  const steps: { label: string; sub: string; done: boolean; action?: React.ReactNode }[] = [
    { label: "Punch items done", sub: items === null ? "…" : total === 0 ? "Nothing on the list yet" : open ? `${open} of ${total} still open` : `All ${total} done`, done: items !== null && total > 0 && open === 0 },
    ...(share ? [{ label: "Client signed off", sub: share.signed_off_at ? `${share.signed_off_by ?? "Client"} · ${fmtDate(share.signed_off_at.slice(0, 10))}` : "Waiting on the client link", done: !!share.signed_off_at }] : []),
    { label: "Job marked complete", sub: complete ? fmtDate(job.completed_date) : "Off the site, crew's done", done: complete,
      action: complete ? null : <Button size="sm" variant={open ? "outline" : "default"} onClick={() => onStep("complete")}>Mark complete</Button> },
    { label: "Invoiced", sub: job.invoiced_date ? fmtDate(job.invoiced_date) : job.billing_type === "tm" ? "Final T&M bill: hours + materials" : "Send the final bill", done: !!job.invoiced_date,
      action: job.invoiced_date ? null : <span className="flex gap-1.5"><Button size="sm" variant="ghost" onClick={onMoney}>Bill <ArrowRight size={14} /></Button><Button size="sm" variant={complete && !open ? "default" : "outline"} onClick={() => onStep("invoiced")}>Mark invoiced</Button></span> },
    { label: "Paid", sub: job.paid_date ? fmtDate(job.paid_date) : "—", done: !!job.paid_date,
      action: job.paid_date || !job.invoiced_date ? null : <Button size="sm" variant="outline" onClick={() => onStep("paid")}>Mark paid</Button> },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
        <h2 className="mb-1 text-[17px] font-semibold text-white">Get out & bill</h2>
        <p className="mb-2 text-sm text-neutral-400">Finish the punch list, close the job, send the bill.</p>
        <ol className="divide-y divide-white/[0.05]">
          {steps.map((s, i) => (
            <li key={s.label} className="flex min-h-[52px] items-center gap-3 py-2">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", s.done ? "bg-emerald-500/20 text-emerald-300" : "bg-white/[0.06] text-neutral-300")}>{s.done ? <Check size={14} /> : i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-semibold", s.done ? "text-neutral-400" : "text-white")}>{s.label}</span>
                <span className="block truncate text-xs text-neutral-500">{s.sub}</span>
              </span>
              {s.action}
            </li>
          ))}
        </ol>
      </section>
      <section id="sec-punch" className="scroll-mt-24">
        <PunchList jobId={job.id} onChange={(it, sh) => { setItems(it); setShare(sh); onCount?.(it.filter((x) => !x.done).length); }} />
      </section>
    </div>
  );
}
