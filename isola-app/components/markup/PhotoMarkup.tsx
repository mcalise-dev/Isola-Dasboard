"use client";
// v5.1 (10/16/26): Photo markup. Draw on a job photo or an uploaded one — arrows, lines,
// point-by-point lines (tap each point, tap the first point to close), dimension lines with a
// label, boxes, circles, freehand and text — then save the marked-up copy back to the job
// (original stays untouched, the drawing stays editable) or download it.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MousePointer2, Pencil, Minus, MoveUpRight, Spline, Ruler, Square, Circle, Type, Hash, Ban,
  Undo2, Redo2, Trash2, Download, Save, Upload, ImagePlus, X, Check, Camera,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import { PageHeader, Empty } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { showError, showToast } from "@/components/Toaster";
import { ask, askText } from "@/components/Dialogs";
import { drawStamp, stampSafe } from "@/lib/stamp";

type P = { x: number; y: number };
type Shape = {
  id: string;
  type: "pen" | "line" | "arrow" | "path" | "dim" | "rect" | "ellipse" | "text" | "num";
  color: string;  // line color / text color / numbered-pin fill
  size: number;   // 1 small, 2 medium, 3 large
  a?: P; b?: P; points?: P[]; closed?: boolean; at?: P; text?: string;
  // text boxes (v5.2): font, box background ("none" = no box), optional number badge.
  // Text with no `bg` is an older label and keeps the original pill look.
  font?: FontKey; bg?: string; num?: number;
  // v5.3: box size set by dragging its corners (text wraps to w; h can add room below), and a text-size nudge
  w?: number; h?: number; ts?: number;
};
type Tool = "select" | Shape["type"];
type Markup = { v: 1; w: number; h: number; shapes: Shape[] };

const COLORS = [
  { v: "#F2C230", n: "Yellow" },
  { v: "#EF4444", n: "Red" },
  { v: "#F97316", n: "Orange" },
  { v: "#22C55E", n: "Green" },
  { v: "#FFFFFF", n: "White" },
  { v: "#0B0D0E", n: "Black" },
];
type FontKey = "sans" | "bold" | "serif" | "mono" | "marker";
const FONTS: { k: FontKey; label: string; css: (px: number) => string }[] = [
  { k: "sans", label: "Sans", css: (px) => `600 ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` },
  { k: "bold", label: "Bold", css: (px) => `900 ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` },
  { k: "serif", label: "Serif", css: (px) => `600 ${px}px Georgia, "Times New Roman", serif` },
  { k: "mono", label: "Mono", css: (px) => `600 ${px}px ui-monospace, Menlo, Consolas, "Courier New", monospace` },
  { k: "marker", label: "Marker", css: (px) => `700 ${px}px "Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive` },
];
const fontCss = (k: FontKey | undefined, px: number) => (FONTS.find((f) => f.k === k) ?? FONTS[0]).css(px);
const BGS = [
  { v: "none", n: "No box" },
  { v: "rgba(11,13,14,0.72)", n: "See-through dark" },
  { v: "#0B0D0E", n: "Black box" },
  { v: "#FFFFFF", n: "White box" },
  { v: "#F2C230", n: "Yellow box" },
  { v: "#EF4444", n: "Red box" },
  { v: "#F97316", n: "Orange box" },
  { v: "#22C55E", n: "Green box" },
];
const LIGHT = new Set(["#FFFFFF", "#F2C230", "#F97316", "#22C55E"]);
const contrast = (c: string) => (LIGHT.has(c) ? "#0B0D0E" : "#FFFFFF");
// numbered dots and numbered text boxes count separately, so box 1 can explain dot 1
const nextNum = (list: Shape[], type: "num" | "text" = "num") => list.reduce((m, s) => (s.type === type && s.num != null && s.num > m ? s.num : m), 0) + 1;
const TOOLS: { t: Tool; label: string; icon: any }[] = [
  { t: "select", label: "Move", icon: MousePointer2 },
  { t: "path", label: "Points", icon: Spline },
  { t: "arrow", label: "Arrow", icon: MoveUpRight },
  { t: "line", label: "Line", icon: Minus },
  { t: "dim", label: "Measure", icon: Ruler },
  { t: "rect", label: "Box", icon: Square },
  { t: "ellipse", label: "Circle", icon: Circle },
  { t: "pen", label: "Draw", icon: Pencil },
  { t: "text", label: "Text box", icon: Type },
  { t: "num", label: "Number", icon: Hash },
];
const SIZE_MULT = [0, 0.7, 1.2, 2];
const uid = () => Math.random().toString(36).slice(2, 10);
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
function segDist(p: P, a: P, b: P) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}
const isDark = (c: string) => c === "#0B0D0E";

// ---------- drawing (shared by screen + export) ----------
function baseUnit(w: number, h: number) { return Math.max(w, h) / 300; }
function strokeW(s: Shape, base: number) { return base * SIZE_MULT[s.size || 2]; }

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fontPx: number, color: string) {
  ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  const tw = ctx.measureText(text).width, padX = fontPx * 0.45, padY = fontPx * 0.28;
  const w = tw + padX * 2, h = fontPx + padY * 2, r = h / 2.6;
  ctx.save();
  ctx.fillStyle = isDark(color) ? "rgba(255,255,255,0.92)" : "rgba(11,13,14,0.82)";
  ctx.beginPath();
  (ctx as any).roundRect ? (ctx as any).roundRect(x - w / 2, y - h / 2, w, h, r) : ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + fontPx * 0.04);
  ctx.restore();
  return { w, h };
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, base: number, opts: { dots?: boolean; firstRing?: boolean } = {}) {
  const lw = strokeW(s, base);
  ctx.save();
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
  ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
  // thin dark halo under light colors so lines read on bright photos
  const halo = !isDark(s.color) && s.type !== "text";
  const stroke = (path: () => void) => {
    if (halo) { ctx.save(); ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = lw + Math.max(1.5, lw * 0.5); path(); ctx.stroke(); ctx.restore(); }
    path(); ctx.stroke();
  };
  switch (s.type) {
    case "pen": {
      const pts = s.points || [];
      if (pts.length < 2) break;
      stroke(() => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); });
      break;
    }
    case "line": stroke(() => { ctx.beginPath(); ctx.moveTo(s.a!.x, s.a!.y); ctx.lineTo(s.b!.x, s.b!.y); }); break;
    case "arrow": {
      const a = s.a!, b = s.b!, ang = Math.atan2(b.y - a.y, b.x - a.x), hl = Math.max(lw * 3.6, base * 4.5);
      const head = () => { ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - hl * Math.cos(ang - 0.45), b.y - hl * Math.sin(ang - 0.45)); ctx.lineTo(b.x - hl * Math.cos(ang + 0.45), b.y - hl * Math.sin(ang + 0.45)); ctx.closePath(); };
      stroke(() => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x - hl * 0.6 * Math.cos(ang), b.y - hl * 0.6 * Math.sin(ang)); });
      if (halo) { ctx.save(); ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = Math.max(1.5, lw * 0.5); head(); ctx.stroke(); ctx.restore(); }
      head(); ctx.fill();
      break;
    }
    case "path": {
      const pts = s.points || [];
      if (!pts.length) break;
      if (pts.length > 1) stroke(() => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); if (s.closed) ctx.closePath(); });
      if (s.closed) { ctx.save(); ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.restore(); }
      if (opts.dots !== false) {
        const r = Math.max(lw * 1.15, base * 1.4);
        pts.forEach((p, i) => {
          ctx.beginPath(); ctx.arc(p.x, p.y, i === 0 && opts.firstRing ? r * 1.8 : r, 0, Math.PI * 2);
          ctx.fillStyle = s.color; ctx.fill();
          ctx.lineWidth = Math.max(1.5, r * 0.35); ctx.strokeStyle = isDark(s.color) ? "#fff" : "#0B0D0E"; ctx.stroke();
        });
      }
      break;
    }
    case "dim": {
      const a = s.a!, b = s.b!, ang = Math.atan2(b.y - a.y, b.x - a.x), t = Math.max(lw * 2.4, base * 3);
      const nx = -Math.sin(ang) * t, ny = Math.cos(ang) * t;
      stroke(() => {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.moveTo(a.x + nx, a.y + ny); ctx.lineTo(a.x - nx, a.y - ny);
        ctx.moveTo(b.x + nx, b.y + ny); ctx.lineTo(b.x - nx, b.y - ny);
      });
      if (s.text) pill(ctx, s.text, (a.x + b.x) / 2, (a.y + b.y) / 2, base * 5.2 * (0.75 + (s.size || 2) * 0.2), s.color);
      break;
    }
    case "rect": stroke(() => { ctx.beginPath(); ctx.rect(Math.min(s.a!.x, s.b!.x), Math.min(s.a!.y, s.b!.y), Math.abs(s.b!.x - s.a!.x), Math.abs(s.b!.y - s.a!.y)); }); break;
    case "ellipse": stroke(() => { ctx.beginPath(); ctx.ellipse((s.a!.x + s.b!.x) / 2, (s.a!.y + s.b!.y) / 2, Math.abs(s.b!.x - s.a!.x) / 2 || 0.5, Math.abs(s.b!.y - s.a!.y) / 2 || 0.5, 0, 0, Math.PI * 2); }); break;
    case "text":
      if (s.bg !== undefined) { if (s.text) drawTextBox(ctx, s, base); }
      else if (s.text) pill(ctx, s.text, s.at!.x, s.at!.y, base * 6 * (0.7 + (s.size || 2) * 0.25), s.color);
      break;
    case "num": {
      const r = pinR(s, base);
      ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = r * 0.35; ctx.shadowOffsetY = r * 0.06;
      ctx.beginPath(); ctx.arc(s.at!.x, s.at!.y, r * 1.12, 0, Math.PI * 2); ctx.fillStyle = contrast(s.color); ctx.fill();
      ctx.shadowColor = "transparent";
      numDot(ctx, s.num ?? 1, s.at!.x, s.at!.y, r, s.color);
      break;
    }
  }
  ctx.restore();
}

let measureCtx: CanvasRenderingContext2D | null = null;
function textLayout(s: Shape, base: number, ctx?: CanvasRenderingContext2D) {
  const c = ctx ?? (measureCtx ??= document.createElement("canvas").getContext("2d")!);
  const f = base * 6 * (0.6 + (s.size || 2) * 0.22) * (s.ts || 1);
  const font = fontCss(s.font, f);
  const lh = f * 1.28, padX = f * 0.55, padY = f * 0.38;
  const badge = s.num != null ? lh * 1.02 : 0, gap = badge ? f * 0.42 : 0;
  const chrome = padX * 2 + badge + gap;
  c.save(); c.font = font;
  let lines = (s.text || "").split("\n");
  // a set width wraps to that; an auto-sized box wraps at ~half the photo so long notes don't run off
  const autoMax = base * 300 * 0.5;
  if (s.w) lines = wrapLines(c, lines, Math.max(f, s.w - chrome));
  else if (lines.some((l) => c.measureText(l).width > autoMax - chrome)) lines = wrapLines(c, lines, Math.max(f * 4, autoMax - chrome));
  const tw = Math.max(f * 0.5, ...lines.map((l) => c.measureText(l).width));
  c.restore();
  const w = s.w ? Math.max(s.w, chrome + f) : chrome + tw;
  const h = Math.max(padY * 2 + Math.max(lines.length * lh, badge), s.h || 0);
  return { f, font, lines, lh, padX, padY, badge, gap, chrome, w, h, x0: s.at!.x - w / 2, y0: s.at!.y - h / 2 };
}
// word-wrap each paragraph to maxW; words longer than the box break by letter
function wrapLines(c: CanvasRenderingContext2D, paras: string[], maxW: number) {
  const out: string[] = [];
  for (const para of paras) {
    if (!para) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const tryLine = line ? line + " " + word : word;
      if (c.measureText(tryLine).width <= maxW) { line = tryLine; continue; }
      if (line) out.push(line);
      if (c.measureText(word).width <= maxW) { line = word; continue; }
      let chunk = "";
      for (const ch of word) { if (c.measureText(chunk + ch).width > maxW && chunk) { out.push(chunk); chunk = ch; } else chunk += ch; }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function numDot(ctx: CanvasRenderingContext2D, n: number, cx: number, cy: number, r: number, fill: string) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  const label = String(n), fs = r * (label.length > 2 ? 0.82 : label.length > 1 ? 1.0 : 1.18);
  ctx.font = `800 ${fs}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = contrast(fill); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + fs * 0.04);
  ctx.restore();
}
function drawTextBox(ctx: CanvasRenderingContext2D, s: Shape, base: number) {
  const L = textLayout(s, base, ctx);
  const hasBg = !!s.bg && s.bg !== "none";
  const txt = hasBg && s.bg === s.color ? contrast(s.bg!) : s.color;
  ctx.save();
  if (hasBg) {
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = L.f * 0.35; ctx.shadowOffsetY = L.f * 0.06;
    rrect(ctx, L.x0, L.y0, L.w, L.h, L.f * 0.32); ctx.fillStyle = s.bg!; ctx.fill();
    ctx.shadowColor = "transparent";
  }
  if (L.badge) {
    const r = L.badge / 2, cx = L.x0 + L.padX + r;
    const cy = L.lines.length > 1 ? L.y0 + L.padY + L.lh / 2 : L.y0 + L.h / 2;
    const fill = hasBg ? txt : s.color;
    if (!hasBg) { ctx.beginPath(); ctx.arc(cx, cy, r + Math.max(1.5, r * 0.12), 0, Math.PI * 2); ctx.fillStyle = contrast(fill); ctx.fill(); }
    numDot(ctx, s.num!, cx, cy, r, fill);
  }
  ctx.font = L.font; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const x = L.x0 + L.padX + L.badge + L.gap;
  L.lines.forEach((line, i) => {
    const y = L.y0 + L.padY + L.lh * (i + 0.5);
    if (!hasBg) { ctx.lineJoin = "round"; ctx.lineWidth = Math.max(2, L.f * 0.2); ctx.strokeStyle = contrast(s.color) === "#FFFFFF" ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.75)"; ctx.strokeText(line, x, y); }
    ctx.fillStyle = txt; ctx.fillText(line, x, y);
  });
  ctx.restore();
}
const pinR = (s: Shape, base: number) => base * (2.6 + (s.size || 2) * 1.3);

function bbox(s: Shape, base: number): { x0: number; y0: number; x1: number; y1: number } {
  if (s.type === "num") { const r = pinR(s, base); return { x0: s.at!.x - r, y0: s.at!.y - r, x1: s.at!.x + r, y1: s.at!.y + r }; }
  if (s.type === "text" && s.bg !== undefined) { const L = textLayout(s, base); return { x0: L.x0, y0: L.y0, x1: L.x0 + L.w, y1: L.y0 + L.h }; }
  if (s.type === "text") {
    const f = base * 6 * (0.7 + (s.size || 2) * 0.25), w = (s.text?.length || 1) * f * 0.6 + f;
    return { x0: s.at!.x - w / 2, y0: s.at!.y - f, x1: s.at!.x + w / 2, y1: s.at!.y + f };
  }
  const pts = s.points?.length ? s.points : [s.a!, s.b!];
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
}
function hit(s: Shape, p: P, tol: number, base: number) {
  const t = tol + strokeW(s, base);
  if (s.type === "line" || s.type === "arrow" || s.type === "dim") return segDist(p, s.a!, s.b!) < t || (s.type === "dim" && !!s.text && dist(p, { x: (s.a!.x + s.b!.x) / 2, y: (s.a!.y + s.b!.y) / 2 }) < t * 2.5);
  if (s.type === "pen" || s.type === "path") {
    const pts = s.points || [];
    for (let i = 1; i < pts.length; i++) if (segDist(p, pts[i - 1], pts[i]) < t) return true;
    if (s.type === "path" && s.closed && pts.length > 2 && segDist(p, pts[pts.length - 1], pts[0]) < t) return true;
    return pts.some((q) => dist(p, q) < t);
  }
  const b = bbox(s, base);
  return p.x > b.x0 - t && p.x < b.x1 + t && p.y > b.y0 - t && p.y < b.y1 + t;
}
const isBox = (s: Shape) => s.type === "text" && s.bg !== undefined;
function handles(s: Shape, base: number): P[] {
  if (isBox(s)) { const L = textLayout(s, base); return [{ x: L.x0, y: L.y0 }, { x: L.x0 + L.w, y: L.y0 }, { x: L.x0 + L.w, y: L.y0 + L.h }, { x: L.x0, y: L.y0 + L.h }]; }
  if (s.type === "path") return s.points || [];
  if (s.type === "line" || s.type === "arrow" || s.type === "dim" || s.type === "rect" || s.type === "ellipse") return [s.a!, s.b!];
  return [];
}
function moved(s: Shape, dx: number, dy: number): Shape {
  const m = (p?: P) => (p ? { x: p.x + dx, y: p.y + dy } : p);
  return { ...s, a: m(s.a), b: m(s.b), at: m(s.at), points: s.points?.map((p) => m(p)!) };
}
function withHandle(s: Shape, i: number, p: P, base: number): Shape {
  if (isBox(s)) {
    // drag a corner: the opposite corner stays put, text re-wraps to the new width
    const L = textLayout(s, base);
    const corners = [{ x: L.x0, y: L.y0 }, { x: L.x0 + L.w, y: L.y0 }, { x: L.x0 + L.w, y: L.y0 + L.h }, { x: L.x0, y: L.y0 + L.h }];
    const opp = corners[(i + 2) % 4];
    const w = Math.max(L.chrome + L.f * 1.5, Math.abs(p.x - opp.x));
    const sized: Shape = { ...s, w, h: Math.abs(p.y - opp.y) };
    const L2 = textLayout(sized, base);
    const x0 = p.x < opp.x ? opp.x - L2.w : opp.x;
    const y0 = p.y < opp.y ? opp.y - L2.h : opp.y;
    return { ...sized, h: L2.h, at: { x: x0 + L2.w / 2, y: y0 + L2.h / 2 } };
  }
  if (s.type === "path") return { ...s, points: s.points!.map((q, j) => (j === i ? p : q)) };
  return i === 0 ? { ...s, a: p } : { ...s, b: p };
}
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Could not open that photo")); i.src = src; });
}

// ---------- screen ----------
// v7.2: also runs INSIDE a job (CompanyCam-style). Pass lockJobId and it is pinned to that job —
// no job pickers, Close hands back to the job page, the address bar is left alone.
export default function PhotoMarkup({ lockJobId, photoId, onClose }: { lockJobId?: string; photoId?: string; onClose?: () => void } = {}) {
  const sb = useMemo(() => createClient(), []);
  const embedded = !!lockJobId;
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobId, setJobId] = useState(lockJobId ?? "");
  const [jobPhotos, setJobPhotos] = useState<any[] | null>(null);

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [srcPhoto, setSrcPhoto] = useState<any>(null);   // the ORIGINAL job photo, if any
  const [editRow, setEditRow] = useState<any>(null);      // an existing marked-up row being re-edited
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [past, setPast] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]);
  const [tool, setTool] = useState<Tool>("path");
  const [color, setColor] = useState(COLORS[0].v);
  const [size, setSize] = useState(2);
  const [font, setFont] = useState<FontKey>("sans");
  const [bg, setBg] = useState("rgba(11,13,14,0.72)");
  const [numbered, setNumbered] = useState(false);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [hover, setHover] = useState<P | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState({ w: 0, h: 0 });

  const selIsText = !!sel && shapes.some((x) => x.id === sel && x.type === "text");
  // keep a text box fully on the photo
  function clampBox(bx: Shape): Shape {
    if (!img || !isBox(bx)) return bx;
    const b0 = baseUnit(img.naturalWidth, img.naturalHeight), L = textLayout(bx, b0);
    const W = img.naturalWidth, H = img.naturalHeight;
    let x0 = Math.max(0, Math.min(W - L.w, L.x0)), y0 = Math.max(0, Math.min(H - L.h, L.y0));
    // stay clear of the Isola logo in the bottom-right corner (same size/margin as lib/stamp)
    const short = Math.min(W, H), D = Math.max(40, Math.min(220, short * 0.14)), m = short * 0.025, gap = short * 0.012;
    const lx = W - m - D, ly = H - m - D;
    if (x0 + L.w > lx - gap && y0 + L.h > ly - gap) {
      if (lx - gap - L.w >= 0) x0 = lx - gap - L.w; else y0 = Math.max(0, ly - gap - L.h);
    }
    return { ...bx, at: { x: x0 + L.w / 2, y: y0 + L.h / 2 } };
  }
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ mode: "draw" | "move" | "handle" | "pathpt" | "tbdraw"; start?: P; before?: Shape[]; idx?: number } | null>(null);

  // jobs for the picker
  useEffect(() => {
    sb.from("jobs").select("id,job_name,customer,status,updated_at").order("updated_at", { ascending: false }).limit(400)
      .then(({ data }) => setJobs((data ?? []).filter((j: any) => j.job_name)));
  }, [sb]);

  // ?photo=<id> (or the photoId prop inside a job) opens straight into the editor
  useEffect(() => {
    const id = photoId ?? (embedded ? null : new URLSearchParams(window.location.search).get("photo"));
    if (id) openJobPhoto(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!jobId || img) { setJobPhotos(null); return; }
    setJobPhotos(null);
    sb.from("job_photos").select("id,phase,caption,photo_b64,source_photo_id,created_at").eq("job_id", jobId).order("created_at", { ascending: false })
      .then(({ data, error }) => { if (error) showError(error.message); setJobPhotos(data ?? []); });
  }, [jobId, img, sb]);

  async function openJobPhoto(id: string) {
    setBusy(true);
    try {
      const { data: row, error } = await sb.from("job_photos").select("id,job_id,phase,caption,photo_b64,markup,source_photo_id").eq("id", id).maybeSingle();
      if (error || !row) throw new Error(error?.message || "Photo not found");
      if (!embedded) setJobId(row.job_id);
      if (row.markup && row.source_photo_id) {
        // re-edit: draw over the untouched original
        const { data: orig } = await sb.from("job_photos").select("id,job_id,phase,photo_b64").eq("id", row.source_photo_id).maybeSingle();
        if (orig) {
          setImg(await loadImg(orig.photo_b64));
          setSrcPhoto(orig); setEditRow(row); reset((row.markup as Markup).shapes || []);
          return;
        }
      }
      setImg(await loadImg(row.photo_b64)); setSrcPhoto(row); setEditRow(null); reset([]);
    } catch (e: any) { showError(e.message); } finally { setBusy(false); }
  }
  async function openFile(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const b64 = await stampSafe(await compressImage(f, 1600, 0.85), 0.88);
      setImg(await loadImg(b64)); setSrcPhoto(null); setEditRow(null); reset([]);
    } catch { showError("Could not open that photo."); } finally { setBusy(false); }
  }
  function reset(s: Shape[]) { setShapes(s); setPast([]); setFuture([]); setDraft(null); setSel(null); }
  async function startOver() {
    if ((shapes.length || draft) && !(await ask({ title: "Close this photo?", body: "Anything not saved will be lost.", confirm: "Close", danger: true }))) return;
    setImg(null); setSrcPhoto(null); setEditRow(null); reset([]);
    if (embedded) { onClose?.(); return; }
    if (window.location.search) window.history.replaceState(null, "", "/markup");
  }

  // history
  function commit(next: Shape[], before = shapes) { setPast((p) => [...p.slice(-60), before]); setFuture([]); setShapes(next); }
  function undo() {
    if (draft) { finishOrDropDraft(true); return; }
    if (!past.length) return;
    setFuture((f) => [shapes, ...f]); setShapes(past[past.length - 1]); setPast((p) => p.slice(0, -1)); setSel(null);
  }
  function redo() { if (!future.length) return; setPast((p) => [...p, shapes]); setShapes(future[0]); setFuture((f) => f.slice(1)); }

  // sizing: fit the photo into the available width / height
  useEffect(() => {
    if (!img) return;
    const fit = () => {
      const el = wrapRef.current; if (!el) return;
      const maxW = el.clientWidth, maxH = Math.max(260, window.innerHeight - (window.innerWidth < 768 ? 330 : 300));
      const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
      setView({ w: Math.round(img.naturalWidth * s), h: Math.round(img.naturalHeight * s) });
    };
    fit();
    const ro = new ResizeObserver(fit); if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [img]);

  const scale = img && view.w ? view.w / img.naturalWidth : 1;
  const base = img ? baseUnit(img.naturalWidth, img.naturalHeight) : 1;
  const tolImg = 16 / (scale || 1);

  // render
  useEffect(() => {
    const c = canvasRef.current; if (!c || !img || !view.w) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    c.width = Math.round(view.w * dpr); c.height = Math.round(view.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
    shapes.forEach((s) => drawShape(ctx, s, base));
    if (draft) {
      if (draft.type === "path" && hover && draft.points?.length) {
        const last = draft.points[draft.points.length - 1];
        ctx.save(); ctx.setLineDash([base * 2, base * 2]); ctx.strokeStyle = draft.color; ctx.lineWidth = strokeW(draft, base) * 0.7;
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(hover.x, hover.y); ctx.stroke(); ctx.restore();
      }
      drawShape(ctx, draft, base, { firstRing: draft.type === "path" && (draft.points?.length || 0) >= 3 });
    }
    const s = shapes.find((x) => x.id === sel);
    if (s) {
      const b = bbox(s, base), pad = strokeW(s, base) + 6 / scale;
      ctx.save(); ctx.setLineDash([6 / scale, 5 / scale]); ctx.lineWidth = 1.5 / scale; ctx.strokeStyle = "#F2C230";
      ctx.strokeRect(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2); ctx.restore();
      handles(s, base).forEach((h) => { ctx.beginPath(); ctx.arc(h.x, h.y, 7 / scale, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 2.5 / scale; ctx.strokeStyle = "#F2C230"; ctx.stroke(); });
    }
  }, [img, view, shapes, draft, hover, sel, scale, base]);

  function toImg(e: React.PointerEvent): P {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(img!.naturalWidth, (e.clientX - r.left) / scale)), y: Math.max(0, Math.min(img!.naturalHeight, (e.clientY - r.top) / scale)) };
  }

  function finishOrDropDraft(dropLastPoint = false) {
    if (!draft) return;
    if (draft.type === "path") {
      if (dropLastPoint) {
        const pts = (draft.points || []).slice(0, -1);
        setDraft(pts.length ? { ...draft, points: pts } : null);
        return;
      }
      if ((draft.points?.length || 0) >= 2) commit([...shapes, draft]);
      setDraft(null); setHover(null);
    }
  }
  function closePath() {
    if (draft?.type !== "path" || (draft.points?.length || 0) < 3) return;
    commit([...shapes, { ...draft, closed: true }]); setDraft(null); setHover(null);
  }

  async function onDown(e: React.PointerEvent) {
    if (!img) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toImg(e);
    if (tool === "select") {
      const cur = shapes.find((x) => x.id === sel);
      if (cur) {
        const i = handles(cur, base).findIndex((h) => dist(h, p) < tolImg * 1.4);
        if (i >= 0) { drag.current = { mode: "handle", idx: i, before: shapes }; return; }
      }
      const h = [...shapes].reverse().find((s) => hit(s, p, tolImg, base));
      setSel(h?.id ?? null);
      drag.current = h ? { mode: "move", start: p, before: shapes } : null;
      return;
    }
    if (tool === "text") {
      // tap = box sized to the text; drag = draw the box at the size you want
      setSel(null);
      setDraft({ id: "__textbox", type: "rect", color: "#F2C230", size: 1, a: p, b: p });
      drag.current = { mode: "tbdraw" };
      return;
    }
    if (tool === "num") {
      const pin: Shape = { id: uid(), type: "num", color, size, at: p, num: nextNum(shapes) };
      commit([...shapes, pin]);
      return;
    }
    if (tool === "path") {
      if (draft?.type === "path" && (draft.points?.length || 0) >= 3 && dist(p, draft.points![0]) < tolImg * 1.6) { closePath(); return; }
      setDraft((d) => (d?.type === "path" ? { ...d, points: [...(d.points || []), p] } : { id: uid(), type: "path", color, size, points: [p] }));
      drag.current = { mode: "pathpt" };
      return;
    }
    setSel(null);
    if (tool === "pen") setDraft({ id: uid(), type: "pen", color, size, points: [p] });
    else setDraft({ id: uid(), type: tool, color, size, a: p, b: p });
    drag.current = { mode: "draw" };
  }
  function onMove(e: React.PointerEvent) {
    if (!img) return;
    const p = toImg(e);
    const d = drag.current;
    if (!d) { if (tool === "path" && draft && e.pointerType === "mouse") setHover(p); return; }
    if (d.mode === "move" && d.start) {
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      setShapes(d.before!.map((s) => (s.id === sel ? clampBox(moved(s, dx, dy)) : s)));
    } else if (d.mode === "handle") {
      setShapes(d.before!.map((s) => (s.id === sel ? clampBox(withHandle(s, d.idx!, p, base)) : s)));
    } else if (d.mode === "pathpt") {
      // drag right after tapping fine-tunes the point you just dropped
      setDraft((dr) => (dr?.points ? { ...dr, points: [...dr.points.slice(0, -1), p] } : dr));
    } else if (d.mode === "draw" || d.mode === "tbdraw") {
      setDraft((dr) => {
        if (!dr) return dr;
        if (dr.type === "pen") { const last = dr.points![dr.points!.length - 1]; return dist(last, p) * scale > 2 ? { ...dr, points: [...dr.points!, p] } : dr; }
        return { ...dr, b: p };
      });
    }
  }
  async function onUp() {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (d.mode === "move" || d.mode === "handle") {
      if (d.before && d.before !== shapes) { setPast((p) => [...p.slice(-60), d.before!]); setFuture([]); }
      return;
    }
    if (d.mode === "tbdraw" && draft) {
      const { a, b } = draft; setDraft(null);
      const dragged = Math.abs(b!.x - a!.x) * scale > 24;
      const n = numbered ? nextNum(shapes, "text") : undefined;
      const t = await askText({ title: n ? `Text box #${n}` : "Text box", placeholder: "e.g. Settled section — reset curb\nEnter for a new line", confirm: "Add", multiline: true });
      if (!t?.trim()) return;
      let box: Shape = { id: uid(), type: "text", color, size, at: a!, text: t.trim(), font, bg, num: n };
      if (dragged) {
        const x0 = Math.min(a!.x, b!.x), y0 = Math.min(a!.y, b!.y);
        box = { ...box, w: Math.abs(b!.x - a!.x), h: Math.abs(b!.y - a!.y) };
        const L = textLayout(box, base);
        box = { ...box, h: L.h, at: { x: x0 + L.w / 2, y: y0 + L.h / 2 } };
      }
      box = clampBox(box);
      commit([...shapes, box]);
      setTool("select"); setSel(box.id);
      return;
    }
    if (d.mode !== "draw" || !draft) return;
    const dr = draft; setDraft(null);
    const tiny = dr.type === "pen" ? (dr.points?.length || 0) < 2 : dist(dr.a!, dr.b!) * scale < 6;
    if (tiny) return;
    if (dr.type === "dim") {
      const t = await askText({ title: "Measurement", placeholder: "e.g. 14 ft, 6\", 3' 4\"", confirm: "Add" });
      if (t === null) return;
      commit([...shapes, { ...dr, text: t.trim() }]);
      return;
    }
    commit([...shapes, dr]);
  }

  function deleteSel() { if (!sel) return; commit(shapes.filter((s) => s.id !== sel)); setSel(null); }
  async function editSelText() {
    const s = shapes.find((x) => x.id === sel); if (!s || (s.type !== "text" && s.type !== "dim")) return;
    const t = await askText({ title: s.type === "dim" ? "Measurement" : "Edit text", initial: s.text || "", confirm: "Save", multiline: s.type === "text" });
    if (t === null) return;
    commit(shapes.map((x) => (x.id === sel ? { ...x, text: t.trim() } : x)));
  }
  async function editSelNum() {
    const s = shapes.find((x) => x.id === sel); if (!s) return;
    const t = await askText({ title: "Number", initial: String(s.num ?? nextNum(shapes, s.type === "text" ? "text" : "num")), confirm: "Save" });
    if (t === null) return;
    const n = parseInt(t, 10);
    if (!Number.isFinite(n) || n < 0) { showError("Use a whole number."); return; }
    commit(shapes.map((x) => (x.id === sel ? { ...x, num: n } : x)));
  }
  // text-box style: sets the default for new boxes and restyles the selected box
  function styleText(patch: Partial<Shape>) {
    if (patch.font) setFont(patch.font);
    if (patch.bg) setBg(patch.bg);
    if (sel && selIsText) commit(shapes.map((x) => (x.id === sel ? clampBox({ ...x, bg: x.bg ?? bg, font: x.font ?? font, ...patch }) : x)));
  }
  function nudgeText(dir: 1 | -1) {
    if (!(sel && selIsText)) return;
    commit(shapes.map((x) => {
      if (x.id !== sel) return x;
      const before = { ...x, bg: x.bg ?? bg }, L0 = textLayout(before, base);
      const next: Shape = { ...before, ts: Math.max(0.5, Math.min(4, Math.round(((x.ts || 1) * (dir > 0 ? 1.15 : 1 / 1.15)) * 100) / 100)) };
      const L1 = textLayout(next, base);
      return clampBox({ ...next, h: next.h ? Math.max(next.h, L1.h) : undefined, at: { x: L0.x0 + L1.w / 2, y: L0.y0 + L1.h / 2 } });
    }));
  }
  function fitBox() {
    if (!(sel && selIsText)) return;
    commit(shapes.map((x) => (x.id === sel ? clampBox({ ...x, w: undefined, h: undefined }) : x)));
  }
  function toggleNumber() {
    if (sel && selIsText) {
      const s = shapes.find((x) => x.id === sel)!;
      commit(shapes.map((x) => (x.id === sel ? { ...x, bg: x.bg ?? bg, num: s.num != null ? undefined : nextNum(shapes, "text") } : x)));
    } else setNumbered((v) => !v);
  }
  // restyle the selected shape with the color / size buttons
  function pickColor(c: string) { setColor(c); if (sel) commit(shapes.map((x) => (x.id === sel ? { ...x, color: c } : x))); }
  function pickSize(n: number) { setSize(n); if (sel) commit(shapes.map((x) => (x.id === sel ? { ...x, size: n } : x))); }
  async function clearAll() { if (!shapes.length) return; if (await ask({ title: "Clear all markup?", confirm: "Clear", danger: true })) { commit([]); setSel(null); } }

  // keyboard (desktop)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select,[role=dialog]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); deleteSel(); }
      else if (e.key === "Enter" && draft?.type === "path") finishOrDropDraft();
      else if (e.key === "Escape") { if (draft) { setDraft(null); setHover(null); } else setSel(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  async function render(): Promise<string> {
    const c = document.createElement("canvas");
    c.width = img!.naturalWidth; c.height = img!.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img!, 0, 0);
    const all = draft && draft.type === "path" && (draft.points?.length || 0) >= 2 ? [...shapes, draft] : shapes;
    all.forEach((s) => drawShape(ctx, s, base));
    await drawStamp(ctx, c.width, c.height).catch(() => {}); // Isola badge, bottom-right, on top of the markup
    return c.toDataURL("image/jpeg", 0.85);
  }
  async function download() {
    const a = document.createElement("a");
    const job = jobs.find((j) => j.id === jobId)?.job_name || "Isola";
    a.href = await render(); a.download = `${job.replace(/[^\w]+/g, "_")}_markup.jpg`; a.click();
  }
  async function save(asNew = false) {
    if (!jobId) { showError("Pick the job to save it to."); return; }
    if (draft?.type === "path") finishOrDropDraft();
    setBusy(true);
    try {
      const all = draft && draft.type === "path" && (draft.points?.length || 0) >= 2 ? [...shapes, draft] : shapes;
      const markup: Markup = { v: 1, w: img!.naturalWidth, h: img!.naturalHeight, shapes: all };
      const out = await render();
      let source = srcPhoto;
      if (!source || source.job_id !== jobId) {
        // uploaded photo (or moved to another job): keep the clean original on the job too
        const orig = canvasToB64(img!);
        const { data, error } = await sb.from("job_photos").insert({ job_id: jobId, phase: srcPhoto?.phase || "before", photo_b64: orig, caption: "Original" }).select("id,job_id,phase").single();
        if (error) throw error;
        source = data; setSrcPhoto(data);
      }
      if (editRow && !asNew && editRow.job_id === jobId) {
        const { error } = await sb.from("job_photos").update({ photo_b64: out, markup }).eq("id", editRow.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("job_photos").insert({ job_id: jobId, phase: source.phase || "before", photo_b64: out, caption: "Marked up", markup, source_photo_id: source.id }).select("id,job_id,phase,caption").single();
        if (error) throw error;
        setEditRow(data);
      }
      window.dispatchEvent(new Event("isola:changed"));
      showToast("Saved to " + (jobs.find((j) => j.id === jobId)?.job_name || "the job"));
    } catch (e: any) { showError("Save failed: " + (e?.message || e)); } finally { setBusy(false); }
  }
  function canvasToB64(i: HTMLImageElement) {
    if (i.src.startsWith("data:image/jpeg")) return i.src;
    const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight;
    c.getContext("2d")!.drawImage(i, 0, 0); return c.toDataURL("image/jpeg", 0.85);
  }

  const selShape = shapes.find((x) => x.id === sel);
  const hint =
    tool === "path" ? (draft ? `${draft.points?.length} point${draft.points?.length === 1 ? "" : "s"} · tap to add more · tap the first point to close it · Done to finish` : "Tap to drop each point — lines connect as you go")
    : tool === "select" ? (selShape ? (selShape.type === "text" ? (isBox(selShape) ? "Drag to move · drag a corner dot to resize the box — text wraps to fit" : "Drag to move · change text color, size, font, box color or number below") : "Drag to move · drag a white dot to reshape · color and size buttons restyle it") : "Tap a mark to select it")
    : tool === "dim" ? "Drag from one end to the other, then type the measurement"
    : tool === "text" ? "Tap for a box that fits the text, or drag to draw the box the size you want"
    : tool === "num" ? `Tap to drop numbered dots (next: ${nextNum(shapes)}) · color buttons set the dot color`
    : tool === "pen" ? "Draw with your finger" : "Drag to draw";

  // ---------- picker ----------
  if (!img) {
    return (
      <div>
        {embedded ? (
          <div className="mb-3 flex items-center gap-2">
            <h1 className="mr-auto text-xl font-semibold text-white">Mark up a photo</h1>
            <Button variant="ghost" size="sm" onClick={() => onClose?.()}><X size={16} /> Close</Button>
          </div>
        ) : <PageHeader title="Photo markup" sub="Draw on a photo — points, arrows, measurements, boxes and notes — then save it to the job." />}
        <div className={cn("grid gap-3", embedded ? "" : "md:grid-cols-2")}>
          <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-card p-5 text-center hover:border-brand">
            <Upload size={26} className="text-brand" />
            <span className="text-[15px] font-semibold text-white">{busy ? "Opening…" : "Upload or take a photo"}</span>
            <span className="text-sm text-neutral-400">From your camera roll, a text, or the camera</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {embedded ? null : <div className="rounded-xl border border-white/[0.09] bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-white"><Camera size={18} className="text-brand" /> From a job</div>
            <NativeSelect value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-full">
              <option value="">Pick a job…</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.job_name}{j.customer ? ` — ${j.customer}` : ""}</option>)}
            </NativeSelect>
          </div>}
        </div>
        {jobId ? (
          <div className="mt-5">
            {jobPhotos === null ? <div className="grid grid-cols-3 gap-2 md:grid-cols-5"><div className="skeleton h-28" /><div className="skeleton h-28" /><div className="skeleton h-28" /></div>
              : !jobPhotos.length ? <Empty icon={<ImagePlus size={26} />} title="No photos on this job yet" body="Upload one above — it saves to this job when you hit Save." />
              : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {jobPhotos.map((p) => (
                    <button key={p.id} onClick={() => openJobPhoto(p.id)} className="group relative block overflow-hidden rounded-lg border border-white/[0.08] hover:border-brand">
                      <img src={p.photo_b64} alt={p.phase} className="h-28 w-full object-cover" />
                      <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-xs font-semibold capitalize text-neutral-200">{p.source_photo_id ? "Marked up" : p.phase}</span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        ) : null}
      </div>
    );
  }

  // ---------- editor ----------
  const job = jobs.find((j) => j.id === jobId);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-white">Photo markup{job ? <span className="font-normal text-neutral-400"> · {job.job_name}</span> : null}</h1>
        <Button variant="ghost" size="sm" onClick={startOver}><X size={16} /> Close</Button>
      </div>

      {/* tools */}
      <div className="no-scrollbar -mx-1 mb-2 flex gap-1 overflow-x-auto px-1">
        {TOOLS.map(({ t, label, icon: I }) => (
          <button key={t} onClick={() => { if (draft?.type === "path" && t !== "path") finishOrDropDraft(); setTool(t); if (t !== "select") setSel(null); }}
            className={cn("flex min-h-[48px] min-w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 text-[12px] font-semibold",
              tool === t ? "border-brand bg-brand text-neutral-950" : "border-white/[0.09] bg-card text-neutral-300 hover:text-white")}>
            <I size={18} strokeWidth={2.2} />{label}
          </button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          {tool === "text" || selShape?.type === "text" ? <span className="mr-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Text</span> : null}
          {COLORS.map((c) => (
            <button key={c.v} aria-label={c.n} onClick={() => pickColor(c.v)}
              className={cn("h-8 w-8 rounded-full border-2", (selShape ? selShape.color : color) === c.v ? "border-white ring-2 ring-brand ring-offset-2 ring-offset-background" : "border-white/20")}
              style={{ background: c.v }} />
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border bg-neutral-950 p-0.5">
          {[1, 2, 3].map((n) => (
            <button key={n} onClick={() => pickSize(n)} aria-label={["", "Thin", "Medium", "Thick"][n]}
              className={cn("flex h-8 w-10 items-center justify-center rounded-md", (selShape ? selShape.size : size) === n ? "bg-brand" : "")}>
              <span className={cn("block rounded-full", (selShape ? selShape.size : size) === n ? "bg-neutral-950" : "bg-neutral-300")} style={{ width: 18, height: n * 2 + 1 }} />
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Undo" onClick={undo} disabled={!past.length && !draft}><Undo2 size={18} /></Button>
          <Button variant="ghost" size="icon" aria-label="Redo" onClick={redo} disabled={!future.length}><Redo2 size={18} /></Button>
          <Button variant="ghost" size="icon" aria-label="Clear all" onClick={clearAll} disabled={!shapes.length}><Trash2 size={18} /></Button>
        </div>
      </div>

      {tool === "text" || selShape?.type === "text" ? (() => {
        const curFont = selShape?.type === "text" ? selShape.font ?? "sans" : font;
        const curBg = selShape?.type === "text" ? selShape.bg ?? "legacy" : bg;
        const isNum = selShape?.type === "text" ? selShape.num != null : numbered;
        return (
          <div className="mb-2 rounded-lg border border-white/[0.09] bg-card p-2">
            <div className="mb-2 flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-500">Font</span>
              <div className="no-scrollbar flex gap-1 overflow-x-auto">
                {FONTS.map((f) => (
                  <button key={f.k} onClick={() => styleText({ font: f.k })}
                    className={cn("h-9 shrink-0 rounded-md border px-3 text-[15px]", curFont === f.k ? "border-brand bg-brand text-neutral-950" : "border-white/[0.09] text-neutral-200 hover:text-white")}
                    style={{ font: f.css(15) }}>{f.label}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-500">Box</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {BGS.map((b) => (
                  <button key={b.v} aria-label={b.n} title={b.n} onClick={() => styleText({ bg: b.v })}
                    className={cn("flex h-8 w-8 items-center justify-center rounded-md border-2", curBg === b.v ? "border-white ring-2 ring-brand ring-offset-2 ring-offset-background" : "border-white/20")}
                    style={{ background: b.v === "none" ? "transparent" : b.v }}>
                    {b.v === "none" ? <Ban size={16} className="text-neutral-400" /> : b.v.startsWith("rgba") ? <span className="text-[10px] font-bold text-white/80">50%</span> : null}
                  </button>
                ))}
              </div>
              {selShape?.type === "text" ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => nudgeText(-1)} aria-label="Smaller text" className="h-9 rounded-md border border-white/[0.09] px-2.5 text-[13px] font-bold text-neutral-200 hover:text-white">A−</button>
                  <button onClick={() => nudgeText(1)} aria-label="Bigger text" className="h-9 rounded-md border border-white/[0.09] px-2.5 text-[16px] font-bold text-neutral-200 hover:text-white">A+</button>
                  {selShape.w ? <button onClick={fitBox} className="h-9 rounded-md border border-white/[0.09] px-2.5 text-[13px] font-semibold text-neutral-300 hover:text-white">Fit to text</button> : null}
                </div>
              ) : null}
              <button onClick={toggleNumber}
                className={cn("ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold", isNum ? "border-brand bg-brand text-neutral-950" : "border-white/[0.09] text-neutral-300 hover:text-white")}>
                <Hash size={15} /> {isNum ? (selShape?.type === "text" ? `Numbered #${selShape.num}` : `Numbered · next ${nextNum(shapes, "text")}`) : "Number it"}
              </button>
            </div>
          </div>
        );
      })() : null}

      <div className="mb-2 flex min-h-[36px] flex-wrap items-center gap-2 text-[13px] text-neutral-400">
        <span className="mr-auto">{hint}</span>
        {draft?.type === "path" ? (
          <>
            <Button variant="outline" size="sm" onClick={() => finishOrDropDraft(true)}>Undo point</Button>
            {(draft.points?.length || 0) >= 3 ? <Button variant="outline" size="sm" onClick={closePath}>Close shape</Button> : null}
            <Button size="sm" onClick={() => finishOrDropDraft()} disabled={(draft.points?.length || 0) < 2}><Check size={15} /> Done</Button>
          </>
        ) : selShape ? (
          <>
            {selShape.type === "text" || selShape.type === "dim" ? <Button variant="outline" size="sm" onClick={editSelText}>Edit {selShape.type === "dim" ? "measurement" : "text"}</Button> : null}
            {selShape.num != null ? <Button variant="outline" size="sm" onClick={editSelNum}>Change #{selShape.num}</Button> : null}
            <Button variant="destructive" size="sm" onClick={deleteSel}><Trash2 size={15} /> Delete</Button>
          </>
        ) : null}
      </div>

      <div ref={wrapRef} className="flex w-full justify-center">
        <canvas ref={canvasRef}
          style={{ width: view.w, height: view.h, touchAction: "none", cursor: tool === "select" ? "default" : "crosshair" }}
          className="rounded-lg border border-white/[0.09] bg-black select-none"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onPointerLeave={() => setHover(null)} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {embedded ? null : <NativeSelect value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-full sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-sm">
          <option value="">Save to which job?</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.job_name}</option>)}
        </NativeSelect>}
        <Button onClick={() => save(false)} disabled={busy || !jobId}><Save size={16} /> {busy ? "Saving…" : editRow && editRow.job_id === jobId ? "Save changes" : "Save to job"}</Button>
        {editRow && editRow.job_id === jobId ? <Button variant="outline" onClick={() => save(true)} disabled={busy}>Save as new</Button> : null}
        <Button variant="outline" onClick={download}><Download size={16} /> Download</Button>
      </div>
      <p className="mt-2 text-xs text-neutral-500">The original photo stays untouched. The marked-up copy goes in the job&apos;s Photos as “Marked up”, and you can reopen it later to change the drawing.</p>
    </div>
  );
}
