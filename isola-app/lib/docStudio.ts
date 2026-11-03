// Document Studio (v84) — invoices, proposals and change orders in the Isola v3 look.
// A document is plain data (StudioDoc). Everything on the page comes from that data, so every word,
// line, number, section and color can be edited on the job page. `fillInvoice` builds a starting
// invoice from what's logged (job_costs + time_clock); `renderDoc` turns a doc into printable HTML.
import { billedOf } from "@/components/TmBilling";

export type DocKind = "invoice" | "proposal" | "change_order";
export type LineKind = "item" | "group" | "note";
export type Line = {
  id: string; kind: LineKind;
  name: string; desc?: string;
  qty?: string; rate?: number | null; amount?: number | null;
  indent?: boolean;
};
export type Section = { id: string; title: string; lines: Line[]; showSubtotal: boolean; subtotalLabel?: string };
export type TextBlock = { id: string; title: string; body: string };
export type Fact = { k: string; v: string };

export type StudioDoc = {
  kind: DocKind;
  word: string;            // big yellow word in the header band
  number: string;
  date: string;            // shown under the word
  pill: string;            // yellow job-type pill ('' hides it)
  facts: Fact[];
  overviewTitle: string; overview: string;
  tableTitle: string;
  sections: Section[];
  scope: { id: string; title: string; bullets: string[] }[];  // detailed scope blocks (proposal / CO)
  showSectionSummary: boolean;
  payments: number;        // payments received (invoice)
  extraSummary: { label: string; amount: number }[];
  totalLabel: string;
  totalOverride: number | null;  // set a total by hand instead of the line sum
  showTotal: boolean;
  options: { label: string; amount: number }[]; // proposal price options (one ink bar each)
  blocks: TextBlock[];     // payment instructions, terms, conditions… in order
  signature: boolean;
  signLeft: string; signRight: string;
  closing: string;
  footer: string;
  cols: { qty: boolean; rate: boolean; amount: boolean; desc: boolean };
  qtyHeader: string;
  look: Look;
};
export type Look = { ink: string; accent: string; band: string; font: number; logo: boolean };

export type StudioSettings = {
  company: { name: string; sub: string; address: string; contact: string };
  look: Look;
  positions: Record<string, string>;    // worker name → position shown on invoices
  ownerPosition: string; defaultPosition: string;
  invoice: { detail: Detail; materials: MatMode; clock: boolean; payText: string; closing: string; dueDays: number };
  proposalTerms: TextBlock[];
  proposalValid: string;
};
export type Detail = "day" | "position" | "total";
export type MatMode = "itemized" | "single";

export const uid = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_LOOK: Look = { ink: "#0E1114", accent: "#F2C230", band: "#EEF0F2", font: 100, logo: true };
export const DEFAULT_SETTINGS: StudioSettings = {
  company: {
    name: "ISOLA", sub: "EXCAVATION & DESIGN",
    address: "77 Stella Street, Providence, RI 02909", contact: "508-933-2661 · mcalise@isola-ri.com",
  },
  look: DEFAULT_LOOK,
  positions: {},
  ownerPosition: "Senior Laborer", defaultPosition: "Laborer",
  invoice: {
    detail: "day", materials: "itemized", clock: true, dueDays: 5,
    payText: "Payment is due by {due}. Please make checks payable to Isola LLC and mail to 77 Stella Street, Providence, RI 02909, or call 508-933-2661 to arrange another form of payment. Please reference invoice {number}.",
    closing: "Thank you for your business.",
  },
  proposalValid: "VALID 30 DAYS",
  proposalTerms: [
    { id: "t1", title: "Payment Terms", body: "33% deposit due at signing, 33% at the midpoint of the work, and the balance due upon completion." },
    { id: "t2", title: "Unforeseen Conditions", body: "If conditions are encountered that are not visible or known at the time of this proposal — including but not limited to buried debris, undisclosed utilities, subsurface obstructions, or unsuitable soil conditions — additional costs may apply. Isola will notify the customer and obtain written or verbal approval before proceeding with any additional work." },
    { id: "t3", title: "Change Orders", body: "Any work outside the scope described in this proposal will be documented in a written change order stating the added scope and price, approved by the customer before the work is performed." },
    { id: "t4", title: "Weather & Scheduling", body: "Start and completion dates are good-faith estimates. Excavation, concrete, masonry and sealant work are weather-dependent; days lost to unsuitable conditions extend the schedule day-for-day." },
    { id: "t5", title: "Permits", body: "Permits are not included. Permit fees and responsibility for filing to be confirmed prior to project start." },
    { id: "t6", title: "Proposal Validity", body: "This proposal is valid for 30 days from the date of issue." },
  ],
};
export function mergeSettings(raw: any): StudioSettings {
  const d = DEFAULT_SETTINGS; const r = raw ?? {};
  return {
    ...d, ...r,
    company: { ...d.company, ...(r.company ?? {}) },
    look: { ...d.look, ...(r.look ?? {}) },
    positions: { ...(r.positions ?? {}) },
    invoice: { ...d.invoice, ...(r.invoice ?? {}) },
    proposalTerms: Array.isArray(r.proposalTerms) ? r.proposalTerms : d.proposalTerms,
  };
}

// ---------- small helpers ----------
export const money2 = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? "" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: any) => (v == null || v === "" ? null : Number(v));
export const longDate = (iso: string) => {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y) return iso || "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const shortDay = (iso: string) => {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y) return iso || "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
export const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number); const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const fmtTime = (ts: string) =>
  new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
export const lineSum = (s: Section) => r2(s.lines.reduce((a, l) => a + (l.kind === "item" ? Number(l.amount || 0) : 0), 0));
export const docTotal = (d: StudioDoc) => d.totalOverride != null ? d.totalOverride : r2(d.sections.reduce((a, s) => a + lineSum(s), 0) + d.extraSummary.reduce((a, x) => a + Number(x.amount || 0), 0));
export const qtyNum = (q?: string) => { const m = String(q ?? "").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };

// ---------- blank documents ----------
export function blankDoc(kind: DocKind, s: StudioSettings, job?: any): StudioDoc {
  const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const base: StudioDoc = {
    kind, word: kind === "invoice" ? "INVOICE" : kind === "proposal" ? "PROPOSAL" : "CHANGE ORDER",
    number: "", date: longDate(iso).toUpperCase(), pill: (kind === "invoice" && job?.billing_type === "tm" ? "TIME & MATERIAL" : job?.job ?? "").toUpperCase(),
    facts: [], overviewTitle: "Project Overview", overview: "", tableTitle: "Work Included",
    sections: [], scope: [], showSectionSummary: false, payments: 0, extraSummary: [],
    totalLabel: kind === "invoice" ? "TOTAL DUE" : kind === "proposal" ? "TOTAL CONTRACT PRICE" : "CHANGE ORDER AMOUNT",
    totalOverride: null, showTotal: true, options: [], blocks: [], signature: kind !== "invoice",
    signLeft: "OWNER / AUTHORIZED SIGNATURE · DATE", signRight: "ISOLA · DATE",
    closing: "", footer: (job?.job_name ?? "").toUpperCase(), cols: { qty: kind === "invoice", rate: kind === "invoice", amount: kind === "invoice", desc: true },
    qtyHeader: "QTY", look: { ...s.look },
  };
  if (kind === "proposal") {
    base.date = `${longDate(iso).toUpperCase()} · ${s.proposalValid}`;
    base.facts = [{ k: "CLIENT", v: job?.customer ?? "" }, { k: "LOCATION", v: job?.location ?? "" }, { k: "PROJECT", v: job?.job_name ?? "" }, { k: "CONTRACT AMOUNT", v: job?.price_amount ? money2(Number(job.price_amount)) : "" }];
    base.overview = job?.scope_of_work ?? "";
    base.sections = [{ id: uid(), title: "", showSubtotal: false, lines: [{ id: uid(), kind: "item", name: job?.job ?? "Scope of work", desc: "", amount: job?.price_amount ? Number(job.price_amount) : null }] }];
    base.blocks = s.proposalTerms.map((t) => ({ ...t, id: uid() }));
    base.blocks.unshift({ id: uid(), title: "Acceptance", body: "By signing below, both parties agree to the scope of work and price as outlined in this proposal." });
    base.blocks.push(base.blocks.shift()!); // acceptance goes last
  }
  if (kind === "change_order") {
    base.facts = [{ k: "CLIENT", v: job?.customer ?? "" }, { k: "PROJECT", v: job?.job_name ?? "" }, { k: "LOCATION", v: job?.location ?? "" }, { k: "CHANGE ORDER #", v: "" }];
    base.overviewTitle = "Description of Change"; base.tableTitle = "Added Work";
    base.sections = [{ id: uid(), title: "", showSubtotal: false, lines: [{ id: uid(), kind: "item", name: "Added work", desc: "", amount: null }] }];
    base.blocks = [{ id: uid(), title: "Terms", body: "This change order amends the original agreement. All other terms remain unchanged. The amount above is due with the next scheduled payment unless otherwise stated." }];
  }
  return base;
}

// ---------- invoice from logged work ----------
export type FillOpts = { detail: Detail; materials: MatMode; clock: boolean; positions: Record<string, string>; ownerPosition: string; defaultPosition: string };
export type JobData = { job: any; costs: any[]; clocks: any[]; rates: any[]; workers: any[] };

function materialName(c: any) {
  const n = String(c.notes || c.vendor || c.category || "Material");
  let first = n.split(/ — | · | - |\(|;|\. | @ /)[0].replace(/\s+\d+\s*(bags?|@).*$/i, "").replace(/^\d+(\.\d+)?\s+(x\s+)?/i, "").trim();
  first = first.charAt(0).toUpperCase() + first.slice(1);
  return first.length > 60 ? first.slice(0, 57) + "…" : first || "Material";
}
function materialQty(c: any): { n: number; u: string } | null {
  const t = String(c.notes || "");
  const m = t.match(/(\d+(?:\.\d+)?)\s*(bags?|yd|yds|ton|tons|gal|pcs|boxes|tubes|rolls|sheets|lf|sf)\b/i);
  if (m) return { n: Number(m[1]), u: m[2].toLowerCase().replace(/^bag$/, "bags") };
  const lead = t.match(/^(\d+(?:\.\d+)?)\s+[A-Za-z]/); if (lead) return { n: Number(lead[1]), u: "" };
  const dash = t.match(/—\s*(\d+(?:\.\d+)?)\s*@/); if (dash) return { n: Number(dash[1]), u: "" };
  return null;
}
function clockText(c: any, clocks: any[]) {
  const segs = clocks.filter((t) => t.job_cost_id === c.id && t.clock_in).sort((a, b) => a.clock_in.localeCompare(b.clock_in));
  if (segs.length) return segs.map((t) => `${fmtTime(t.clock_in)} – ${t.clock_out ? fmtTime(t.clock_out) : "open"}`).join(", ");
  const m = String(c.notes || "").match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[–-]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  return m ? `${m[1]} – ${m[2]}` : "";
}
function hoursOf(c: any) {
  const h = num(c.hours); if (h) return h;
  const m = String(c.notes || "").match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr)\b/i); return m ? Number(m[1]) : null;
}

export function invoiceSection(d: JobData, o: FillOpts): Section {
  const { job, costs, clocks, rates, workers } = d;
  const markup = num(job.materials_markup);
  const defBill = num(job.tm_bill_rate);
  const wBy = (n: string) => workers.find((w) => w.name.toLowerCase() === String(n ?? "").trim().toLowerCase());
  const position = (n: string) => o.positions[n] || (wBy(n)?.is_owner ? o.ownerPosition : o.defaultPosition);
  const billRate = (n: string) => { const w = wBy(n); const jr = w ? rates.find((r) => r.worker_id === w.id) : null; return num(jr?.bill_rate) ?? defBill ?? 0; };
  const lines: Line[] = [];
  const labor = costs.filter((c) => c.category === "Labor" && Number(c.hours) > 0);
  const machine = costs.filter((c) => c.category === "THM" && num(c.bill_amount) != null && Number(c.bill_amount) !== 0);
  const isHourlyMachine = (c: any) => !!hoursOf(c) && /excavator|machine|operator|hour/i.test(c.notes || "") && !/delivery/i.test(c.notes || "");
  const machineName = (c: any) => { const n = String(c.notes || ""); const m = n.match(/\(([^)]+)\)/); if (/delivery/i.test(n)) return "Equipment Delivery"; if (/truck/i.test(n)) return "Truck" + (n.match(/\(([^)]*F-\d+[^)]*)\)/) ? ` (${n.match(/\((F-\d+)\)/)?.[1] ?? ""})`.replace(" ()", "") : ""); const base = m ? m[1].split("—")[0].trim() : "Equipment"; return /operator/i.test(n) && !/operator/i.test(base) ? `${base} with Operator` : base; };
  const trucking = costs.filter((c) => c.category === "Trucking" && (num(c.bill_amount) ?? 0) + Number(c.amount || 0) > 0);
  const mats = costs.filter((c) => c.category !== "Labor" && c.category !== "THM" && c.category !== "Trucking" && billedOf(c, markup) > 0);

  const laborLine = (c: any, label: string, indent: boolean): Line => {
    const h = Number(c.hours); const rate = billRate(c.worker);
    return { id: uid(), kind: "item", name: label, desc: o.clock ? clockText(c, clocks) : "", qty: `${h} hr`, rate, amount: r2(h * rate), indent };
  };
  const machLine = (c: any, indent: boolean, label?: string): Line => {
    const h = isHourlyMachine(c) ? hoursOf(c) : null; const bill = Number(c.bill_amount);
    const tm = String(c.notes || "").match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[–-]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
    return { id: uid(), kind: "item", name: label ?? machineName(c), desc: o.clock && tm ? `${tm[1]} – ${tm[2]}` : "", qty: h ? `${h} hr` : "", rate: h ? r2(bill / h) : null, amount: bill, indent };
  };

  if (o.detail === "day") {
    const days = [...new Set([...labor, ...machine.filter(isHourlyMachine)].map((c) => c.entry_date))].sort();
    for (const day of days) {
      lines.push({ id: uid(), kind: "group", name: shortDay(day).toUpperCase(), desc: "" });
      const dl = labor.filter((c) => c.entry_date === day).sort((a, b) => (wBy(b.worker)?.is_owner ? 1 : 0) - (wBy(a.worker)?.is_owner ? 1 : 0));
      for (const c of dl) lines.push(laborLine(c, position(c.worker), true));
      for (const c of machine.filter((m) => m.entry_date === day && isHourlyMachine(m))) lines.push(machLine(c, true));
    }
  } else if (o.detail === "position") {
    const by = new Map<string, { h: number; amt: number; rate: number; days: Set<string> }>();
    for (const c of labor) {
      const p = position(c.worker); const rate = billRate(c.worker); const key = `${p}|${rate}`;
      const v = by.get(key) ?? { h: 0, amt: 0, rate, days: new Set() };
      v.h += Number(c.hours); v.amt += Number(c.hours) * rate; v.days.add(shortDay(c.entry_date)); by.set(key, v);
    }
    for (const [k, v] of by) lines.push({ id: uid(), kind: "item", name: k.split("|")[0], desc: [...v.days].join(", "), qty: `${r2(v.h)} hr`, rate: v.rate, amount: r2(v.amt) });
    const hm = machine.filter(isHourlyMachine);
    if (hm.length) {
      const h = r2(hm.reduce((a, c) => a + (hoursOf(c) ?? 0), 0)); const amt = r2(hm.reduce((a, c) => a + Number(c.bill_amount), 0));
      lines.push({ id: uid(), kind: "item", name: machineName(hm[0]), desc: hm.map((c) => `${shortDay(c.entry_date)} (${hoursOf(c)} hr)`).join(", "), qty: `${h} hr`, rate: h ? r2(amt / h) : null, amount: amt });
    }
  } else {
    const h = r2(labor.reduce((a, c) => a + Number(c.hours), 0)); const amt = r2(labor.reduce((a, c) => a + Number(c.hours) * billRate(c.worker), 0));
    if (labor.length) lines.push({ id: uid(), kind: "item", name: "Labor", desc: `${new Set(labor.map((c) => c.entry_date)).size} days`, qty: `${h} hr`, rate: null, amount: amt });
    const hm = machine.filter(isHourlyMachine);
    if (hm.length) { const mh = r2(hm.reduce((a, c) => a + (hoursOf(c) ?? 0), 0)); lines.push({ id: uid(), kind: "item", name: machineName(hm[0]), desc: "", qty: `${mh} hr`, rate: null, amount: r2(hm.reduce((a, c) => a + Number(c.bill_amount), 0)) }); }
  }
  for (const c of trucking) {
    const h = hoursOf(c); const bill = num(c.bill_amount) ?? billedOf(c, markup);
    const tm = String(c.notes || "").match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[–-]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
    lines.push({ id: uid(), kind: "item", name: `${shortDay(c.entry_date)} — Trucking`, desc: o.clock && tm ? `${tm[1]} – ${tm[2]}` : "", qty: h ? `${h} hr` : "", rate: h ? r2(bill / h) : null, amount: r2(bill) });
  }
  for (const c of machine.filter((m) => !isHourlyMachine(m))) lines.push(machLine(c, false));

  const matOnly = mats.filter((c) => /material/i.test(c.category || ""));
  const otherCats = mats.filter((c) => !/material/i.test(c.category || ""));
  if (matOnly.length) {
    if (o.materials === "itemized") {
      lines.push({ id: uid(), kind: "group", name: "Materials", desc: markup ? "at cost plus handling" : "" });
      const merged = new Map<string, { amt: number; n: number | null; u: string | null }>();
      for (const c of matOnly) {
        const k = materialName(c); const q = materialQty(c); const v = merged.get(k) ?? { amt: 0, n: q ? 0 : null, u: q?.u ?? null };
        v.amt += billedOf(c, markup);
        if (q && v.n != null && (v.u === q.u)) v.n += q.n; else if (!q || v.u !== q.u) v.n = null;
        merged.set(k, v);
      }
      for (const [k, v] of merged) lines.push({ id: uid(), kind: "item", name: k, qty: v.n != null ? `${v.n}${v.u ? " " + v.u : ""}` : "", rate: null, amount: r2(v.amt), indent: true });
    } else {
      lines.push({ id: uid(), kind: "item", name: "Materials", desc: [...new Set(matOnly.map(materialName))].join(", ") + (markup ? " · at cost plus handling" : ""), amount: r2(matOnly.reduce((a, c) => a + billedOf(c, markup), 0)) });
    }
  }
  const cats = new Map<string, any[]>();
  for (const c of otherCats) cats.set(c.category || "Other", [...(cats.get(c.category || "Other") ?? []), c]);
  for (const [cat, items] of cats) {
    const name = /dump|disposal/i.test(cat) ? "Disposal" : /rental|equipment/i.test(cat) ? "Equipment Rental" : cat;
    const desc = /dump|disposal/i.test(cat) ? `${items.length} dump run${items.length > 1 ? "s" : ""}` : items.length > 1 ? `${items.length} items` : materialName(items[0]);
    lines.push({ id: uid(), kind: "item", name, desc: desc + (markup ? " · at cost plus handling" : ""), amount: r2(items.reduce((a, c) => a + billedOf(c, markup), 0)) });
  }
  return { id: uid(), title: `${job.job_name ?? "Job"}`.toUpperCase(), lines, showSubtotal: true, subtotalLabel: `${job.job_name ?? "Job"} subtotal` };
}

export function fillInvoice(base: StudioDoc, jobs: JobData[], o: FillOpts, s: StudioSettings, due: string): StudioDoc {
  const first = jobs[0]?.job ?? {};
  const sections = jobs.map((j) => invoiceSection(j, o));
  const names = jobs.map((j) => j.job.job_name).filter(Boolean).join(" & ");
  const number = base.number || first.qbo_invoice_ref || `${String(first.job_name ?? "INV").toUpperCase().replace(/[^A-Z0-9]+/g, "")}-1`;
  const dueText = longDate(due);
  return {
    ...base, number, sections, showSectionSummary: sections.length > 1,
    facts: [{ k: "BILL TO", v: first.customer ?? "" }, { k: "JOB", v: names }, { k: "INVOICE #", v: number }, { k: "DATE DUE", v: dueText }],
    tableTitle: "Work Performed", overview: "", qtyHeader: "QTY",
    pill: base.pill || "TIME & MATERIAL",
    footer: `${names.toUpperCase()} · INVOICE ${number}`,
    blocks: [{ id: uid(), title: "Payment", body: s.invoice.payText.replace("{due}", dueText).replace("{number}", number) }],
    closing: s.invoice.closing,
  };
}

// ---------- render to HTML (preview + print) ----------
const esc = (t: any) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const para = (t: string) => esc(t).replace(/\n/g, "<br>");

export function renderDoc(d: StudioDoc, s: StudioSettings, origin = ""): string {
  const L = d.look; const f = (L.font || 100) / 100;
  const ncols = 1 + (d.cols.qty ? 1 : 0) + (d.cols.rate ? 1 : 0) + (d.cols.amount ? 1 : 0);
  const head = `<tr><th>DESCRIPTION</th>${d.cols.qty ? `<th class="n">${esc(d.qtyHeader)}</th>` : ""}${d.cols.rate ? `<th class="n">RATE</th>` : ""}${d.cols.amount ? `<th class="n">AMOUNT</th>` : ""}</tr>`;
  let body = "";
  for (const sec of d.sections) {
    if (sec.title) body += `<tr class="sec"><td colspan="${ncols}">${esc(sec.title)}</td></tr>`;
    let alt = 0;
    for (const l of sec.lines) {
      if (l.kind === "group") { body += `<tr class="grp"><td colspan="${ncols}">${esc(l.name)}${l.desc ? ` <span>· ${esc(l.desc)}</span>` : ""}</td></tr>`; alt = 0; continue; }
      if (l.kind === "note") { body += `<tr class="note"><td colspan="${ncols}">${para(l.name)}</td></tr>`; continue; }
      body += `<tr class="${alt++ % 2 ? "alt" : ""}${l.indent ? " ind" : ""}"><td><div class="nm">${esc(l.name)}</div>${d.cols.desc && l.desc ? `<div class="ds">${para(l.desc)}</div>` : ""}</td>`
        + (d.cols.qty ? `<td class="n">${esc(l.qty || "–")}</td>` : "")
        + (d.cols.rate ? `<td class="n">${l.rate != null ? money2(l.rate) : "–"}</td>` : "")
        + (d.cols.amount ? `<td class="n b">${l.amount != null ? money2(l.amount) : ""}</td>` : "") + "</tr>";
    }
    if (sec.showSubtotal && d.cols.amount) body += `<tr class="subt"><td colspan="${ncols - 1}">${esc(sec.subtotalLabel || "Subtotal")}</td><td class="n b">${money2(lineSum(sec))}</td></tr>`;
  }
  const total = docTotal(d);
  const summaryRows = [
    ...(d.showSectionSummary ? d.sections.map((sec) => [sec.subtotalLabel?.replace(/ subtotal$/i, "") || sec.title, lineSum(sec)]) : []),
    ...d.extraSummary.map((x) => [x.label, x.amount]),
    ...(d.kind === "invoice" ? [["Payments received", d.payments]] : []),
  ] as [string, number][];
  const facts = d.facts.length ? `<div class="facts">${d.facts.map((x) => `<div><div class="k">${esc(x.k)}</div><div class="v">${para(x.v)}</div></div>`).join("")}</div>` : "";
  const logo = L.logo ? `<img src="${origin}/isola-doc-logo.png" alt="">` : "";
  const due = d.kind === "invoice" ? total - Number(d.payments || 0) : total;
  const css = `
@page { size: Letter; margin: 0.45in 0 0.6in; @bottom-left { content: "${String(d.footer ?? "").replace(/["\\]/g, "")}"; } @bottom-right { content: "PAGE " counter(page) " OF " counter(pages); } }
@page :first { margin-top: 0; }
@page { @bottom-left { font: 6.8pt Helvetica, Arial, sans-serif; letter-spacing: 1.2px; color: #777C81; margin-left: 0.6in; } @bottom-right { font: 6.8pt Helvetica, Arial, sans-serif; letter-spacing: 1.2px; color: #777C81; margin-right: 0.6in; } }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { background: #fff; }
body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: ${9.6 * f}pt; line-height: 1.4; }
.wrap { padding: 0 0.6in 0.2in; }
.band { background: ${L.ink}; margin: 0 -0.6in; padding: 26px 0.6in 22px; display: flex; align-items: flex-end; }
.band img { height: 74px; width: 74px; }
.co { margin-left: 14px; color: #fff; } .co .n { font-size: 15pt; font-weight: bold; letter-spacing: 2.4px; }
.co .a { font-size: 7pt; letter-spacing: .9px; color: #B4BAC0; margin-top: 4px; line-height: 1.5; }
.band .r { margin-left: auto; text-align: right; color: #fff; }
.band .r .t { font-size: 20pt; font-weight: bold; letter-spacing: 5px; line-height: 1; color: ${L.accent}; }
.band .r .s { font-size: 7.6pt; letter-spacing: 1.4px; color: #B4BAC0; margin-top: 7px; }
.rule { height: 5px; background: ${L.accent}; margin: 0 -0.6in 20px; }
.pill { display: inline-block; background: ${L.accent}; color: ${L.ink}; font-weight: bold; font-size: 6.6pt; letter-spacing: 1.6px; padding: 3px 9px; margin-bottom: 14px; }
.facts { display: flex; border: 1px solid #D7DADD; margin-bottom: 18px; break-inside: avoid; }
.facts > div { flex: 1; padding: 10px 13px; border-right: 1px solid #D7DADD; } .facts > div:last-child { border-right: none; }
.facts .k { font-size: 6.6pt; letter-spacing: 1.5px; color: #666B70; font-weight: bold; margin-bottom: 4px; }
.facts .v { font-size: ${9 * f}pt; font-weight: bold; line-height: 1.25; }
h2 { font-size: 9pt; letter-spacing: 2.6px; margin: 18px 0 9px; padding-bottom: 6px; border-bottom: 2px solid ${L.ink}; text-transform: uppercase; break-after: avoid; }
h3 { font-size: 8.6pt; letter-spacing: 1.4px; margin: 12px 0 4px; text-transform: uppercase; break-after: avoid; }
p { margin: 0 0 12px; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: ${L.ink}; color: #fff; font-size: 7.2pt; letter-spacing: 1.8px; text-align: left; padding: 7px 10px; }
th.n, td.n { text-align: right; white-space: nowrap; }
td { padding: 4px 10px; border-bottom: 1px solid #E4E6E8; font-size: ${8.1 * f}pt; line-height: 1.3; vertical-align: top; }
td.b { font-weight: bold; font-size: ${8.8 * f}pt; }
.nm { font-weight: bold; font-size: ${8.8 * f}pt; } .ds { font-size: ${7.6 * f}pt; color: #555; margin-top: 1px; }
tr.alt td { background: ${L.band}; }
tr.ind td:first-child { padding-left: 24px; }
tr.sec td { border-left: 4px solid ${L.accent}; background: ${L.band}; font-weight: bold; font-size: 7.6pt; letter-spacing: 1.6px; padding: 7px 10px; }
tr.grp, tr.sec { break-after: avoid; }
tr.grp td { font-weight: bold; font-size: ${9 * f}pt; letter-spacing: 1.2px; padding-top: 8px; border-bottom: 1.4px solid ${L.ink}; }
tr.grp td span { font-weight: normal; letter-spacing: 0; font-size: ${7.6 * f}pt; color: #555; }
tr.note td { font-size: ${8 * f}pt; color: #444; }
tr.subt td { font-weight: bold; text-align: right; border-bottom: 2px solid ${L.ink}; }
.sum td { font-size: ${8.8 * f}pt; }
.total { display: flex; align-items: center; background: ${L.ink}; color: #fff; padding: 12px; border-bottom: 4px solid ${L.accent}; margin-top: 12px; break-inside: avoid; }
.total .l { font-size: 9.6pt; font-weight: bold; letter-spacing: 2.4px; } .total .v { margin-left: auto; font-size: 13pt; font-weight: bold; color: ${L.accent}; }
.dv { margin-bottom: 11px; break-inside: avoid; }
.dvh { border-left: 4px solid ${L.accent}; background: ${L.band}; padding: 6px 11px; font-weight: bold; }
ul { margin: 6px 0 0; padding-left: 26px; } li { margin-bottom: 2px; font-size: ${8.9 * f}pt; }
.sig { display: flex; gap: 44px; margin-top: 30px; break-inside: avoid; } .sig > div { flex: 1; }
.sig .line { border-bottom: 1.4px solid ${L.ink}; height: 34px; } .sig .cap { font-size: 6.6pt; letter-spacing: 1.4px; color: #666B70; margin-top: 5px; }
.closing { font-weight: bold; margin-top: 8px; }
@media screen { body { background: #e9eaec; } .sheet { background: #fff; width: 8.5in; min-height: 11in; margin: 0 auto; box-shadow: 0 2px 16px rgba(0,0,0,.25); } }
`;
  const opts = d.options.length
    ? d.options.map((o) => `<div class="total"><div class="l">${esc(o.label)}</div><div class="v">${money2(o.amount)}</div></div>`).join("")
    : d.showTotal ? `<div class="total"><div class="l">${esc(d.totalLabel)}</div><div class="v">${money2(due)}</div></div>` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.word)} ${esc(d.number)}</title><style>${css}</style></head><body><div class="sheet"><div class="wrap">
<div class="band">${logo}<div class="co"><div class="n">${esc(s.company.name)}</div><div class="a">${esc(s.company.sub)}<br>${esc(s.company.address)}<br>${esc(s.company.contact)}</div></div>
<div class="r"><div class="t">${esc(d.word)}</div><div class="s">${esc(d.date)}</div></div></div>
<div class="rule"></div>
${d.pill ? `<div class="pill">${esc(d.pill)}</div>` : ""}
${facts}
${d.overview ? `<h2 style="margin-top:0">${esc(d.overviewTitle)}</h2><p>${para(d.overview)}</p>` : ""}
${d.sections.length ? `<h2${d.overview ? "" : ' style="margin-top:0"'}>${esc(d.tableTitle)}</h2><table><thead>${d.cols.amount || d.cols.qty || d.cols.rate ? head : ""}</thead><tbody>${body}</tbody></table>` : ""}
${summaryRows.length ? `<table class="sum" style="margin-top:14px">${summaryRows.map(([k, v], i) => `<tr class="${i % 2 ? "alt" : ""}"><td>${esc(k)}</td><td class="n b">${money2(v)}</td></tr>`).join("")}</table>` : ""}
${opts}
${d.scope.length ? `<h2>Detailed Scope of Work</h2>${d.scope.map((b) => `<div class="dv"><div class="dvh">${esc(b.title)}</div><ul>${b.bullets.filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}` : ""}
${d.kind === "invoice"
    ? d.blocks.map((b) => `<h2>${esc(b.title)}</h2><p>${para(b.body)}</p>`).join("")
    : d.blocks.length ? `<h2>Conditions &amp; Terms</h2>` + d.blocks.map((b) => `<h3>${esc(b.title)}</h3><p>${para(b.body)}</p>`).join("") : ""}
${d.signature ? `<div class="sig"><div><div class="line"></div><div class="cap">${esc(d.signLeft)}</div></div><div><div class="line"></div><div class="cap">${esc(d.signRight)}</div></div></div>` : ""}
${d.closing ? `<p class="closing">${para(d.closing)}</p>` : ""}
</div></div></body></html>`;
  return html;
}
