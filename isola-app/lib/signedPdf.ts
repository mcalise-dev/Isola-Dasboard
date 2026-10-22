// Builds the signed copy of a proposal / change order in the browser:
// the original PDF (if one is attached) + an Isola signature certificate page.
// pdf-lib is loaded on demand (only when someone builds a signed copy) to keep the signing page light.
import type { PDFDocument as PDFDocumentT, PDFFont, PDFPage } from "pdf-lib";

export type SignedInfo = {
  pdfB64?: string | null;
  kind: string;
  title: string;
  customer?: string | null;
  location?: string | null;
  scope?: string | null;
  price?: number | string | null;
  name: string;
  email?: string | null;
  signedAt: string;
  ip?: string | null;
  hash?: string | null;
  signaturePng: string;
  token: string;
};

// Standard PDF fonts only cover Latin-1 — swap out anything else.
const clean = (s: any) =>
  String(s ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2022\u25CF]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(t, size) > max && line) { out.push(line); line = w; }
      else line = t;
    }
    out.push(line);
  }
  return out;
}

const b64ToBytes = (b64: string) => {
  const s = atob(b64.replace(/^data:[^,]*,/, ""));
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
};

const money = (n: any) =>
  n == null || n === "" ? "" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function buildSignedPdf(info: SignedInfo): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  let doc: PDFDocumentT;
  let attached = false;
  if (info.pdfB64) {
    try { doc = await PDFDocument.load(b64ToBytes(info.pdfB64), { ignoreEncryption: true }); attached = true; }
    catch { doc = await PDFDocument.create(); }
  } else {
    doc = await PDFDocument.create();
  }
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: any = null;
  try {
    const r = await fetch("/logo.png");
    if (r.ok) logo = await doc.embedPng(new Uint8Array(await r.arrayBuffer()));
  } catch {}
  const sig = await doc.embedPng(b64ToBytes(info.signaturePng));

  const W = 612, H = 792, M = 50;
  const label = info.kind === "change_order" ? "CHANGE ORDER" : "PROPOSAL";

  function header(page: PDFPage, heading: string) {
    page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: rgb(0.07, 0.07, 0.07) });
    let x = M;
    if (logo) { const s = 56 / logo.height; page.drawImage(logo, { x: M, y: H - 73, width: logo.width * s, height: 56 }); x = M + logo.width * s + 14; }
    page.drawText("ISOLA LLC", { x, y: H - 42, size: 15, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Providence, RI  |  508-933-2661  |  mcalise@isola-ri.com", { x, y: H - 60, size: 8.5, font: reg, color: rgb(0.8, 0.8, 0.8) });
    const hw = bold.widthOfTextAtSize(heading, 10);
    page.drawText(heading, { x: W - M - hw, y: H - 50, size: 10, font: bold, color: rgb(1, 1, 1) });
  }

  // No PDF attached: render the web proposal as page(s) first.
  if (!attached) {
    let page = doc.addPage([W, H]);
    header(page, label);
    let y = H - 125;
    const line = (t: string, f: PDFFont, s: number, gap = 4, color = rgb(0, 0, 0)) => {
      for (const l of wrap(t, f, s, W - 2 * M)) {
        if (y < 70) { page = doc.addPage([W, H]); header(page, label); y = H - 125; }
        page.drawText(l, { x: M, y, size: s, font: f, color }); y -= s + gap;
      }
    };
    line(info.title, bold, 15, 6);
    line([info.customer, info.location].filter(Boolean).join("  |  "), reg, 10, 14, rgb(0.3, 0.3, 0.3));
    if (info.scope) {
      line("WORK INCLUDED", bold, 10, 8);
      for (const s of String(info.scope).split("\n").filter((l) => l.trim())) line("-  " + s.replace(/^[-•*]\s*/, ""), reg, 10, 5);
      y -= 8;
    }
    if (info.price != null && info.price !== "") {
      if (y < 100) { page = doc.addPage([W, H]); header(page, label); y = H - 125; }
      page.drawRectangle({ x: M, y: y - 10, width: W - 2 * M, height: 28, color: rgb(0.07, 0.07, 0.07) });
      page.drawText(info.kind === "change_order" ? "CHANGE ORDER AMOUNT" : "TOTAL CONTRACT PRICE", { x: M + 10, y: y, size: 10, font: bold, color: rgb(1, 1, 1) });
      const p = money(info.price); const pw = bold.widthOfTextAtSize(p, 13);
      page.drawText(p, { x: W - M - 10 - pw, y: y - 1, size: 13, font: bold, color: rgb(1, 1, 1) });
      y -= 40;
    }
  }

  // Certificate page
  const page = doc.addPage([W, H]);
  header(page, "SIGNATURE CERTIFICATE");
  let y = H - 130;
  const t = (s: string, f: PDFFont, size: number, x = M, color = rgb(0, 0, 0)) => page.drawText(clean(s), { x, y, size, font: f, color });

  t(`Electronically signed ${label.toLowerCase().replace("_", " ")}`, bold, 14); y -= 22;
  for (const l of wrap(info.title, reg, 11, W - 2 * M)) { t(l, reg, 11); y -= 15; }
  const sub = [info.customer, info.location].filter(Boolean).join("  |  ");
  if (sub) { t(sub, reg, 9.5, M, rgb(0.35, 0.35, 0.35)); y -= 14; }
  if (info.price != null && info.price !== "") { t(`Amount: ${money(info.price)}`, bold, 11); y -= 16; }
  y -= 10;

  // signature box
  page.drawRectangle({ x: M, y: y - 110, width: W - 2 * M, height: 110, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  page.drawText("ACCEPTED BY", { x: M + 10, y: y - 16, size: 8, font: bold, color: rgb(0.4, 0.4, 0.4) });
  const sc = Math.min(62 / sig.height, (W - 2 * M - 20) / sig.width);
  page.drawImage(sig, { x: M + 10, y: y - 86, width: sig.width * sc, height: sig.height * sc });
  page.drawLine({ start: { x: M + 10, y: y - 90 }, end: { x: W - M - 10, y: y - 90 }, thickness: 0.6, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(clean(info.name), { x: M + 10, y: y - 103, size: 9.5, font: bold });
  y -= 135;

  const signed = new Date(info.signedAt);
  const rows: [string, string][] = [
    ["Signer", info.name],
    ["Email", info.email || "-"],
    ["Signed", signed.toLocaleString("en-US", { dateStyle: "long", timeStyle: "long", timeZone: "America/New_York" })],
    ["IP address", info.ip || "-"],
    ["Document ID", info.token],
    ["Fingerprint (SHA-256)", info.hash || "-"],
    ["Method", "Signature drawn on screen after the signer reviewed the document online and agreed to sign electronically."],
  ];
  for (const [k, v] of rows) {
    t(k.toUpperCase(), bold, 8, M, rgb(0.4, 0.4, 0.4));
    const lines = wrap(v, reg, 9.5, W - 2 * M - 140);
    lines.forEach((l, i) => page.drawText(l, { x: M + 140, y: y - i * 13, size: 9.5, font: reg }));
    y -= Math.max(1, lines.length) * 13 + 8;
  }
  y -= 6;
  for (const l of wrap(
    "The signer consented to conduct this transaction electronically and agreed that this electronic signature is the legal equivalent of a handwritten signature. The fingerprint above identifies the exact document content that was signed; any later change produces a different fingerprint.",
    reg, 8.5, W - 2 * M)) { t(l, reg, 8.5, M, rgb(0.35, 0.35, 0.35)); y -= 11; }

  doc.setTitle(clean(`${info.title} - Signed`));
  doc.setAuthor("Isola LLC");
  return await doc.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const fileSafe = (s: string) => clean(s).replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") || "Isola";

/** Builds the signed PDF (original PDF + signature certificate) for a signed link and downloads it. */
export async function downloadSignedCopy(supabase: any, linkId: string, job?: any) {
  const { data: l, error } = await supabase.from("proposal_links").select("*").eq("id", linkId).single();
  if (error || !l) throw new Error(error?.message ?? "Link not found");
  if (!job) {
    const { data: jb } = await supabase.from("jobs").select("job_name,customer,location,scope_of_work").eq("id", l.job_id).single();
    job = jb ?? {};
  }
  if (!l.signature_png) throw new Error("This one was approved with a typed signature before e-sign — there's no drawn signature to put on a certificate.");
  let pdfB64: string | null = null;
  if (l.document_id) {
    const { data: d } = await supabase.from("documents").select("file_b64").eq("id", l.document_id).single();
    pdfB64 = d?.file_b64 ?? null;
  }
  const bytes = await buildSignedPdf({
    pdfB64, kind: l.kind, title: l.title || job.job_name, customer: job.customer, location: job.location,
    scope: l.scope ?? job.scope_of_work, price: l.price, name: l.approved_by, email: l.signer_email,
    signedAt: l.approved_at, ip: l.signer_ip, hash: l.doc_hash, signaturePng: l.signature_png, token: l.token,
  });
  downloadBytes(bytes, `${fileSafe(l.title || job.job_name)}_Signed.pdf`);
}
