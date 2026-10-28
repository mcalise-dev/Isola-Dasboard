"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, fmtDate } from "@/lib/format";
import { showError, showToast } from "@/components/Toaster";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, FileCheck2, ChevronDown } from "lucide-react";

/* ============================================================
   YEAR-END W-9 LIST — everyone Isola paid this year (from
   crew_payments) and every vendor with a W-9, in one list for
   the accountant. A crew payee rolls up to a vendor through
   vendors.paid_as (e.g. "Marco" -> Scotti). "Download packet"
   builds one PDF: a cover summary + every W-9 on file.
   ============================================================ */

type Row = {
  key: string;
  name: string;          // company / vendor name, or the payee name if no vendor record
  payees: string[];      // crew names whose payments roll up here
  vendorId: string | null;
  w9Id: string | null;
  w9Date: string | null;
  paid: number;
  count: number;
};

export default function W9YearEnd() {
  const supabase = useMemo(() => createClient(), []);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setRows(null);
    const [v, p, w] = await Promise.all([
      supabase.from("vendors").select("id,company,status,paid_as"),
      supabase.from("crew_payments").select("worker,amount,paid_on").gte("paid_on", `${year}-01-01`).lte("paid_on", `${year}-12-31`),
      supabase.from("vendor_documents").select("id,vendor_id,submitted_at").eq("doc_type", "w9").order("submitted_at", { ascending: false }),
    ]);
    const err = v.error || p.error || w.error;
    if (err) { showError("Couldn't load the W-9 list: " + err.message); setRows([]); return; }

    const latestW9 = new Map<string, { id: string; at: string }>();
    for (const d of w.data ?? []) if (!latestW9.has(d.vendor_id)) latestW9.set(d.vendor_id, { id: d.id, at: d.submitted_at });

    const byPayee = new Map<string, { paid: number; count: number }>();
    for (const r of p.data ?? []) {
      const k = (r.worker ?? "").trim();
      if (!k) continue;
      const cur = byPayee.get(k.toLowerCase()) ?? { paid: 0, count: 0 };
      cur.paid += Number(r.amount) || 0; cur.count += 1;
      byPayee.set(k.toLowerCase(), cur);
    }

    const out: Row[] = [];
    const claimed = new Set<string>();
    for (const vd of v.data ?? []) {
      const names: string[] = vd.paid_as ?? [];
      let paid = 0, count = 0;
      for (const n of names) {
        const hit = byPayee.get(n.trim().toLowerCase());
        if (hit) { paid += hit.paid; count += hit.count; claimed.add(n.trim().toLowerCase()); }
      }
      const w9 = latestW9.get(vd.id);
      // only vendors that matter for 1099s: paid this year, or holding a W-9
      if (!w9 && paid === 0) continue;
      out.push({ key: vd.id, name: vd.company, payees: names, vendorId: vd.id, w9Id: w9?.id ?? null, w9Date: w9?.at ?? null, paid, count });
    }
    // payees with no vendor record at all
    for (const r of p.data ?? []) {
      const k = (r.worker ?? "").trim();
      if (!k || claimed.has(k.toLowerCase()) || out.some((o) => o.key === "p:" + k.toLowerCase())) continue;
      const hit = byPayee.get(k.toLowerCase())!;
      out.push({ key: "p:" + k.toLowerCase(), name: k, payees: [k], vendorId: null, w9Id: null, w9Date: null, paid: hit.paid, count: hit.count });
    }
    // missing W-9s first (biggest paid first), then the ones on file
    out.sort((a, b) => (a.w9Id ? 1 : 0) - (b.w9Id ? 1 : 0) || b.paid - a.paid || a.name.localeCompare(b.name));
    setRows(out);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year]);

  const missing = rows?.filter((r) => !r.w9Id) ?? [];
  const onFile = rows?.filter((r) => r.w9Id) ?? [];
  const total = rows?.reduce((s, r) => s + r.paid, 0) ?? 0;

  async function downloadPacket() {
    if (!rows) return;
    setBusy(true);
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const W = 612, H = 792, M = 48;
      const black = rgb(0, 0, 0), grey = rgb(0.4, 0.4, 0.4);

      // ---- cover page(s): summary table
      let page = pdf.addPage([W, H]);
      let y = H - M;
      try {
        const logoBytes = await fetch("/logo.png").then((r) => r.arrayBuffer());
        const logo = await pdf.embedPng(logoBytes);
        page.drawImage(logo, { x: M, y: y - 60, width: 60, height: 60 });
      } catch { /* logo is a nicety */ }
      page.drawText("Isola LLC", { x: M + 74, y: y - 22, size: 16, font: bold, color: black });
      page.drawText(`W-9 / 1099 list — ${year}`, { x: M + 74, y: y - 42, size: 12, font, color: black });
      page.drawText(`Prepared ${new Date().toLocaleDateString("en-US")} · 77 Stella St, Providence RI 02909 · 508-933-2661`, { x: M + 74, y: y - 58, size: 8.5, font, color: grey });
      y -= 96;

      const cols = [M, M + 210, M + 330, M + 430];
      const head = (pg: typeof page, yy: number) => {
        ["Payee / company", "Paid in " + year, "W-9", "Received"].forEach((t, i) => pg.drawText(t, { x: cols[i], y: yy, size: 9, font: bold, color: black }));
        pg.drawLine({ start: { x: M, y: yy - 5 }, end: { x: W - M, y: yy - 5 }, thickness: 0.8, color: black });
      };
      head(page, y); y -= 20;
      for (const r of rows) {
        if (y < M + 40) { page = pdf.addPage([W, H]); y = H - M; head(page, y); y -= 20; }
        const label = r.payees.length && r.payees.join(", ").toLowerCase() !== r.name.toLowerCase() ? `${r.name} (${r.payees.join(", ")})` : r.name;
        page.drawText(label.slice(0, 42), { x: cols[0], y, size: 9.5, font, color: black });
        page.drawText(r.paid ? money(r.paid) : "—", { x: cols[1], y, size: 9.5, font, color: black });
        page.drawText(r.w9Id ? "On file" : "MISSING", { x: cols[2], y, size: 9.5, font: r.w9Id ? font : bold, color: black });
        page.drawText(r.w9Date ? new Date(r.w9Date).toLocaleDateString("en-US") : "", { x: cols[3], y, size: 9.5, font, color: black });
        y -= 16;
      }
      page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.5, color: grey });
      page.drawText("Total paid", { x: cols[0], y: y - 6, size: 9.5, font: bold, color: black });
      page.drawText(money(total), { x: cols[1], y: y - 6, size: 9.5, font: bold, color: black });
      page.drawText("Payment totals come from Isola's crew payment log. W-9s on file follow, one per payee.", { x: M, y: y - 30, size: 8.5, font, color: grey });

      // ---- every W-9 on file, appended in list order
      const ids = onFile.map((r) => r.w9Id!) ;
      const { data: files, error } = ids.length
        ? await supabase.from("vendor_documents").select("id,file_b64,mime_type").in("id", ids)
        : { data: [], error: null };
      if (error) throw new Error(error.message);
      for (const r of onFile) {
        const f = files?.find((x: any) => x.id === r.w9Id);
        if (!f?.file_b64) continue;
        const b64 = String(f.file_b64).replace(/^data:[^,]*,/, "");
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const mime = f.mime_type || "";
        if (mime.includes("pdf")) {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const copied = await pdf.copyPages(src, src.getPageIndices());
          copied.forEach((pg) => pdf.addPage(pg));
        } else {
          const img = mime.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
          const pg = pdf.addPage([W, H]);
          pg.drawText(`W-9 — ${r.name}`, { x: M, y: H - M, size: 11, font: bold, color: black });
          const s = Math.min((W - 2 * M) / img.width, (H - 2 * M - 24) / img.height);
          pg.drawImage(img, { x: (W - img.width * s) / 2, y: M, width: img.width * s, height: img.height * s });
        }
      }

      const out = await pdf.save();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Isola_W9_Packet_${year}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      showToast(missing.length ? `Packet saved — ${missing.length} still missing a W-9` : "Packet saved");
    } catch (e: any) {
      showError("Couldn't build the packet: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02]" aria-expanded={open}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><FileCheck2 size={16} className="text-neutral-400" /> Year-end W-9 list</div>
          <div className="text-xs text-neutral-400">
            {rows ? `${onFile.length} on file · ` : ""}
            {rows ? <span className={missing.length ? "text-amber-300 font-semibold" : ""}>{missing.length} missing</span> : "Loading…"}
            {rows ? ` · ${money(total)} paid in ${year}` : ""}
          </div>
        </div>
        <ChevronDown size={16} className={cn("shrink-0 text-neutral-500 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {[thisYear - 1, thisYear].map((yy) => (
                <button key={yy} onClick={() => setYear(yy)}
                  className={cn("h-9 rounded-lg border px-3 text-[13px] font-semibold", yy === year ? "border-brand bg-brand text-neutral-950" : "border-border text-neutral-400 hover:text-white")}>{yy}</button>
              ))}
            </div>
            <Button className="ml-auto" onClick={downloadPacket} disabled={busy || !rows || rows.length === 0}>
              <Download size={16} /> {busy ? "Building…" : "Download packet for accountant"}
            </Button>
          </div>

          {rows && rows.length === 0 ? <div className="text-sm text-neutral-500">No payments or W-9s for {year}.</div> : null}

          <div className="divide-y divide-border rounded-lg border border-border">
            {(rows ?? []).map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-neutral-100">{r.name}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {r.payees.length && r.payees.join(", ").toLowerCase() !== r.name.toLowerCase() ? `Paid as ${r.payees.join(", ")} · ` : ""}
                    {r.count ? `${r.count} payment${r.count === 1 ? "" : "s"}` : "No payments logged"}
                    {!r.vendorId ? " · no vendor record" : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular-nums font-semibold text-white">{r.paid ? money(r.paid) : "—"}</div>
                  <div className={cn("text-xs font-semibold", r.w9Id ? "text-emerald-400" : "text-amber-300")}>
                    {r.w9Id ? `W-9 ${fmtDate(r.w9Date?.slice(0, 10))}` : "No W-9"}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-500">
            Totals come from paid crew payments. To roll a crew name into a company (like Marco under Scotti), edit the vendor and fill in “Paid as.” Missing W-9s: text them the upload link above.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
