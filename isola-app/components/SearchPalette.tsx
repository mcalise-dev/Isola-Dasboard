"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as D from "@radix-ui/react-dialog";
import { defaultFilter } from "cmdk";
import { createClient } from "@/lib/supabase/client";
import { STATUS_META, fmtPrice, fmtDate, todayISO } from "@/lib/format";
import { withTimeout } from "@/lib/load";
import { ALL_ITEMS } from "@/lib/nav";
import { loadRecents, pushRecent, type Recent } from "@/lib/recents";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/bits";
import {
  Search, Briefcase, Building2, FileText, Plus, Camera, ListChecks, Target, CornerDownLeft, UserPlus,
  Truck, Hammer, Send, ShieldCheck, ClipboardCheck, History, Zap, Phone, Mail, MessageSquare, Wallet,
  Receipt, LayoutGrid, type LucideIcon,
} from "lucide-react";

// v4.6 command bar (Linear style): search jobs, customers, targets and invoices, jump to
// any screen, or run an action — "/" or Ctrl-K anywhere, or the search box in the top bar.
// v4.9: also searches vendors, builds, proposals, documents, tasks and punch items (server-side
// ilike), remembers recently viewed pages, and understands a few typed commands
// ("call Joe", "email Hennessy", "add cost", "new task", "pay Austria").
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

// ---- typed commands --------------------------------------------------------------------
// "call joe" → verb "call", rest "joe". The rest is what the result groups search on, so the
// person you're calling also shows up in Customers / Vendors below the command.
type Verb = "cost" | "call" | "text" | "email" | "pay";
const VERB_RE = /^\s*(add\s+(?:a\s+)?cost|add\s+(?:a\s+)?receipt|receipt|cost|call|text|email|pay)\b\s*(.*)$/i;
function parseCmd(raw: string): { verb: Verb | null; rest: string } {
  const m = raw.match(VERB_RE);
  if (!m) return { verb: null, rest: raw.trim() };
  const v = m[1].toLowerCase();
  const verb: Verb = v.includes("cost") || v.includes("receipt") ? "cost" : (v as Verb);
  return { verb, rest: m[2].trim() };
}
// What the groups filter on: the text after a command verb, or the whole query.
function searchTermOf(raw: string) {
  const { verb, rest } = parseCmd(raw);
  return verb && rest ? rest : raw.trim();
}
const PIN = "__pin__"; // items already matched (server results, commands) skip cmdk's fuzzy filter
// Screens ("go …") need every typed word to actually appear in the name — cmdk's loose letter
// matching otherwise lists "Day sheet" for "call hen".
const paletteFilter = (value: string, search: string, keywords?: string[]) => {
  if (keywords?.includes(PIN)) return 1;
  const term = searchTermOf(search);
  if (value.startsWith("go ")) {
    const words = term.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = value.slice(3).toLowerCase();
    if (!words.every((w) => hay.includes(w))) return 0;
  }
  return defaultFilter(value, term, keywords);
};

const tokens = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);
const hits = (hay: string, t: string[]) => { const h = hay.toLowerCase(); return t.every((x) => h.includes(x)); };
// Characters that would break a PostgREST or() filter or act as wildcards.
const safe = (s: string) => s.replace(/[%*,()"\\:]/g, " ").replace(/\s+/g, " ").trim();
const ors = (cols: string[], term: string) => cols.map((c) => `${c}.ilike."%${term}%"`).join(",");
const NEW_KINDS = ["job", "lead", "task", "customer", "target"] as const;

type Remote = {
  vendors: any[]; estimates: any[]; proposals: any[]; documents: any[]; tasks: any[]; punch: any[];
};

function Row({ icon: Icon, title, sub, right, subCls }: { icon: LucideIcon; title: ReactNode; sub?: ReactNode; right?: ReactNode; subCls?: string }) {
  return (
    <>
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-white">{title}</span>
        {sub ? <span className={`block truncate text-xs ${subCls ?? "text-neutral-500"}`}>{sub}</span> : null}
      </span>
      {right ? <span className="shrink-0 text-xs text-neutral-400">{right}</span> : null}
    </>
  );
}

const RECENT_ICON: Record<string, LucideIcon> = { job: Briefcase, customer: Building2, screen: LayoutGrid };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SearchPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ jobs: any[]; customers: any[]; invoices: any[]; contacts: any[] } | null>(null);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<Recent[]>([]);
  const reqId = useRef(0);

  useEffect(() => {
    const on = () => { setQ(""); setData(null); setRemote(null); setRecents(loadRecents()); setOpen(true); };
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

  // ---- recently viewed: this component is mounted once in the app layout, so it sees every navigation
  useEffect(() => {
    if (!pathname) return;
    let cancelled = false;
    const m = pathname.match(/^\/(jobs|customers)\/([^/]+)\/?$/);
    if (m && UUID.test(m[2])) {
      const [, kind, id] = m;
      const sb = createClient();
      const qy: PromiseLike<any> = kind === "jobs"
        ? sb.from("jobs").select("job_name,customer,location").eq("id", id).maybeSingle()
        : sb.from("customers").select("name").eq("id", id).maybeSingle();
      withTimeout(qy).then((r: any) => {
        if (cancelled || r.error || !r.data) return;
        const d = r.data;
        const label = kind === "jobs" ? (d.job_name || d.customer || d.location || "Job") : (d.name || "Customer");
        setRecents(pushRecent({ href: pathname.replace(/\/$/, ""), label, kind: kind === "jobs" ? "job" : "customer" }));
      }).catch(() => { /* offline: skip, try again next visit */ });
    } else {
      const hit = ALL_ITEMS.find(({ item }) => item.href === pathname);
      if (hit) setRecents(pushRecent({ href: hit.item.href, label: hit.item.label, kind: "screen" }));
    }
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    if (!open || data) return;
    const sb = createClient();
    Promise.all([
      sb.from("jobs").select("id,job_name,customer,location,job,status,price,qbo_invoice_ref,updated_at").order("updated_at", { ascending: false }),
      sb.from("customers").select("id,name,contact_name,phone,email,address,qbo_names"),
      sb.from("money_snapshot").select("data").eq("id", 1).maybeSingle(),
      sb.from("contacts").select("id,name,company,tier,stage,phone,email"),
    ]).then(([j, c, m, ct]) => setData({ jobs: j.data ?? [], customers: c.data ?? [], invoices: ((m.data as any)?.data?.invoices ?? []), contacts: ct.data ?? [] }));
  }, [open, data]);

  // ---- server-side search of the bigger tables, debounced, all groups in parallel
  const term = safe(searchTermOf(q));
  useEffect(() => {
    if (!open) return;
    if (term.length < 2) { reqId.current++; setRemote(null); setSearching(false); return; }
    const id = ++reqId.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const sb = createClient();
      const L = 6;
      try {
        const [v, e, p, d, tk, pu] = await withTimeout(Promise.all([
          sb.from("vendors").select("id,company,contact_name,trade,phone,email").or(ors(["company", "contact_name", "trade", "email", "phone"], term)).limit(L),
          sb.from("estimates").select("id,title,customer,location,status,job_type").or(ors(["title", "customer", "location"], term)).order("updated_at", { ascending: false }).limit(L),
          sb.from("proposal_links").select("id,title,job_id,status,sent_at").ilike("title", `%${term}%`).order("created_at", { ascending: false }).limit(L),
          sb.from("documents").select("id,title,doc_type,job_id,expires_at").or(ors(["title", "issuer", "reference"], term)).limit(L),
          sb.from("tasks").select("id,title,job_id,done,due_date").ilike("title", `%${term}%`).order("done", { ascending: true }).order("due_date", { ascending: true, nullsFirst: false }).limit(L),
          sb.from("punch_list").select("id,item,job_id,done,due_date").ilike("item", `%${term}%`).order("done", { ascending: true }).limit(L),
        ]), 10000);
        if (id !== reqId.current) return;
        setRemote({
          vendors: v.data ?? [], estimates: e.data ?? [], proposals: p.data ?? [],
          documents: d.data ?? [], tasks: tk.data ?? [], punch: pu.data ?? [],
        });
      } catch {
        if (id === reqId.current) setRemote(null);
      }
      if (id === reqId.current) setSearching(false);
    }, 200);
    return () => clearTimeout(t);
  }, [open, term]);

  function go(href: string) { setOpen(false); router.push(href); }
  function run(f: () => void) { setOpen(false); setTimeout(f, 60); }
  const jobName = useCallback((id: string | null | undefined) => {
    if (!id) return null;
    const j = data?.jobs.find((x) => x.id === id);
    return j ? (j.job_name || j.customer) : null;
  }, [data]);

  const hasQ = q.trim().length > 0;
  const jobs = data?.jobs ?? [];
  const shownJobs = hasQ ? jobs.slice(0, 200) : jobs.slice(0, 6);

  // ---- "Do" group: commands built from what was typed
  type DoItem = { key: string; icon: LucideIcon; title: string; sub?: string; act: () => void };
  const doItems = useMemo<DoItem[]>(() => {
    if (!hasQ) return [];
    const out: DoItem[] = [];
    const raw = q.trim();
    const { verb, rest } = parseCmd(raw);
    const t = tokens(rest);

    // new job / lead / task / customer / target
    const nm = raw.match(/^(new|add|create)\b\s*(.*)$/i);
    if (nm && !verb) {
      const want = nm[2].toLowerCase();
      for (const k of NEW_KINDS) {
        if (want && !k.startsWith(want.split(/\s+/)[0])) continue;
        if (k === "job") out.push({ key: "new-job", icon: Plus, title: "New job", act: () => run(() => openNew("job")) });
        if (k === "lead") out.push({ key: "new-lead", icon: UserPlus, title: "New lead", sub: "Goes on To quote", act: () => run(() => openNew("lead")) });
        if (k === "task") out.push({ key: "new-task", icon: ListChecks, title: "New task", act: () => run(() => openNew("task")) });
        if (k === "customer") out.push({ key: "new-customer", icon: Building2, title: "New customer", sub: "Opens Customers — tap Add customer", act: () => go("/customers") });
        if (k === "target") out.push({ key: "new-target", icon: Target, title: "New marketing target", act: () => run(() => openNew("target")) });
      }
    }

    if (verb === "cost") {
      out.push({ key: "cost-receipt", icon: Camera, title: "Snap a receipt", sub: rest ? `Pick “${rest}” as the job on the next screen` : "Camera → pick the job → save", act: () => run(() => openNew("receipt")) });
      out.push({ key: "cost-labor", icon: Receipt, title: "Log labor or a cost", sub: "Hours, rental, fuel, dump", act: () => go("/costs") });
    }

    if ((verb === "call" || verb === "text" || verb === "email") && t.length) {
      type P = { key: string; name: string; sub: string; phone?: string; email?: string };
      const people: P[] = [];
      for (const c of data?.customers ?? []) {
        if (hits(`${c.name ?? ""} ${c.contact_name ?? ""}`, t)) people.push({ key: `c${c.id}`, name: c.contact_name ? `${c.contact_name} (${c.name})` : c.name, sub: "Customer", phone: c.phone, email: c.email });
      }
      for (const c of data?.contacts ?? []) {
        if (hits(`${c.name ?? ""} ${c.company ?? ""}`, t)) people.push({ key: `t${c.id}`, name: c.company ? `${c.name} (${c.company})` : c.name, sub: "Target", phone: c.phone, email: c.email });
      }
      for (const v of remote?.vendors ?? []) {
        people.push({ key: `v${v.id}`, name: v.contact_name ? `${v.contact_name} (${v.company})` : v.company, sub: v.trade ? `Vendor · ${v.trade}` : "Vendor", phone: v.phone, email: v.email });
      }
      for (const p of people) {
        if (out.length >= 6) break;
        if (verb === "email" && p.email) {
          out.push({ key: `em-${p.key}`, icon: Mail, title: `Email ${p.name}`, sub: `${p.sub} · ${p.email}`, act: () => run(() => { window.location.href = `mailto:${p.email}`; }) });
        } else if (verb !== "email" && p.phone) {
          const tel = String(p.phone).replace(/[^\d+]/g, "");
          out.push({
            key: `${verb}-${p.key}`, icon: verb === "call" ? Phone : MessageSquare, title: `${verb === "call" ? "Call" : "Text"} ${p.name}`, sub: `${p.sub} · ${p.phone}`,
            act: () => run(() => { window.location.href = `${verb === "call" ? "tel" : "sms"}:${tel}`; }),
          });
        }
      }
    }

    if (verb === "pay") {
      out.push({ key: "pay", icon: Wallet, title: rest ? `Record a payment — ${rest}` : "Record a payment", sub: "Opens Owed to me", act: () => go("/money") });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, hasQ, data, remote]);

  const today = todayISO();
  const expiryLine = (d: any) => {
    if (!d.expires_at) return { text: [d.doc_type, jobName(d.job_id)].filter(Boolean).join(" · "), cls: undefined };
    const left = (new Date(d.expires_at + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000;
    const exp = left < 0 ? `Expired ${fmtDate(d.expires_at)}` : `Expires ${fmtDate(d.expires_at)}`;
    return { text: [d.doc_type, exp, jobName(d.job_id)].filter(Boolean).join(" · "), cls: left < 0 ? "text-red-400" : left <= 30 ? "text-amber-400" : undefined };
  };

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[75] bg-black/70 anim-fade" />
        <D.Content className="fixed z-[76] inset-0 md:inset-auto md:left-1/2 md:top-[12vh] md:-translate-x-1/2 md:w-[640px] md:max-w-[calc(100vw-2rem)] overflow-hidden md:rounded-2xl md:border border-border bg-neutral-950 shadow-[0_24px_60px_rgba(0,0,0,.7)] anim-pop pt-[env(safe-area-inset-top)] md:pt-0 focus:outline-none">
          <D.Title className="sr-only">Search and commands</D.Title>
          <Command loop filter={paletteFilter}>
            <CommandInput value={q} onValueChange={setQ} placeholder="Job, customer, vendor, invoice #, or “call Joe”…" autoFocus />
            <CommandList className="max-h-[calc(100dvh-60px)] md:max-h-[60vh]">
              <CommandEmpty>{searching ? "Searching…" : <>No matches for “{q.trim()}”.</>}</CommandEmpty>

              {doItems.length ? (
                <CommandGroup heading="Do">
                  {doItems.map((d) => (
                    <CommandItem key={d.key} value={`do ${d.key}`} keywords={[PIN]} onSelect={d.act}>
                      <Row icon={d.icon} title={d.title} sub={d.sub} right={<Zap size={14} />} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {!hasQ && recents.length ? (
                <CommandGroup heading="Recent">
                  {recents.map((r) => (
                    <CommandItem key={r.href} value={`recent ${r.label} ${r.href}`} onSelect={() => go(r.href)}>
                      <Row icon={RECENT_ICON[r.kind] ?? History} title={r.label} sub={r.kind === "job" ? "Job" : r.kind === "customer" ? "Customer" : "Screen"} right={<History size={14} />} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

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
                      <Row icon={Briefcase} title={j.job_name || j.customer}
                        sub={[j.job_name ? j.customer : null, j.location, fmtPrice(j.price)].filter(Boolean).join(" · ")}
                        right={STATUS_META[j.status]?.label} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {hasQ && data ? (
                <>
                  <CommandGroup heading="Customers">
                    {data.customers.map((c) => (
                      <CommandItem key={c.id} value={`customer ${c.name} ${c.contact_name ?? ""} ${c.phone ?? ""} ${c.email ?? ""} ${c.address ?? ""} ${(c.qbo_names ?? []).join(" ")} ${c.id}`} onSelect={() => go(`/customers/${c.id}`)}>
                        <Row icon={Building2} title={c.name} sub={[c.contact_name, c.phone, c.email].filter(Boolean).join(" · ")} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup heading="Marketing targets">
                    {data.contacts.map((c) => (
                      <CommandItem key={c.id} value={`target ${c.name} ${c.company ?? ""} ${c.id}`} onSelect={() => go(`/marketing/targets?c=${c.id}`)}>
                        <Row icon={Target} title={c.name} sub={[c.company, c.tier ? `Tier ${c.tier}` : null, c.stage].filter(Boolean).join(" · ")} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup heading="Open invoices">
                    {data.invoices.map((i: any) => {
                      const job = data.jobs.find((j) => j.qbo_invoice_ref && String(j.qbo_invoice_ref) === String(i.ref));
                      return (
                        <CommandItem key={i.ref} value={`invoice ${i.ref} ${i.customer} ${i.amount}`} onSelect={() => go(job ? `/jobs/${job.id}` : "/money")}>
                          <Row icon={FileText} title={`Invoice ${i.ref}`}
                            sub={`${i.customer} · $${Number(i.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}${i.days_overdue > 0 ? ` · ${i.days_overdue} days late` : ""}`} />
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              ) : null}

              {hasQ && remote ? (
                <>
                  {remote.vendors.length ? (
                    <CommandGroup heading="Vendors">
                      {remote.vendors.map((v) => (
                        <CommandItem key={v.id} value={`vendor ${v.company} ${v.id}`} keywords={[PIN]} onSelect={() => go("/vendors")}>
                          <Row icon={Truck} title={v.company || v.contact_name} sub={[v.trade, v.contact_name, v.phone].filter(Boolean).join(" · ")} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                  {remote.estimates.length || remote.proposals.length ? (
                    <CommandGroup heading="Builds & proposals">
                      {remote.estimates.map((e) => (
                        <CommandItem key={e.id} value={`build ${e.title ?? ""} ${e.id}`} keywords={[PIN]} onSelect={() => go("/build")}>
                          <Row icon={Hammer} title={e.title || e.customer || "Untitled build"} sub={[e.title ? e.customer : null, e.location, e.job_type].filter(Boolean).join(" · ")} right={e.status} />
                        </CommandItem>
                      ))}
                      {remote.proposals.map((p) => (
                        <CommandItem key={p.id} value={`proposal ${p.title ?? ""} ${p.id}`} keywords={[PIN]} onSelect={() => go(p.job_id ? `/jobs/${p.job_id}?tab=proposal` : "/proposals")}>
                          <Row icon={Send} title={p.title || "Proposal"} sub={[jobName(p.job_id), p.sent_at ? `Sent ${fmtDate(String(p.sent_at).slice(0, 10))}` : "Not sent"].filter(Boolean).join(" · ")} right={p.status} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                  {remote.documents.length ? (
                    <CommandGroup heading="Documents">
                      {remote.documents.map((d) => {
                        const line = expiryLine(d);
                        return (
                          <CommandItem key={d.id} value={`doc ${d.title ?? ""} ${d.id}`} keywords={[PIN]} onSelect={() => go(d.job_id ? `/jobs/${d.job_id}?tab=docs` : "/docs")}>
                            <Row icon={ShieldCheck} title={d.title || d.doc_type || "Document"} sub={line.text} subCls={line.cls} />
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ) : null}
                  {remote.tasks.length ? (
                    <CommandGroup heading="Tasks">
                      {remote.tasks.map((t) => (
                        <CommandItem key={t.id} value={`task ${t.title ?? ""} ${t.id}`} keywords={[PIN]} onSelect={() => go(t.job_id ? `/jobs/${t.job_id}?tab=tasks` : "/tasks")}>
                          <Row icon={ListChecks} title={<span className={t.done ? "line-through text-neutral-500" : undefined}>{t.title}</span>}
                            sub={[jobName(t.job_id), t.due_date ? `Due ${fmtDate(t.due_date)}` : null].filter(Boolean).join(" · ") || undefined}
                            subCls={!t.done && t.due_date && t.due_date < today ? "text-red-400" : undefined}
                            right={t.done ? "Done" : undefined} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                  {remote.punch.length ? (
                    <CommandGroup heading="Punch list">
                      {remote.punch.map((p) => (
                        <CommandItem key={p.id} value={`punch ${p.item ?? ""} ${p.id}`} keywords={[PIN]} onSelect={() => go(p.job_id ? `/jobs/${p.job_id}?tab=tasks` : "/punchlist")}>
                          <Row icon={ClipboardCheck} title={<span className={p.done ? "line-through text-neutral-500" : undefined}>{p.item}</span>}
                            sub={[jobName(p.job_id), p.due_date ? `Due ${fmtDate(p.due_date)}` : null].filter(Boolean).join(" · ") || undefined}
                            right={p.done ? "Fixed" : undefined} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
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
