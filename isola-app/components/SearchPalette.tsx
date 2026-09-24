"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STATUS_META } from "@/lib/format";
import { HUBS } from "@/lib/nav";
import { Search, Briefcase, Building2, FileText, CornerDownLeft, X } from "lucide-react";

// v4.3: one search box for the whole app — jobs, customers, addresses, invoice numbers,
// and the screens themselves. Opens from the header, or "/" / Ctrl-K on a keyboard.
type Hit = { kind: "job" | "customer" | "invoice" | "screen"; id: string; title: string; sub: string; go: () => void; tag?: string };

export function openSearch() { window.dispatchEvent(new Event("isola:search")); }

export function SearchButton() {
  return (
    <button onClick={openSearch} aria-label="Search"
      className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 px-3 min-h-[40px] md:w-80 min-w-0 hover:border-neutral-500">
      <Search size={18} />
      <span className="hidden sm:inline text-sm text-neutral-400 whitespace-nowrap truncate">Search jobs, customers, invoices…</span>
      <kbd className="hidden md:inline ml-auto text-xs text-neutral-400 border border-neutral-700 rounded px-1.5">/</kbd>
    </button>
  );
}

export default function SearchPalette() {
  const supabase = createClient();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [data, setData] = useState<{ jobs: any[]; customers: any[]; invoices: any[] } | null>(null);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = () => { setOpen(true); setQ(""); setSel(0); };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); on(); }
    };
    window.addEventListener("isola:search", on);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("isola:search", on); window.removeEventListener("keydown", key); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => box.current?.focus(), 30);
    Promise.all([
      supabase.from("jobs").select("id,job_name,customer,customer_id,location,job,status,price,qbo_invoice_ref,updated_at").order("updated_at", { ascending: false }),
      supabase.from("customers").select("id,name,contact_name,phone,email,address,qbo_names"),
      supabase.from("money_snapshot").select("data").eq("id", 1).maybeSingle(),
    ]).then(([j, c, m]) => setData({ jobs: j.data ?? [], customers: c.data ?? [], invoices: ((m.data as any)?.data?.invoices ?? []) }));
  }, [open]);

  function close() { setOpen(false); }
  function openJob(id: string) {
    close();
    if (path === "/") window.dispatchEvent(new CustomEvent("isola:open-job", { detail: id }));
    else router.push(`/?job=${id}`);
  }

  const hits: Hit[] = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const has = (s: string) => words.every((w) => s.toLowerCase().includes(w));
    const out: Hit[] = [];
    // screens
    if (words.length) {
      HUBS.forEach((h) => h.items.forEach((it) => {
        if (has(`${it.label} ${h.label}`)) out.push({ kind: "screen", id: it.href, title: it.label, sub: h.label, go: () => { close(); router.push(it.href); } });
      }));
    }
    if (!data) return out.slice(0, 4);
    const jobs = data.jobs.filter((j) => !words.length || has(`${j.job_name ?? ""} ${j.customer ?? ""} ${j.location ?? ""} ${j.job ?? ""} ${j.qbo_invoice_ref ?? ""}`));
    jobs.slice(0, words.length ? 8 : 6).forEach((j) => out.push({
      kind: "job", id: j.id, title: j.job_name || j.customer,
      sub: [j.job_name ? j.customer : null, j.location, j.price].filter(Boolean).join(" · "),
      tag: STATUS_META[j.status]?.label, go: () => openJob(j.id),
    }));
    if (words.length) {
      data.customers.filter((c) => has(`${c.name} ${c.contact_name ?? ""} ${c.phone ?? ""} ${c.email ?? ""} ${c.address ?? ""} ${(c.qbo_names ?? []).join(" ")}`))
        .slice(0, 5).forEach((c) => out.push({
          kind: "customer", id: c.id, title: c.name, sub: [c.contact_name, c.phone, c.email].filter(Boolean).join(" · "),
          go: () => { close(); router.push(`/customers/${c.id}`); },
        }));
      data.invoices.filter((i: any) => has(`${i.ref} ${i.customer} ${i.amount}`)).slice(0, 5).forEach((i: any) => {
        const n = String(i.customer ?? "").toLowerCase();
        const cust = data.customers.find((c) => c.name.toLowerCase() === n || (c.qbo_names ?? []).some((x: string) => x.toLowerCase() === n));
        const job = data.jobs.find((j) => j.qbo_invoice_ref && String(j.qbo_invoice_ref) === String(i.ref));
        out.push({
          kind: "invoice", id: "inv-" + i.ref, title: `Invoice ${i.ref}`,
          sub: `${i.customer} · $${Number(i.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}${i.days_overdue > 0 ? ` · ${i.days_overdue} days late` : ""}`,
          go: () => { if (job) openJob(job.id); else { close(); router.push(cust ? `/customers/${cust.id}` : "/money"); } },
        });
      });
    }
    return out;
  }, [q, data]);

  useEffect(() => { setSel(0); }, [q]);

  if (!open) return null;
  const ICON = { job: Briefcase, customer: Building2, invoice: FileText, screen: CornerDownLeft } as const;
  const GROUP = { screen: "Screens", job: q ? "Jobs" : "Recent jobs", customer: "Customers", invoice: "Open invoices" } as const;

  return (
    <div className="fixed inset-0 z-[65] bg-black/75 flex justify-center items-start md:pt-[12vh]" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="w-full md:max-w-xl h-full md:h-auto md:max-h-[70vh] flex flex-col bg-neutral-900 md:border border-neutral-700 md:rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 border-b border-neutral-800 pt-[env(safe-area-inset-top)]">
          <Search size={20} className="text-neutral-400 shrink-0" />
          <input ref={box} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job, customer, address, invoice #…"
            className="flex-1 bg-transparent min-h-[56px] text-base text-white placeholder:text-neutral-400 focus:outline-none focus-visible:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter" && hits[sel]) hits[sel].go();
            }} />
          <button onClick={close} className="p-2 text-neutral-400" aria-label="Close search"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 py-1">
          {!data ? <p className="px-4 py-6 text-sm text-neutral-400">Loading…</p> : null}
          {data && !hits.length ? <p className="px-4 py-6 text-sm text-neutral-400">Nothing matches “{q}”.</p> : null}
          {hits.map((h, i) => {
            const Icon = ICON[h.kind];
            const head = i === 0 || hits[i - 1].kind !== h.kind;
            return (
              <div key={h.kind + h.id}>
                {head ? <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-neutral-400">{GROUP[h.kind]}</div> : null}
                <button onClick={h.go} onMouseEnter={() => setSel(i)}
                  className={`w-full flex items-center gap-3 px-4 min-h-[52px] text-left ${i === sel ? "bg-neutral-800" : ""}`}>
                  <Icon size={18} className="text-neutral-400 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white truncate">{h.title}</span>
                    {h.sub ? <span className="block text-xs text-neutral-400 truncate">{h.sub}</span> : null}
                  </span>
                  {h.tag ? <span className="shrink-0 text-xs font-semibold text-neutral-300">{h.tag}</span> : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
