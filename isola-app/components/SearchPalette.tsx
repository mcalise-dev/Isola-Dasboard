"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as D from "@radix-ui/react-dialog";
import { createClient } from "@/lib/supabase/client";
import { STATUS_META, fmtPrice } from "@/lib/format";
import { ALL_ITEMS } from "@/lib/nav";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/bits";
import {
  Search, Briefcase, Building2, FileText, Plus, Camera, ListChecks, Target, CornerDownLeft, UserPlus,
} from "lucide-react";

// v4.6 command bar (Linear style): search jobs, customers, targets and invoices, jump to
// any screen, or run an action — "/" or Ctrl-K anywhere, or the search box in the top bar.
export function openSearch() { window.dispatchEvent(new Event("isola:search")); }
export const openNew = (what: "job" | "receipt" | "lead" | "task" | "target") => {
  if (what === "job") window.dispatchEvent(new CustomEvent("isola:new-job"));
  else if (what === "target") window.location.href = "/marketing/targets?new=1";
  else window.dispatchEvent(new CustomEvent("isola:quickadd", { detail: what }));
};

export function SearchButton() {
  return (
    <button onClick={openSearch} aria-label="Search and commands"
      className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-neutral-400 hover:border-white/20 hover:text-neutral-200 md:w-[420px]">
      <Search size={16} />
      <span className="hidden sm:inline truncate text-sm">Search or run a command…</span>
      <span className="ml-auto hidden md:flex items-center gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
    </button>
  );
}

export default function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ jobs: any[]; customers: any[]; invoices: any[]; contacts: any[] } | null>(null);

  useEffect(() => {
    const on = () => { setQ(""); setData(null); setOpen(true); };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); on(); }
      // quick keys (desktop): N = new job, G then H/J/M = go home/jobs/money
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === "n" || e.key === "N") { e.preventDefault(); openNew("job"); }
      }
    };
    window.addEventListener("isola:search", on);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("isola:search", on); window.removeEventListener("keydown", key); };
  }, []);

  useEffect(() => {
    if (!open || data) return;
    const sb = createClient();
    Promise.all([
      sb.from("jobs").select("id,job_name,customer,location,job,status,price,qbo_invoice_ref,updated_at").order("updated_at", { ascending: false }),
      sb.from("customers").select("id,name,contact_name,phone,email,address,qbo_names"),
      sb.from("money_snapshot").select("data").eq("id", 1).maybeSingle(),
      sb.from("contacts").select("id,name,company,tier,stage"),
    ]).then(([j, c, m, ct]) => setData({ jobs: j.data ?? [], customers: c.data ?? [], invoices: ((m.data as any)?.data?.invoices ?? []), contacts: ct.data ?? [] }));
  }, [open, data]);

  function go(href: string) { setOpen(false); router.push(href); }
  function run(f: () => void) { setOpen(false); setTimeout(f, 60); }

  const hasQ = q.trim().length > 0;
  const jobs = data?.jobs ?? [];
  const shownJobs = hasQ ? jobs.slice(0, 200) : jobs.slice(0, 6);

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[75] bg-black/70 anim-fade" />
        <D.Content className="fixed z-[76] inset-0 md:inset-auto md:left-1/2 md:top-[12vh] md:-translate-x-1/2 md:w-[640px] md:max-w-[calc(100vw-2rem)] overflow-hidden md:rounded-2xl md:border border-border bg-neutral-950 shadow-[0_24px_60px_rgba(0,0,0,.7)] anim-pop pt-[env(safe-area-inset-top)] md:pt-0 focus:outline-none">
          <D.Title className="sr-only">Search and commands</D.Title>
          <Command loop>
            <CommandInput value={q} onValueChange={setQ} placeholder="Job, customer, address, invoice #, or a command…" autoFocus />
            <CommandList className="max-h-[calc(100dvh-60px)] md:max-h-[60vh]">
              <CommandEmpty>Nothing matches “{q}”.</CommandEmpty>
              {!hasQ ? (
                <CommandGroup heading="Actions">
                  <CommandItem value="new job" onSelect={() => run(() => openNew("job"))}><Plus size={16} /> New job <Kbd className="ml-auto">N</Kbd></CommandItem>
                  <CommandItem value="new lead" onSelect={() => run(() => openNew("lead"))}><UserPlus size={16} /> New lead</CommandItem>
                  <CommandItem value="snap receipt" onSelect={() => run(() => openNew("receipt"))}><Camera size={16} /> Snap a receipt</CommandItem>
                  <CommandItem value="new task" onSelect={() => run(() => openNew("task"))}><ListChecks size={16} /> New task</CommandItem>
                  <CommandItem value="new marketing target" onSelect={() => run(() => openNew("target"))}><Target size={16} /> New marketing target</CommandItem>
                </CommandGroup>
              ) : null}
              {shownJobs.length ? (
                <CommandGroup heading={hasQ ? "Jobs" : "Recent jobs"}>
                  {shownJobs.map((j) => (
                    <CommandItem key={j.id} value={`job ${j.job_name ?? ""} ${j.customer ?? ""} ${j.location ?? ""} ${j.job ?? ""} ${j.qbo_invoice_ref ?? ""} ${j.id}`} onSelect={() => go(`/jobs/${j.id}`)}>
                      <Briefcase size={16} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-white">{j.job_name || j.customer}</span>
                        <span className="block truncate text-xs text-neutral-500">{[j.job_name ? j.customer : null, j.location, fmtPrice(j.price)].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="shrink-0 text-xs text-neutral-400">{STATUS_META[j.status]?.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {hasQ && data ? (
                <>
                  <CommandGroup heading="Customers">
                    {data.customers.map((c) => (
                      <CommandItem key={c.id} value={`customer ${c.name} ${c.contact_name ?? ""} ${c.phone ?? ""} ${c.email ?? ""} ${c.address ?? ""} ${(c.qbo_names ?? []).join(" ")} ${c.id}`} onSelect={() => go(`/customers/${c.id}`)}>
                        <Building2 size={16} />
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-white">{c.name}</span>
                          <span className="block truncate text-xs text-neutral-500">{[c.contact_name, c.phone, c.email].filter(Boolean).join(" · ")}</span></span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup heading="Marketing targets">
                    {data.contacts.map((c) => (
                      <CommandItem key={c.id} value={`target ${c.name} ${c.company ?? ""} ${c.id}`} onSelect={() => go(`/marketing/targets?c=${c.id}`)}>
                        <Target size={16} />
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-white">{c.name}</span>
                          <span className="block truncate text-xs text-neutral-500">{[c.company, c.tier ? `Tier ${c.tier}` : null, c.stage].filter(Boolean).join(" · ")}</span></span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup heading="Open invoices">
                    {data.invoices.map((i: any) => {
                      const job = data.jobs.find((j) => j.qbo_invoice_ref && String(j.qbo_invoice_ref) === String(i.ref));
                      return (
                        <CommandItem key={i.ref} value={`invoice ${i.ref} ${i.customer} ${i.amount}`} onSelect={() => go(job ? `/jobs/${job.id}` : "/money")}>
                          <FileText size={16} />
                          <span className="min-w-0 flex-1"><span className="block truncate font-medium text-white">Invoice {i.ref}</span>
                            <span className="block truncate text-xs text-neutral-500">{i.customer} · ${Number(i.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}{i.days_overdue > 0 ? ` · ${i.days_overdue} days late` : ""}</span></span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              ) : null}
              <CommandGroup heading="Go to">
                {ALL_ITEMS.map(({ group, item }) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem key={item.href} value={`go ${item.label} ${group?.label ?? ""}`} onSelect={() => go(item.href)}>
                      <Icon size={16} /> {item.label}
                      <span className="ml-auto text-xs text-neutral-500">{group?.label}</span>
                      <CornerDownLeft size={14} className="hidden" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
