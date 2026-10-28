// v8.1 (10/28/26) Isola-branded PDF reports for the Field tab (RFI log, submittal log,
// inspection reports). Black and white, logo top-left, job name in the header, page numbers.
// pdf-lib loads on demand.
import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";

const W = 612, H = 792, M = 46;

export type Report = {
  pdf: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
  /** move down; adds a page if `need` points won't fit */
  space: (need: number) => void;
  heading: (text: string) => void;
  para: (text: string, opts?: { size?: number; bold?: boolean; color?: RGB; indent?: number }) => void;
  kv: (rows: [string, string | null | undefined][]) => void;
  table: (cols: { label: string; width: number }[], rows: string[][]) => void;
  image: (dataUrl: string, maxW?: number, maxH?: number, caption?: string) => Promise<void>;
  images: (dataUrls: string[], caption?: string) => Promise<void>;
  rule: () => void;
  save: () => Promise<Uint8Array>;
};

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? "").replace(/\r/g, "").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(t, size) <= width) { line = t; continue; }
      if (line) out.push(line);
      // a single word wider than the line: hard-break it
      let rest = w;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let k = rest.length;
        while (k > 1 && font.widthOfTextAtSize(rest.slice(0, k), size) > width) k--;
        out.push(rest.slice(0, k)); rest = rest.slice(k);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

// pdf-lib's standard fonts are WinAnsi only — swap the usual phone characters so text never throws.
const clean = (s: string) => String(s ?? "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
  .replace(/…/g, "...").replace(/•/g, "-").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

export async function newReport(title: string, jobName: string, sub?: string): Promise<Report> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0), grey = rgb(0.38, 0.38, 0.38), line = rgb(0.75, 0.75, 0.75);
  let logo: any = null;
  try { logo = await pdf.embedPng(await fetch("/logo.png").then((r) => r.arrayBuffer())); } catch { /* optional */ }

  const r: any = { pdf, font, bold };
  const header = (first: boolean) => {
    const p = pdf.addPage([W, H]);
    // dark band across the top (format standard), logo knocked onto it
    p.drawRectangle({ x: 0, y: H - (first ? 92 : 46), width: W, height: first ? 92 : 46, color: rgb(0.07, 0.07, 0.07) });
    if (first) {
      if (logo) p.drawImage(logo, { x: M, y: H - 82, width: 72, height: 72 });
      p.drawText("ISOLA LLC", { x: M + 86, y: H - 34, size: 15, font: bold, color: rgb(1, 1, 1) });
      p.drawText("Concrete  ·  Masonry  ·  Sitework".replace(/·/g, "-"), { x: M + 86, y: H - 50, size: 9, font, color: rgb(0.8, 0.8, 0.8) });
      p.drawText("77 Stella St, Providence RI 02909  -  508-933-2661  -  mcalise@isola-ri.com", { x: M + 86, y: H - 64, size: 8, font, color: rgb(0.8, 0.8, 0.8) });
      const tw = bold.widthOfTextAtSize(clean(title).toUpperCase(), 12);
      p.drawText(clean(title).toUpperCase(), { x: W - M - tw, y: H - 34, size: 12, font: bold, color: rgb(1, 1, 1) });
    } else {
      p.drawText(clean(`${jobName}  -  ${title}`), { x: M, y: H - 29, size: 10, font: bold, color: rgb(1, 1, 1) });
    }
    return p;
  };
  r.page = header(true);
  r.y = H - 92 - 28;
  r.page.drawText(clean(jobName), { x: M, y: r.y, size: 15, font: bold, color: black });
  r.y -= 16;
  if (sub) { r.page.drawText(clean(sub), { x: M, y: r.y, size: 9.5, font, color: grey }); r.y -= 14; }
  r.y -= 8;

  r.space = (need: number) => { if (r.y - need < M + 20) { r.page = header(false); r.y = H - 46 - 26; } };
  r.rule = () => { r.space(10); r.page.drawLine({ start: { x: M, y: r.y }, end: { x: W - M, y: r.y }, thickness: 0.6, color: line }); r.y -= 12; };
  r.heading = (text: string) => { r.space(30); r.y -= 6; r.page.drawText(clean(text), { x: M, y: r.y, size: 11.5, font: bold, color: black }); r.y -= 6; r.page.drawLine({ start: { x: M, y: r.y }, end: { x: W - M, y: r.y }, thickness: 0.8, color: black }); r.y -= 14; };
  r.para = (text: string, o: { size?: number; bold?: boolean; color?: RGB; indent?: number } = {}) => {
    const size = o.size ?? 10, f = o.bold ? bold : font, x = M + (o.indent ?? 0);
    for (const ln of wrap(clean(text), f, size, W - M - x)) { r.space(size + 4); r.page.drawText(ln, { x, y: r.y, size, font: f, color: o.color ?? black }); r.y -= size + 4; }
  };
  r.kv = (rows: [string, string | null | undefined][]) => {
    for (const [k, v] of rows) {
      if (v == null || v === "") continue;
      const lines = wrap(clean(v), font, 10, W - M - (M + 130));
      r.space(14 * lines.length);
      r.page.drawText(clean(k), { x: M, y: r.y, size: 9, font: bold, color: grey });
      lines.forEach((ln, i) => r.page.drawText(ln, { x: M + 130, y: r.y - i * 14, size: 10, font, color: black }));
      r.y -= 14 * lines.length + 2;
    }
  };
  r.table = (cols: { label: string; width: number }[], rows: string[][]) => {
    const total = cols.reduce((a, c) => a + c.width, 0), scale = (W - 2 * M) / total;
    const xs: number[] = []; let x = M; cols.forEach((c) => { xs.push(x); x += c.width * scale; });
    const head = () => {
      r.space(22);
      cols.forEach((c, i) => r.page.drawText(clean(c.label), { x: xs[i], y: r.y, size: 8.5, font: bold, color: black }));
      r.y -= 5; r.page.drawLine({ start: { x: M, y: r.y }, end: { x: W - M, y: r.y }, thickness: 0.8, color: black }); r.y -= 12;
    };
    head();
    for (const row of rows) {
      const cells = row.map((v, i) => wrap(clean(v ?? ""), font, 9, cols[i].width * scale - 6));
      const h = Math.max(1, ...cells.map((c) => c.length)) * 12;
      if (r.y - h < M + 20) { r.page = header(false); r.y = H - 46 - 26; head(); }
      cells.forEach((c, i) => c.forEach((ln, k) => r.page.drawText(ln, { x: xs[i], y: r.y - k * 12, size: 9, font, color: black })));
      r.y -= h; r.page.drawLine({ start: { x: M, y: r.y + 4 }, end: { x: W - M, y: r.y + 4 }, thickness: 0.4, color: line }); r.y -= 6;
    }
  };
  const embed = async (dataUrl: string) => {
    const b64 = dataUrl.replace(/^data:[^,]*,/, "");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return /^data:image\/png/.test(dataUrl) ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
  };
  r.image = async (dataUrl: string, maxW = W - 2 * M, maxH = 300, caption?: string) => {
    try {
      const img = await embed(dataUrl);
      const s = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * s, h = img.height * s;
      r.space(h + (caption ? 16 : 6));
      r.page.drawImage(img, { x: M, y: r.y - h, width: w, height: h });
      r.y -= h + 4;
      if (caption) { r.page.drawText(clean(caption).slice(0, 110), { x: M, y: r.y - 8, size: 8, font, color: grey }); r.y -= 14; }
      r.y -= 4;
    } catch { r.para("[image could not be added]", { size: 8, color: grey }); }
  };
  // two-up photo grid
  r.images = async (urls: string[], caption?: string) => {
    const colW = (W - 2 * M - 12) / 2, maxH = 190;
    for (let i = 0; i < urls.length; i += 2) {
      const pair = await Promise.all(urls.slice(i, i + 2).map((u) => embed(u).catch(() => null)));
      const dims = pair.map((img) => (img ? { img, s: Math.min(colW / img.width, maxH / img.height) } : null));
      const h = Math.max(...dims.map((d) => (d ? d.img.height * d.s : 0)));
      r.space(h + 8);
      dims.forEach((d, k) => { if (d) r.page.drawImage(d.img, { x: M + k * (colW + 12), y: r.y - d.img.height * d.s, width: d.img.width * d.s, height: d.img.height * d.s }); });
      r.y -= h + 8;
    }
    if (caption) r.para(caption, { size: 8, color: grey });
  };
  r.save = async () => {
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      const t = `Page ${i + 1} of ${pages.length}`;
      p.drawText(t, { x: W - M - font.widthOfTextAtSize(t, 8), y: 24, size: 8, font, color: grey });
      p.drawText(clean(`Isola LLC  -  ${title}  -  printed ${new Date().toLocaleDateString("en-US")}`), { x: M, y: 24, size: 8, font, color: grey });
    });
    return pdf.save();
  };
  return r as Report;
}
