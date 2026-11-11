"use client";
// v5.1 (10/16/26): Photo markup. Draw on a job photo or an uploaded one — arrows, lines,
// point-by-point lines (tap each point, tap the first point to close), dimension lines with a
// label, boxes, circles, freehand and text — then save the marked-up copy back to the job
// (original stays untouched, the drawing stays editable) or download it.
// v9.0 (11/7/26): legend maps — Symbol tool (tie-in X, cleanout, DW/CB/MH structures, repair hexagon,
// G1/G2 tags), dashed runs, flow arrows, pointer lines from text boxes, and a legend box that builds itself.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MousePointer2, Pencil, Minus, MoveUpRight, Spline, Ruler, Square, Circle, Type, Hash, Ban,
  Undo2, Redo2, Trash2, Download, Save, Upload, ImagePlus, X, Check, Camera, Copy, Shapes, Eye, EyeOff,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import { PageHeader, Empty } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { showError, showToast } from "@/components/Toaster";
import { ask, askText } from "@/components/Dialogs";
import { BRANDS, drawStamp, stampSafe, type Brand } from "@/lib/stamp";
import { isStored, kickMediaSync, useFallbackImages, useSignedUrls } from "@/lib/media";

type P = { x: number; y: number };
type Shape = {
  id: string;
  type: "pen" | "line" | "arrow" | "path" | "dim" | "rect" | "ellipse" | "text" | "num" | "sym";
  color: string;  // line color / text color / numbered-pin fill
  size: number;   // 1 small, 2 medium, 3 large
  a?: P; b?: P; points?: P[]; closed?: boolean; at?: P; text?: string;
  // text boxes (v5.2): font, box background ("none" = no box), optional number badge.
  // Text with no `bg` is an older label and keeps the original pill look.
  font?: FontKey; bg?: string; num?: number;
  // v5.3: box size set by dragging its corners (text wraps to w; h can add room below), and a text-size nudge
  w?: number; h?: number; ts?: number;
  ref?: string;   // v5.6: a note box points at the numbered dot it explains
  // v9.0 (11/7/26): legend maps — site symbols, dashed runs, flow arrows, pointer lines from boxes
  sym?: SymKind;      // which site symbol (type "sym")
  dash?: boolean;     // dashed run (buried / approximate)
  flow?: number;      // flow-direction arrows along the run (0-4)
  nodots?: boolean;   // Points line without the corner dots
  to?: P;             // text box pointer line tip
};
type SymKind = "tiein" | "cleanout" | "struct" | "warn" | "tag" | "dot" | "replace" | "repoint";
// v9.0: legend box drawn on the photo — entries build themselves from what's drawn; labels are editable
type LegendCfg = { on: boolean; pos: "tl" | "tr" | "bl" | "br"; title: string; labels: Record<string, string>; hide: string[]; note: string; scale: number };
type Tool = "select" | Shape["type"];
// v5.4: caption = "what we're looking at", saved as the photo's caption and (optionally) printed along the bottom
type Panel = { side: "right" | "bottom"; title: string; items: string[]; titleScale?: number; colors?: Record<number, string> };
// v8.2: colors = step number -> the color of numbered dot N on the photo, so the panel dots match
type CapPos = "tl" | "tr" | "bl" | "br";
type Markup = { v: 1; w: number; h: number; shapes: Shape[]; caption?: string; showCap?: boolean; capScale?: number; capPos?: CapPos; panel?: Panel | null; brand?: Brand; legend?: LegendCfg | null };
// v7.4 (11/2/26): the corner logo is picked per markup, and the steps panel + caption accent follow that brand's colors
type Theme = { bg: string; bar: string; title: string; dot: string; text: string; note: string; rule: string; accent: string };
const THEMES: Record<Brand, Theme> = {
  isola: { bg: "#0E1114", bar: "#F2C230", title: "#F2C230", dot: "#F2C230", text: "#FFFFFF", note: "#B4BAC0", rule: "rgba(255,255,255,0.18)", accent: "#F2C230" },
  // Clear Path Construction logo: white field, dark green ring #013F01, bright green #288402, charcoal #252520
  cpc: { bg: "#FFFFFF", bar: "#013F01", title: "#288402", dot: "#288402", text: "#252520", note: "#5E5E58", rule: "rgba(37,37,32,0.18)", accent: "#288402" },
};

const COLORS = [
  { v: "#F2C230", n: "Yellow" },
  { v: "#EF4444", n: "Red" },
  { v: "#2F80FF", n: "Blue" },
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
  { t: "sym", label: "Symbol", icon: Shapes },
];
const SIZE_MULT = [0, 0.7, 1.2, 2];
// v5.7: quick picks for the steps-panel heading (any custom title still works)
const PANEL_TITLES = ["Scope of work", "Observations", "Existing conditions", "Problem areas", "Repair steps", "Recommendations", "Work completed", "Notes"];
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
function strokeW(s: Shape, base: number) { return base * SIZE_MULT[s.size || 2] * (s.ts || 1); }

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
  if (s.dash && s.type !== "text" && s.type !== "sym" && s.type !== "num") { ctx.setLineDash([lw * 2.6, lw * 2]); ctx.lineCap = "butt"; }
  // thin dark halo under light colors so lines read on bright photos
  const halo = !isDark(s.color) && s.type !== "text" && s.type !== "sym";
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
    case "line": stroke(() => { ctx.beginPath(); ctx.moveTo(s.a!.x, s.a!.y); ctx.lineTo(s.b!.x, s.b!.y); }); flowArrows(ctx, [s.a!, s.b!], s.flow || 0, lw, base, s.color); break;
    case "arrow": {
      const a = s.a!, b = s.b!, ang = Math.atan2(b.y - a.y, b.x - a.x), hl = Math.max(lw * 3.6, base * 4.5);
      const head = () => { ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - hl * Math.cos(ang - 0.45), b.y - hl * Math.sin(ang - 0.45)); ctx.lineTo(b.x - hl * Math.cos(ang + 0.45), b.y - hl * Math.sin(ang + 0.45)); ctx.closePath(); };
      stroke(() => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x - hl * 0.6 * Math.cos(ang), b.y - hl * 0.6 * Math.sin(ang)); });
      if (halo) { ctx.save(); ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = Math.max(1.5, lw * 0.5); head(); ctx.stroke(); ctx.restore(); }
      head(); ctx.setLineDash([]); ctx.fill();
      flowArrows(ctx, [a, b], s.flow || 0, lw, base, s.color);
      break;
    }
    case "path": {
      const pts = s.points || [];
      if (!pts.length) break;
      if (pts.length > 1) stroke(() => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); if (s.closed) ctx.closePath(); });
      if (s.closed) { ctx.save(); ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.restore(); }
      if (s.flow && pts.length > 1) flowArrows(ctx, s.closed ? [...pts, pts[0]] : pts, s.flow, lw, base, s.color);
      ctx.setLineDash([]);
      if (opts.dots !== false && (!s.nodots || opts.firstRing)) {
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
      if (s.text) pill(ctx, s.text, (a.x + b.x) / 2, (a.y + b.y) / 2, base * 5.2 * (0.75 + (s.size || 2) * 0.2) * (s.ts || 1), s.color);
      break;
    }
    case "rect": stroke(() => { ctx.beginPath(); ctx.rect(Math.min(s.a!.x, s.b!.x), Math.min(s.a!.y, s.b!.y), Math.abs(s.b!.x - s.a!.x), Math.abs(s.b!.y - s.a!.y)); }); break;
    case "ellipse": stroke(() => { ctx.beginPath(); ctx.ellipse((s.a!.x + s.b!.x) / 2, (s.a!.y + s.b!.y) / 2, Math.abs(s.b!.x - s.a!.x) / 2 || 0.5, Math.abs(s.b!.y - s.a!.y) / 2 || 0.5, 0, 0, Math.PI * 2); }); break;
    case "text":
      if (s.bg !== undefined) { if (s.text) { if (s.to) drawLeader(ctx, s, base); drawTextBox(ctx, s, base); } }
      else if (s.text) pill(ctx, s.text, s.at!.x, s.at!.y, base * 6 * (0.7 + (s.size || 2) * 0.25) * (s.ts || 1), s.color);
      break;
    case "num": {
      const r = pinR(s, base);
      ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = r * 0.35; ctx.shadowOffsetY = r * 0.06;
      ctx.beginPath(); ctx.arc(s.at!.x, s.at!.y, r * 1.12, 0, Math.PI * 2); ctx.fillStyle = contrast(s.color); ctx.fill();
      ctx.shadowColor = "transparent";
      numDot(ctx, s.num ?? 1, s.at!.x, s.at!.y, r, s.color);
      break;
    }
    case "sym": drawSym(ctx, s.sym || "dot", s.at!.x, s.at!.y, symR(s, base), s.color, s.text || ""); break;
  }
  ctx.restore();
}

// ---------- v9.0 legend-map pieces ----------
// flow-direction arrowheads spaced evenly along a run
function flowArrows(ctx: CanvasRenderingContext2D, pts: P[], n: number, lw: number, base: number, color: string) {
  if (!n || pts.length < 2) return;
  const segs = pts.slice(1).map((b, i) => ({ a: pts[i], b, L: dist(pts[i], b) }));
  const total = segs.reduce((t, x) => t + x.L, 0);
  if (!total) return;
  const hl = Math.max(lw * 3.2, base * 4);
  ctx.save(); ctx.setLineDash([]);
  for (let k = 1; k <= n; k++) {
    let d = (total * k) / (n + 1);
    for (const sg of segs) {
      if (d > sg.L) { d -= sg.L; continue; }
      const t = sg.L ? d / sg.L : 0, ang = Math.atan2(sg.b.y - sg.a.y, sg.b.x - sg.a.x);
      const tip = { x: sg.a.x + (sg.b.x - sg.a.x) * t + Math.cos(ang) * hl * 0.5, y: sg.a.y + (sg.b.y - sg.a.y) * t + Math.sin(ang) * hl * 0.5 };
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - hl * Math.cos(ang - 0.5), tip.y - hl * Math.sin(ang - 0.5));
      ctx.lineTo(tip.x - hl * Math.cos(ang + 0.5), tip.y - hl * Math.sin(ang + 0.5));
      ctx.closePath();
      ctx.lineWidth = Math.max(1.5, lw * 0.35); ctx.strokeStyle = isDark(color) ? "#FFFFFF" : "rgba(0,0,0,0.55)"; ctx.stroke();
      ctx.fillStyle = color; ctx.fill();
      break;
    }
  }
  ctx.restore();
}
const symR = (s: Shape, base: number) => base * ({ tiein: 3.2, cleanout: 2.4, struct: 4.6, warn: 3.8, tag: 3.4, dot: 2.6, replace: 3.6, repoint: 3.6 } as Record<SymKind, number>)[s.sym || "dot"] * (0.6 + (s.size || 2) * 0.2) * (s.ts || 1);
const SYMS: { k: SymKind; label: string; color: string; text?: string }[] = [
  { k: "replace", label: "Replace brick", color: "#EF4444" },
  { k: "repoint", label: "Repoint", color: "#F2C230" },
  { k: "tiein", label: "Tie-in X", color: "#F2C230" },
  { k: "cleanout", label: "Cleanout", color: "#FFFFFF" },
  { k: "struct", label: "Structure", color: "#0B0D0E", text: "DW" },
  { k: "warn", label: "Repair !", color: "#F97316" },
  { k: "tag", label: "Tag", color: "#FFFFFF", text: "G1" },
  { k: "dot", label: "Dot", color: "#EF4444" },
];
const hasSymText = (s: Shape) => s.type === "sym" && (s.sym === "struct" || s.sym === "tag");
const LINE_TYPES = new Set<Shape["type"]>(["line", "arrow", "path", "pen", "rect", "ellipse"]);
// next tag continues the last one: G1 -> G2, Unit 4 -> Unit 5
function nextTag(list: Shape[]) {
  const last = [...list].reverse().find((x) => x.type === "sym" && x.sym === "tag" && x.text);
  if (!last) return "G1";
  const m = last.text!.match(/^(.*?)(\d+)$/);
  return m ? m[1] + (parseInt(m[2], 10) + 1) : last.text!;
}
function drawSym(ctx: CanvasRenderingContext2D, k: SymKind, x: number, y: number, r: number, color: string, text: string) {
  const lw = Math.max(1.5, r * 0.16);
  ctx.save(); ctx.setLineDash([]); ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = r * 0.3;
  const sans = (px: number, w = 800) => `${w} ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  switch (k) {
    case "tiein": {
      const X = () => { ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); };
      ctx.strokeStyle = isDark(color) ? "#FFFFFF" : "#0B0D0E"; ctx.lineWidth = lw * 3.2; X(); ctx.stroke();
      ctx.shadowColor = "transparent"; ctx.strokeStyle = color; ctx.lineWidth = lw * 1.9; X(); ctx.stroke();
      break;
    }
    case "cleanout": {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.shadowColor = "transparent"; ctx.lineWidth = lw; ctx.strokeStyle = contrast(color); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r * 0.62, y); ctx.lineTo(x + r * 0.62, y); ctx.moveTo(x, y - r * 0.62); ctx.lineTo(x, y + r * 0.62); ctx.stroke();
      break;
    }
    case "struct": {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.shadowColor = "transparent"; ctx.lineWidth = lw; ctx.strokeStyle = contrast(color); ctx.stroke();
      const t = (text || "").slice(0, 4), fs = r * (t.length <= 2 ? 0.82 : t.length === 3 ? 0.62 : 0.5);
      ctx.font = sans(fs); ctx.fillStyle = contrast(color); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(t, x, y + fs * 0.05);
      break;
    }
    case "warn": {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; i ? ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a)); }
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
      ctx.shadowColor = "transparent"; ctx.lineWidth = lw; ctx.strokeStyle = contrast(color) === "#FFFFFF" ? "#FFFFFF" : "#0B0D0E"; ctx.stroke();
      ctx.font = sans(r * 1.15, 900); ctx.fillStyle = contrast(color); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text || "!", x, y + r * 0.06);
      break;
    }
    case "tag": {
      const t = text || "", fs = r * 0.95;
      ctx.font = sans(fs);
      const w = Math.max(fs * 1.2, ctx.measureText(t).width) + fs * 0.8, h = fs * 1.5;
      rrect(ctx, x - w / 2, y - h / 2, w, h, fs * 0.28); ctx.fillStyle = color; ctx.fill();
      ctx.shadowColor = "transparent"; ctx.lineWidth = Math.max(1.2, fs * 0.09); ctx.strokeStyle = contrast(color); ctx.stroke();
      ctx.fillStyle = contrast(color); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, x, y + fs * 0.05);
      break;
    }
    case "replace":
    case "repoint": {
      // a single brick: solid red "R" = remove & replace the brick; yellow outline "P" = repoint the joints
      const bw = r * 2, bh = r * 1.05;
      rrect(ctx, x - bw / 2, y - bh / 2, bw, bh, r * 0.12);
      if (k === "replace") { ctx.fillStyle = color; ctx.fill(); }
      else { ctx.fillStyle = "rgba(11,13,14,0.55)"; ctx.fill(); }
      ctx.shadowColor = "transparent";
      ctx.lineWidth = k === "replace" ? lw : lw * 2.2; ctx.strokeStyle = k === "replace" ? "#FFFFFF" : color; ctx.stroke();
      ctx.font = sans(bh * 0.78, 900); ctx.fillStyle = k === "replace" ? "#FFFFFF" : color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(k === "replace" ? "R" : "P", x, y + bh * 0.04);
      break;
    }
    default: {
      ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.shadowColor = "transparent"; ctx.lineWidth = lw; ctx.strokeStyle = contrast(color); ctx.stroke();
    }
  }
  ctx.restore();
}
// pointer line from the nearest edge of a text box to the spot it names
function drawLeader(ctx: CanvasRenderingContext2D, s: Shape, base: number) {
  const L = textLayout(s, base, ctx), tip = s.to!;
  const x1 = L.x0 + L.w, y1 = L.y0 + L.h;
  const inside = tip.x >= L.x0 && tip.x <= x1 && tip.y >= L.y0 && tip.y <= y1;
  if (inside) return;
  const cx = Math.min(Math.max(tip.x, L.x0), x1), cy = Math.min(Math.max(tip.y, L.y0), y1);
  const cands = [{ x: cx, y: L.y0 }, { x: cx, y: y1 }, { x: L.x0, y: cy }, { x: x1, y: cy }];
  const start = cands.reduce((m, c) => (dist(c, tip) < dist(m, tip) ? c : m));
  const w = Math.max(1.5, base * 0.75);
  ctx.save(); ctx.setLineDash([]); ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = w * 2.6;
  ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
  ctx.strokeStyle = "#0B0D0E"; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(tip.x, tip.y, w * 1.6, 0, Math.PI * 2); ctx.fillStyle = "#0B0D0E"; ctx.fill();
  ctx.lineWidth = w * 0.8; ctx.strokeStyle = "#FFFFFF"; ctx.stroke();
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
// caption strip along the bottom of the photo, kept left of the Isola logo (same size/margin as lib/stamp)
// v9.2: the caption can sit in any corner; bottom-right sits above the logo badge
const capMaxW = (W: number, short: number, pos: CapPos) => {
  const D = Math.max(40, Math.min(220, short * 0.14)), m = short * 0.025, gap = short * 0.015;
  return pos === "bl" ? W - m - D - gap - m : W - m * 2;
};
function drawCaption(ctx: CanvasRenderingContext2D, text: string, W: number, H: number, scale = 1, th: Theme = THEMES.isola, pos: CapPos = "bl") {
  const t = text.trim(); if (!t) return;
  const short = Math.min(W, H), D = Math.max(40, Math.min(220, short * 0.14)), m = short * 0.025, gap = short * 0.015;
  const f = Math.max(14, short * 0.038) * scale, padX = f * 0.7, padY = f * 0.45, lh = f * 1.25;
  const maxW = capMaxW(W, short, pos);
  ctx.save();
  ctx.font = `700 ${f}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  let lines = wrapLines(ctx, t.split("\n"), maxW - padX * 2);
  if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = lines[2].replace(/\s*\S*$/, "") + "…"; }
  const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2);
  const h = lines.length * lh + padY * 2;
  const x = pos.endsWith("r") ? W - m - w : m;
  const y = pos.startsWith("t") ? m : pos === "br" ? H - m - D - gap - h : H - m - h;
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = f * 0.4;
  rrect(ctx, x, y, w, h, f * 0.3); ctx.fillStyle = "rgba(11,13,14,0.80)"; ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = th.accent; ctx.fillRect(x, y + f * 0.3, Math.max(3, f * 0.14), h - f * 0.6);
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, x + padX, y + padY + lh * (i + 0.5)));
  ctx.restore();
}
// v7.3: a line that starts with ** is a disclosure — no number, printed small at the bottom of the panel
// forgiving: any star character (* ＊ ∗ ✱ ★ etc.) at the start, one or two of them, or ** at the end
const STAR = "[*\\uFF0A\\u2217\\u2731\\u2605\\u22C6\\u204E]";
const NOTE_START = new RegExp("^\\s*" + STAR), NOTE_END = new RegExp(STAR + STAR + "\\s*$");
const isNote = (t: string) => NOTE_START.test(t) || NOTE_END.test(t);
const noteText = (t: string) => t.replace(new RegExp("^\\s*(" + STAR + "\\s*)+"), "").replace(new RegExp("(\\s*" + STAR + ")+\\s*$"), "").trim();
// step number for each line (null for ** notes); blank lines keep their number so step 3 stays #3
function stepNums(items: string[]): (number | null)[] {
  let n = 0;
  return items.map((t) => (isNote(t) ? null : ++n));
}
// v5.6: steps panel — a dark section split off the photo (right side or below) listing numbered steps
function panelLayout(p: Panel, W: number, H: number) {
  const c = (measureCtx ??= document.createElement("canvas").getContext("2d")!);
  const sn = stepNums(p.items);
  const all = p.items.map((t, i) => ({ t: t.trim(), n: sn[i] })).filter((x) => x.t && x.n !== null);
  const items = all.map((x) => x.t), nums = all.map((x) => x.n as number);
  const notes = p.items.filter(isNote).map(noteText).filter(Boolean);
  const pw = p.side === "right" ? Math.round(Math.max(W * 0.34, Math.min(W * 0.6, H * 0.62))) : W;
  let f = p.side === "right" ? pw * 0.05 : Math.min(W, H * 1.4) * 0.028;
  for (let tries = 0; tries < 14; tries++) {
    const pad = f * 1.3, r = f * 0.85, lh = f * 1.3, gap = f * 0.75;
    // title size is adjustable; it never runs wider than the panel
    let titleF = f * 1.15 * (p.titleScale ?? 1);
    c.save(); c.font = `800 ${titleF}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    const tw = c.measureText((p.title || "Scope of work").toUpperCase()).width; c.restore();
    if (tw > pw - pad * 2) titleF *= (pw - pad * 2) / tw;
    const textX = pad + r * 2 + f * 0.6, maxW = pw - textX - pad;
    c.save(); c.font = `600 ${f}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    const rows = items.map((t) => wrapLines(c, t.split("\n"), Math.max(f * 3, maxW)));
    const noteF = f * 0.78, noteLh = noteF * 1.3;
    c.font = `italic 500 ${noteF}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    const noteRows = notes.map((t) => wrapLines(c, ("* " + t).split("\n"), Math.max(f * 3, pw - pad * 2)));
    c.restore();
    const rowsH = rows.reduce((a, l) => a + Math.max(r * 2, l.length * lh) + gap, 0);
    const notesH = noteRows.length ? f * 0.7 + noteRows.reduce((a, l) => a + l.length * noteLh + noteF * 0.35, 0) : 0;
    const h = pad + titleF * 1.2 + f * 0.9 + rowsH + notesH + pad * 0.6;
    if (p.side === "bottom" || h <= H || tries === 13) {
      return { pw, ph: p.side === "right" ? H : Math.ceil(h), f, pad, r, lh, gap, titleF, textX, rows, nums, noteRows, noteF, noteLh };
    }
    f *= 0.9;
  }
  throw new Error("unreachable");
}
function drawPanel(ctx: CanvasRenderingContext2D, p: Panel, W: number, H: number, ox: number, oy: number, th: Theme = THEMES.isola) {
  const L = panelLayout(p, W, H);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, L.pw, L.ph);
  ctx.fillStyle = th.bar;
  if (p.side === "right") ctx.fillRect(0, 0, Math.max(3, L.f * 0.18), L.ph);
  else ctx.fillRect(0, 0, L.pw, Math.max(3, L.f * 0.18));
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  let y = L.pad + L.titleF * 0.6;
  ctx.font = `800 ${L.titleF}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = th.title;
  const title = (p.title || "Scope of work").toUpperCase();
  ctx.fillText(title, L.pad, y);
  y += L.titleF * 0.6 + L.f * 0.9;
  ctx.font = `600 ${L.f}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  L.rows.forEach((lines, i) => {
    const rowH = Math.max(L.r * 2, lines.length * L.lh);
    const dcx = L.pad + L.r, dcy = y + Math.min(rowH, L.lh) / 2 + (lines.length > 1 ? 0 : (rowH - L.lh) / 2);
    const fill = p.colors?.[L.nums[i]] ?? th.dot;
    // black or white dots get a thin ring so they still show on a dark or white panel
    if (isDark(fill) || fill === "#FFFFFF") { ctx.beginPath(); ctx.arc(dcx, dcy, L.r * 1.1, 0, Math.PI * 2); ctx.fillStyle = isDark(fill) ? "#FFFFFF" : th.text; ctx.fill(); }
    numDot(ctx, L.nums[i], dcx, dcy, L.r, fill);
    ctx.font = `600 ${L.f}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = th.text; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const top = lines.length > 1 ? y : y + (rowH - L.lh) / 2;
    lines.forEach((ln, j) => ctx.fillText(ln, L.textX, top + L.lh * (j + 0.5)));
    y += rowH + L.gap;
  });
  // ** notes: thin rule, then small italic gray lines with no number, like a disclosure
  if (L.noteRows.length) {
    ctx.fillStyle = th.rule;
    ctx.fillRect(L.pad, y + L.f * 0.05, L.pw - L.pad * 2, Math.max(1, L.f * 0.06));
    y += L.f * 0.7;
    ctx.font = `italic 500 ${L.noteF}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = th.note; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    L.noteRows.forEach((lines) => {
      lines.forEach((ln, j) => ctx.fillText(ln, L.pad, y + L.noteLh * (j + 0.5)));
      y += lines.length * L.noteLh + L.noteF * 0.35;
    });
  }
  ctx.restore();
}
const pinR = (s: Shape, base: number) => base * (2.6 + (s.size || 2) * 1.3) * (s.ts || 1);

// legend entries: one row per distinct line style / symbol / area on the photo, in the order first drawn
type LegEntry = { key: string; kind: "line" | "area" | "sym"; color: string; dash?: boolean; sym?: SymKind; text?: string; def: string };
const colorName = (c: string) => COLORS.find((x) => x.v === c)?.n ?? "Colored";
const STRUCT_NAMES: Record<string, string> = { DW: "Existing drywell", CB: "Catch basin", MH: "Manhole", DMH: "Drain manhole", SMH: "Sewer manhole", YD: "Yard drain", TD: "Trench drain", LP: "Light pole", HY: "Hydrant", WV: "Water valve" };
function legendEntries(shapes: Shape[]): LegEntry[] {
  const out: LegEntry[] = [], seen = new Set<string>();
  const add = (e: LegEntry) => { if (!seen.has(e.key)) { seen.add(e.key); out.push(e); } };
  for (const s of shapes) {
    if (s.type === "line" || s.type === "arrow" || (s.type === "path" && !s.closed) || s.type === "pen") {
      const nm = colorName(s.color);
      const def = s.color === "#2F80FF" ? "Existing line" : s.color === "#EF4444" ? "New line" : `${nm} line`;
      add({ key: `L|${s.color}|${s.dash ? 1 : 0}`, kind: "line", color: s.color, dash: !!s.dash, def: s.dash ? def + " (approx.)" : def });
    } else if (s.type === "rect" || s.type === "ellipse" || (s.type === "path" && s.closed)) {
      add({ key: `A|${s.color}|${s.dash ? 1 : 0}`, kind: "area", color: s.color, dash: !!s.dash, def: s.color === "#EF4444" ? "Work area" : `${colorName(s.color)} area` });
    } else if (s.type === "sym") {
      const k = s.sym || "dot", t = (s.text || "").toUpperCase();
      if (k === "struct") add({ key: `S|struct|${t}|${s.color}`, kind: "sym", sym: k, color: s.color, text: s.text, def: STRUCT_NAMES[t] ?? (t ? `${t} structure` : "Structure") });
      else if (k === "tag") add({ key: `S|tag|${s.color}`, kind: "sym", sym: k, color: s.color, text: (s.text || "").replace(/\d+$/, "#") || "#", def: "Tags" });
      else add({ key: `S|${k}|${s.color}`, kind: "sym", sym: k, color: s.color, text: s.text, def: { tiein: "Tie in to existing", cleanout: "Cleanout", warn: "Repair / problem spot", dot: "Point of interest", replace: "Remove & replace brick", repoint: "Repoint mortar joints" }[k as "tiein"] ?? "Symbol" });
    }
  }
  return out;
}
function drawLegendSample(ctx: CanvasRenderingContext2D, e: LegEntry, x: number, cy: number, w: number, f: number) {
  ctx.save();
  if (e.kind === "line") {
    const lw = f * 0.3;
    ctx.lineCap = e.dash ? "butt" : "round";
    if (e.dash) ctx.setLineDash([lw * 2.4, lw * 1.8]);
    ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = lw + Math.max(1.5, lw * 0.5);
    ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + w, cy); ctx.stroke();
    ctx.strokeStyle = e.color; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + w, cy); ctx.stroke();
  } else if (e.kind === "area") {
    const h = f * 0.9;
    if (e.dash) ctx.setLineDash([f * 0.3, f * 0.22]);
    ctx.globalAlpha = 0.18; ctx.fillStyle = e.color; ctx.fillRect(x + 1, cy - h / 2, w - 2, h); ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1.5, f * 0.16); ctx.strokeStyle = isDark(e.color) || e.color === "#FFFFFF" ? "#0B0D0E" : e.color;
    ctx.strokeRect(x + 1, cy - h / 2, w - 2, h);
  } else {
    const r = f * (e.sym === "struct" ? 0.62 : e.sym === "cleanout" ? 0.42 : e.sym === "tag" ? 0.55 : e.sym === "replace" || e.sym === "repoint" ? 0.48 : 0.5);
    drawSym(ctx, e.sym!, x + w / 2, cy, r, e.color, e.text || "");
  }
  ctx.restore();
}
function captionBoxH(text: string, W: number, H: number, scale = 1, pos: CapPos = "bl") {
  const t = text.trim(); if (!t) return 0;
  const c = (measureCtx ??= document.createElement("canvas").getContext("2d")!);
  const short = Math.min(W, H);
  const f = Math.max(14, short * 0.038) * scale, padX = f * 0.7, padY = f * 0.45, lh = f * 1.25;
  c.save(); c.font = `700 ${f}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  const n = Math.min(3, wrapLines(c, t.split("\n"), capMaxW(W, short, pos) - padX * 2).length); c.restore();
  return n * lh + padY * 2;
}
// white legend box in a corner of the photo — kept clear of the logo badge and the caption strip
function drawLegend(ctx: CanvasRenderingContext2D, cfg: LegendCfg, shapes: Shape[], W: number, H: number, capH = 0, capPos: CapPos = "bl") {
  if (!cfg.on) return;
  const rows = legendEntries(shapes).filter((e) => !cfg.hide.includes(e.key));
  const note = (cfg.note || "").trim();
  if (!rows.length && !note) return;
  const short = Math.min(W, H), f = short * 0.021 * (cfg.scale || 1);
  const pad = f * 0.9, row = f * 1.75, sw = f * 2.3, gap = f * 0.7, titleF = f * 1.15;
  const sans = (px: number, w = 600) => `${w} ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.save();
  ctx.font = sans(titleF, 800);
  const title = (cfg.title || "Legend").toUpperCase();
  let w = ctx.measureText(title).width;
  ctx.font = sans(f);
  const labels = rows.map((e) => (cfg.labels[e.key] ?? e.def).trim() || e.def);
  labels.forEach((l) => { w = Math.max(w, sw + gap + ctx.measureText(l).width); });
  w = Math.max(w, f * 9);
  const noteF = f * 0.72, noteLh = noteF * 1.35;
  ctx.font = `italic 500 ${noteF}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  let noteLines = note ? wrapLines(ctx, note.split("\n"), w) : [];
  if (note && noteLines.length > 2 && w < short * 0.42) { w = Math.min(short * 0.42, W * 0.6); noteLines = wrapLines(ctx, note.split("\n"), w); }
  const bw = w + pad * 2;
  const bh = pad + titleF * 1.25 + (rows.length ? f * 0.35 + rows.length * row : 0) + (noteLines.length ? f * 0.5 + noteLines.length * noteLh : 0) + pad * 0.8;
  const m = short * 0.025, D = Math.max(40, Math.min(220, short * 0.14)), cg = short * 0.015;
  let x0 = cfg.pos.endsWith("r") ? W - m - bw : m;
  let y0 = cfg.pos.startsWith("t") ? m : H - m - bh;
  const shareCap = capH && cfg.pos === capPos;                 // caption in the same corner: stack clear of it
  if (cfg.pos === "br") y0 = H - m - D - cg - bh - (shareCap ? capH + cg : 0);   // above the logo badge (and caption)
  if (cfg.pos === "bl" && shareCap) y0 = H - m - capH - cg - bh;                 // above the caption strip
  if (cfg.pos.startsWith("t") && shareCap) y0 = m + capH + cg;                   // below the caption
  y0 = Math.max(m, y0); x0 = Math.max(m, x0);
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = f * 0.6; ctx.shadowOffsetY = f * 0.1;
  rrect(ctx, x0, y0, bw, bh, f * 0.45); ctx.fillStyle = "rgba(255,255,255,0.96)"; ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = Math.max(1.5, f * 0.08); ctx.strokeStyle = "#1A1C1E"; ctx.stroke();
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  let y = y0 + pad + titleF * 0.55;
  ctx.font = sans(titleF, 800); ctx.fillStyle = "#0B0D0E"; ctx.fillText(title, x0 + pad, y);
  y += titleF * 0.7 + f * 0.35;
  rows.forEach((e, i) => {
    const cy = y + row / 2;
    drawLegendSample(ctx, e, x0 + pad, cy, sw, f);
    ctx.font = sans(f); ctx.fillStyle = "#1A1C1E"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(labels[i], x0 + pad + sw + gap, cy);
    y += row;
  });
  if (noteLines.length) {
    y += f * 0.5;
    ctx.font = `italic 500 ${noteF}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.fillStyle = "#55595E";
    noteLines.forEach((l) => { ctx.fillText(l, x0 + pad, y + noteLh / 2); y += noteLh; });
  }
  ctx.restore();
}
const DEFAULT_LEGEND = (): LegendCfg => ({ on: true, pos: "br", title: "Legend", labels: {}, hide: [], note: "Not to scale; locations approx.\nAll depths and grades to be set in the field.", scale: 1 });

function bbox(s: Shape, base: number): { x0: number; y0: number; x1: number; y1: number } {
  if (s.type === "num") { const r = pinR(s, base); return { x0: s.at!.x - r, y0: s.at!.y - r, x1: s.at!.x + r, y1: s.at!.y + r }; }
  if (s.type === "sym") { const r = symR(s, base) * (s.sym === "tag" ? Math.max(1.3, ((s.text || "").length * 0.55 + 0.8) / 2 + 0.2) : 1.15); return { x0: s.at!.x - r, y0: s.at!.y - r, x1: s.at!.x + r, y1: s.at!.y + r }; }
  if (s.type === "text" && s.bg !== undefined) { const L = textLayout(s, base); return { x0: L.x0, y0: L.y0, x1: L.x0 + L.w, y1: L.y0 + L.h }; }
  if (s.type === "text") {
    const f = base * 6 * (0.7 + (s.size || 2) * 0.25) * (s.ts || 1), w = (s.text?.length || 1) * f * 0.6 + f;
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
  if (isBox(s)) { const L = textLayout(s, base); const c = [{ x: L.x0, y: L.y0 }, { x: L.x0 + L.w, y: L.y0 }, { x: L.x0 + L.w, y: L.y0 + L.h }, { x: L.x0, y: L.y0 + L.h }]; return s.to ? [...c, s.to] : c; }
  if (s.type === "path") return s.points || [];
  if (s.type === "line" || s.type === "arrow" || s.type === "dim" || s.type === "rect" || s.type === "ellipse") return [s.a!, s.b!];
  return [];
}
function moved(s: Shape, dx: number, dy: number): Shape {
  const m = (p?: P) => (p ? { x: p.x + dx, y: p.y + dy } : p);
  return { ...s, a: m(s.a), b: m(s.b), at: m(s.at), points: s.points?.map((p) => m(p)!) };
}
function withHandle(s: Shape, i: number, p: P, base: number): Shape {
  if (isBox(s) && i === 4) return { ...s, to: p };   // v9.0: drag the pointer tip
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

// v7.3: small A- / A+ control for text size (60%-250%); tap the % to reset
function SizeStepper({ value, onChange, label, className, min = 0.6, max = 2.5 }: { value: number; onChange: (v: number) => void; label: string; className?: string; min?: number; max?: number }) {
  const step = (d: number) => onChange(Math.round(Math.min(max, Math.max(min, value + d)) * 10) / 10);
  return (
    <div className={cn("inline-flex shrink-0 items-center rounded-lg border border-border bg-neutral-950 p-0.5", className)} aria-label={label}>
      <button type="button" aria-label={`${label} smaller`} onClick={() => step(-0.1)} disabled={value <= min}
        className="h-8 w-8 rounded-md text-[12px] font-bold text-neutral-300 hover:text-white disabled:opacity-40">A&minus;</button>
      <button type="button" title="Reset size" onClick={() => onChange(1)} className="h-8 min-w-[3rem] px-1 text-[12px] font-semibold tabular-nums text-neutral-400 hover:text-white">{Math.round(value * 100)}%</button>
      <button type="button" aria-label={`${label} bigger`} onClick={() => step(0.1)} disabled={value >= max}
        className="h-8 w-8 rounded-md text-[15px] font-bold text-neutral-300 hover:text-white disabled:opacity-40">A+</button>
    </div>
  );
}


// v9.0: tiny canvas previews for the symbol picker and the legend editor
function MiniCanvas({ w, h, draw, deps }: { w: number; h: number; draw: (ctx: CanvasRenderingContext2D) => void; deps: any[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    draw(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return <canvas ref={ref} style={{ width: w, height: h }} className="shrink-0" />;
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
  const shapesRef = useRef<Shape[]>([]);
  shapesRef.current = shapes;
  const [past, setPast] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]);
  const [tool, setTool] = useState<Tool>("path");
  const [color, setColor] = useState(COLORS[0].v);
  const [size, setSize] = useState(2);
  const [font, setFont] = useState<FontKey>("sans");
  const [bg, setBg] = useState("rgba(11,13,14,0.72)");
  const [numbered, setNumbered] = useState(false);
  const [pinNotes, setPinNotes] = useState(true);   // Number tool: ask for a note and drop a text box beside the dot
  // v9.0 legend-map tools
  const [symKind, setSymKind] = useState<SymKind>("tiein");
  const [structText, setStructText] = useState("DW");
  const [lineDash, setLineDash] = useState(false);
  const [lineFlow, setLineFlow] = useState(0);
  const [lineDots, setLineDots] = useState(true);
  const [legend, setLegend] = useState<LegendCfg | null>(null);
  const [leaderFor, setLeaderFor] = useState<string | null>(null);   // next tap sets this box's pointer tip
  const [caption, setCaption] = useState("");
  const [showCap, setShowCap] = useState(true);
  const [capScale, setCapScale] = useState(1);     // caption text size (1 = default)
  const [capPos, setCapPos] = useState<CapPos>("bl"); // which corner the caption sits in
  const [titleScale, setTitleScale] = useState(1); // steps-panel title size (1 = default)
  const [brand, setBrand] = useState<Brand>("isola"); // logo in the corner + steps panel colors
  const theme = THEMES[brand];
  const [panelOn, setPanelOn] = useState(false);
  const [panelSide, setPanelSide] = useState<"right" | "bottom">("right");
  const [panelTitle, setPanelTitle] = useState("Scope of work");
  const [steps, setSteps] = useState<string[]>([]);   // step N lines up with dot N
  const panelText = steps.join("\n");
  // each step's number takes the color of the matching numbered dot on the photo
  const dotColors: Record<number, string> = {};
  shapes.forEach((x) => { if (x.type === "num" && x.num != null && !(x.num in dotColors)) dotColors[x.num] = x.color; });
  const panel: Panel | null = panelOn && steps.some((x) => x.trim()) ? { side: panelSide, title: panelTitle, items: steps, titleScale, colors: dotColors } : null;
  // dropping dot N opens the steps list (below the photo) with lines 1..N ready to fill
  function ensureStep(n: number, note?: string, overwrite = false) {
    setSteps((prev) => {
      // ** notes don't count toward dot numbers — step N is the Nth numbered line
      const a = [...prev];
      let count = a.filter((t) => !isNote(t)).length;
      while (count < n) { a.push(""); count++; }
      const idx = a.findIndex((_, i) => stepNums(a)[i] === n);
      if (idx >= 0 && note?.trim() && (overwrite || !a[idx].trim())) a[idx] = note.trim().replace(/\n/g, " ");
      return a;
    });
    if (!panelOn) { setPanelSide("bottom"); setPanelOn(true); }
  }
  const panelRef = useRef<HTMLCanvasElement>(null);
  function loadPanel(pn?: Panel | null) {
    setPanelOn(!!pn); setPanelSide(pn?.side ?? "right"); setPanelTitle(pn?.title ?? "Scope of work"); setSteps(pn?.items ?? []); setTitleScale(pn?.titleScale ?? 1); setListId(null);
  }
  // fill the steps from the numbered dots, in order, using each dot's note
  function stepsFromDots() {
    const pins = shapes.filter((x) => x.type === "num").sort((a, b) => (a.num ?? 0) - (b.num ?? 0));
    if (!pins.length) { showError("Drop some numbered dots first."); return; }
    const lines = pins.map((pn) => shapes.find((x) => x.ref === pn.id)?.text?.replace(/\n/g, " ") || "");
    setSteps((prev) => {
      const numbered = prev.filter((t) => !isNote(t)), notes = prev.filter(isNote);
      return [...lines.map((l, i) => l || numbered[i] || ""), ...notes];   // ** notes stay, at the end
    }); setPanelOn(true);
  }
  const [draft, setDraft] = useState<Shape | null>(null);
  const [hover, setHover] = useState<P | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState({ w: 0, h: 0 });

  const selIsText = !!sel && shapes.some((x) => x.id === sel && x.type === "text");
  const selIsLine = !!sel && shapes.some((x) => x.id === sel && LINE_TYPES.has(x.type));
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
  const drag = useRef<{ mode: "draw" | "move" | "handle" | "pathpt" | "tbdraw"; start?: P; before?: Shape[]; idx?: number; wasSel?: boolean } | null>(null);
  // double-tap on any text box, in any tool, opens it for editing
  const lastTap = useRef<{ t: number; p: P } | null>(null);

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
    // v7.5: the picker shows Storage thumbnails; the editor still loads the one full photo it opens
    sb.from("job_photos").select("id,phase,caption,thumb_path,source_photo_id,created_at").eq("job_id", jobId).order("created_at", { ascending: false })
      .then(({ data, error }) => { if (error) showError(error.message); setJobPhotos(data ?? []); });
  }, [jobId, img, sb]);
  const pickThumbs = useSignedUrls("job-photos", (jobPhotos ?? []).map((p: any) => p.thumb_path));
  const pickFallback = useFallbackImages((jobPhotos ?? []).map((p: any) => ({ id: p.id, thumb: p.thumb_path })), "job_photos", "photo_b64");
  const pickSrc = (p: any) => (isStored(p.thumb_path) ? pickThumbs[p.thumb_path] : pickFallback[p.id]) ?? "";

  // v8.0: prepared step lists saved on the job ("what's this photo?") — pick one and each dot preloads its line
  const [lists, setLists] = useState<any[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  useEffect(() => {
    if (!jobId) { setLists([]); return; }
    sb.from("markup_lists").select("id,name,title,caption,items,sort").eq("job_id", jobId).order("sort").order("created_at")
      .then(({ data }) => setLists(data ?? []));
  }, [jobId, sb]);
  function applyList(l: any) {
    setListId(l.id);
    setPanelTitle(l.title || l.name || "Scope of work");
    setSteps(Array.isArray(l.items) ? [...l.items] : []);
    setPanelOn(true);
    if (l.caption && !caption.trim()) setCaption(l.caption);
  }
  // text of numbered step n, if one is already written (from a picked list or typed in)
  function stepText(n: number) {
    const sn = stepNums(steps), i = sn.indexOf(n);
    return i >= 0 ? (steps[i] || "").trim() : "";
  }

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
          const mk = row.markup as Markup;
          setCaption(mk.caption ?? (row.caption && row.caption !== "Marked up" ? row.caption : "")); setShowCap(mk.showCap ?? true); setCapScale(mk.capScale ?? 1); setCapPos(mk.capPos ?? "bl"); setBrand(mk.brand ?? "isola"); loadPanel(mk.panel); setLegend(mk.legend ?? null);
          // v8.x: reopening a saved markup lands in Move so a tap selects an existing box instead of drawing a new mark
          setTool("select");
          return;
        }
      }
      setImg(await loadImg(row.photo_b64)); setSrcPhoto(row); setEditRow(null); reset([]);
      setCaption(row.caption && !["Original", "Marked up"].includes(row.caption) ? row.caption : ""); setShowCap(true); setCapScale(1); setBrand("isola"); loadPanel(null); setLegend(null);
    } catch (e: any) { showError(e.message); } finally { setBusy(false); }
  }
  async function openFile(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const b64 = await stampSafe(await compressImage(f, 1600, 0.85), 0.88);
      setImg(await loadImg(b64)); setSrcPhoto(null); setEditRow(null); reset([]); setCaption(""); setShowCap(true); setCapScale(1); setBrand("isola"); loadPanel(null); setLegend(null);
    } catch { showError("Could not open that photo."); } finally { setBusy(false); }
  }
  function reset(s: Shape[]) { setShapes(s); setPast([]); setFuture([]); setDraft(null); setSel(null); setLeaderFor(null); }
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
      const W = img.naturalWidth, H = img.naturalHeight;
      const PL = panel ? panelLayout(panel, W, H) : null;
      const s = Math.min(maxW / (W + (PL && panel!.side === "right" ? PL.pw : 0)), maxH / (H + (PL && panel!.side === "bottom" ? PL.ph : 0)));
      setView({ w: Math.round(img.naturalWidth * s), h: Math.round(img.naturalHeight * s) });
    };
    fit();
    const ro = new ResizeObserver(fit); if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [img, panelOn, panelSide, panelText, panelTitle, titleScale]);

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
    if (showCap && caption.trim()) drawCaption(ctx, caption, img.naturalWidth, img.naturalHeight, capScale, theme, capPos);
    if (legend) drawLegend(ctx, legend, draft ? [...shapes, draft] : shapes, img.naturalWidth, img.naturalHeight, showCap ? captionBoxH(caption, img.naturalWidth, img.naturalHeight, capScale, capPos) : 0, capPos);
    if (draft) {
      if (draft.type === "path" && hover && draft.points?.length) {
        const last = draft.points[draft.points.length - 1];
        ctx.save(); ctx.setLineDash([base * 2, base * 2]); ctx.strokeStyle = draft.color; ctx.lineWidth = strokeW(draft, base) * 0.7;
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(hover.x, hover.y); ctx.stroke(); ctx.restore();
      }
      drawShape(ctx, { ...draft, nodots: undefined }, base, { firstRing: draft.type === "path" && (draft.points?.length || 0) >= 3 });
    }
    const s = shapes.find((x) => x.id === sel);
    if (s) {
      const b = bbox(s, base), pad = strokeW(s, base) + 6 / scale;
      ctx.save(); ctx.setLineDash([6 / scale, 5 / scale]); ctx.lineWidth = 1.5 / scale; ctx.strokeStyle = "#F2C230";
      ctx.strokeRect(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2); ctx.restore();
      handles(s, base).forEach((h) => { ctx.beginPath(); ctx.arc(h.x, h.y, 7 / scale, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 2.5 / scale; ctx.strokeStyle = "#F2C230"; ctx.stroke(); });
    }
    // v5.5: show the clean Isola badge live (it covers any older stamp baked into the photo, same spot and size)
    drawStamp(ctx, img.naturalWidth, img.naturalHeight, brand).catch(() => {});
    const pc = panelRef.current;
    if (pc && panel) {
      const PL = panelLayout(panel, img.naturalWidth, img.naturalHeight);
      pc.width = Math.round(PL.pw * scale * dpr); pc.height = Math.round(PL.ph * scale * dpr);
      pc.style.width = Math.round(PL.pw * scale) + "px"; pc.style.height = Math.round(PL.ph * scale) + "px";
      const pctx = pc.getContext("2d")!; pctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      drawPanel(pctx, panel, img.naturalWidth, img.naturalHeight, 0, 0, theme);
    }
  }, [img, view, shapes, draft, hover, sel, scale, base, caption, showCap, capScale, capPos, panelOn, panelSide, panelText, panelTitle, titleScale, brand, legend]);

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
    const now = Date.now();
    const prevTap = lastTap.current;
    lastTap.current = { t: now, p };
    // v9.0: placing a text box's pointer — this tap is the spot it points at
    if (leaderFor) {
      const id = leaderFor; setLeaderFor(null); lastTap.current = null;
      commit(shapes.map((x) => (x.id === id ? { ...x, to: p } : x)));
      setTool("select"); setSel(id);
      return;
    }
    const textHit = [...shapes].reverse().find((s) => (s.type === "text" || s.type === "dim" || hasSymText(s)) && hit(s, p, tolImg, base));
    // double-tap on a text box from any drawing tool: drop whatever the first tap started and edit the box
    if (tool !== "select" && textHit && prevTap && now - prevTap.t < 400 && dist(prevTap.p, p) < tolImg * 2) {
      lastTap.current = null;
      if (draft?.type === "path") setDraft((d) => { const pts = (d?.points || []).slice(0, -1); return pts.length ? { ...d!, points: pts } : null; });
      else setDraft(null);
      drag.current = null;
      setTool("select"); setSel(textHit.id);
      editTextOf(textHit.id);
      return;
    }
    if (tool === "select") {
      const cur = shapes.find((x) => x.id === sel);
      if (cur) {
        const i = handles(cur, base).findIndex((h) => dist(h, p) < tolImg * 1.4);
        if (i >= 0) { drag.current = { mode: "handle", idx: i, before: shapes }; return; }
      }
      const h = [...shapes].reverse().find((s) => hit(s, p, tolImg, base));
      setSel(h?.id ?? null);
      drag.current = h ? { mode: "move", start: p, before: shapes, wasSel: h.id === sel } : null;
      return;
    }
    if (tool === "text" && textHit && textHit.type === "text") {
      // tapping an existing text box with the Text tool edits that box instead of stacking a new one on top
      setTool("select"); setSel(textHit.id);
      editTextOf(textHit.id);
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
      if (!pinNotes) { commit([...shapes, pin]); ensureStep(pin.num!); return; }
      // show the dot right away, then ask what it is and drop a note box beside it
      const before = shapes;
      setShapes([...before, pin]);
      const pre = stepText(pin.num!);
      const t = await askText({ title: `Note for #${pin.num}`, placeholder: "e.g. Cracked crown — open joint\nLeave blank for just the dot", confirm: "Add", multiline: true, initial: pre || undefined });
      const cur = shapesRef.current;
      ensureStep(pin.num!, t ?? undefined, !!pre);
      if (!t?.trim()) { commit(cur, before); return; }
      const bgUse = bg === "none" ? "rgba(11,13,14,0.72)" : bg;
      const tc = bgUse.startsWith("rgba") || isDark(bgUse) ? "#FFFFFF" : "#0B0D0E";
      let box: Shape = { id: uid(), type: "text", color: tc, size, at: p, text: t.trim(), font, bg: bgUse, ref: pin.id };
      const L = textLayout(box, base), R0 = pinR(pin, base), off = R0 * 1.5;
      const W = img.naturalWidth;
      const cx = p.x + off + L.w <= W ? p.x + off + L.w / 2 : p.x - off - L.w / 2;
      box = clampBox({ ...box, at: { x: cx, y: p.y } });
      commit([...cur, box], before);
      return;
    }
    if (tool === "sym") {
      const def = SYMS.find((x) => x.k === symKind)!;
      const text = symKind === "struct" ? (structText.trim().toUpperCase() || "DW") : symKind === "tag" ? nextTag(shapes) : symKind === "warn" ? "!" : undefined;
      const mark: Shape = { id: uid(), type: "sym", sym: symKind, color: def.color, size, at: p, text };
      commit([...shapes, mark]);
      if (!legend) setLegend(DEFAULT_LEGEND());   // first symbol turns the legend on
      return;
    }
    if (tool === "path") {
      if (draft?.type === "path" && (draft.points?.length || 0) >= 3 && dist(p, draft.points![0]) < tolImg * 1.6) { closePath(); return; }
      setDraft((d) => (d?.type === "path" ? { ...d, points: [...(d.points || []), p] } : { id: uid(), type: "path", color, size, points: [p], ...lineStyle() }));
      drag.current = { mode: "pathpt" };
      return;
    }
    setSel(null);
    if (tool === "pen") setDraft({ id: uid(), type: "pen", color, size, points: [p], ...lineStyle() });
    else setDraft({ id: uid(), type: tool, color, size, a: p, b: p, ...(tool === "dim" ? {} : lineStyle()) });
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
      if (d.before && d.before !== shapes) { setPast((p) => [...p.slice(-60), d.before!]); setFuture([]); return; }
      // tap (no drag) on a box that was already selected: open its text, like Canva / Keynote
      const s = shapes.find((x) => x.id === sel);
      if (d.mode === "move" && d.wasSel && s && (s.type === "text" || s.type === "dim" || hasSymText(s))) editTextOf(s.id);
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

  // v9.0: line style (dashed / flow arrows / corner dots) — default for new lines, restyles the selected one
  function lineStyle(): Partial<Shape> { return { dash: lineDash || undefined, flow: lineFlow || undefined, nodots: lineDots ? undefined : true }; }
  function styleLine(patch: { dash?: boolean; flow?: number; dots?: boolean }) {
    if (patch.dash !== undefined) setLineDash(patch.dash);
    if (patch.flow !== undefined) setLineFlow(patch.flow);
    if (patch.dots !== undefined) setLineDots(patch.dots);
    if (sel && selIsLine) commit(shapes.map((x) => (x.id !== sel ? x : {
      ...x,
      ...(patch.dash !== undefined ? { dash: patch.dash || undefined } : {}),
      ...(patch.flow !== undefined ? { flow: patch.flow || undefined } : {}),
      ...(patch.dots !== undefined ? { nodots: patch.dots ? undefined : true } : {}),
    })));
  }
  function deleteSel() { if (!sel) return; commit(shapes.filter((s) => s.id !== sel)); setSel(null); }
  // v8.1 (11/2/26): Duplicate — copy the selected mark a little down-right and select the copy,
  // so tapping it again keeps stamping out more. A numbered dot copy takes the next number.
  function duplicateSel() {
    const s = shapes.find((x) => x.id === sel); if (!s || !img) return;
    const W = img.naturalWidth, H = img.naturalHeight, off = base * 8;
    const b = bbox(s, base);
    const dx = b.x1 + off <= W ? off : -off, dy = b.y1 + off <= H ? off : -off;
    let copy: Shape = { ...moved(s, dx, dy), id: uid(), ref: undefined };
    if (s.type === "num") copy.num = nextNum(shapes);
    else if (s.type === "text" && s.num != null) copy.num = nextNum(shapes, "text");
    copy = clampBox(copy);
    commit([...shapes, copy]);
    setTool("select"); setSel(copy.id);
    if (copy.type === "num") ensureStep(copy.num!);
  }
  async function editSelText() { if (sel) await editTextOf(sel); }
  async function editTextOf(id: string) {
    const s = shapes.find((x) => x.id === id); if (!s || (s.type !== "text" && s.type !== "dim" && !hasSymText(s))) return;
    const t = await askText({ title: s.type === "dim" ? "Measurement" : s.sym === "struct" ? "Letters (e.g. DW, CB, MH)" : s.sym === "tag" ? "Tag (e.g. G1, Unit 4)" : "Edit text", initial: s.text || "", confirm: "Save", multiline: s.type === "text" });
    if (t === null) return;
    // the dialog is async, so build on the latest shapes, not the ones captured at tap time
    const cur = shapesRef.current;
    const nt = s.sym === "struct" ? t.trim().toUpperCase().slice(0, 4) : t.trim();
    commit(cur.map((x) => (x.id === id ? (isBox(x) ? clampBox({ ...x, text: nt }) : { ...x, text: nt }) : x)), cur);
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
  // v9.2: free sizing for anything on the photo — scroll wheel / trackpad pinch over the item, or the Size stepper.
  // Everything shares one scale (ts): symbols, numbers, text, measurements, lines and shapes.
  function scaledShape(x: Shape, f: number): Shape {
    const ts = Math.max(0.3, Math.min(6, Math.round((x.ts || 1) * f * 100) / 100));
    if (x.type === "text" && x.bg !== undefined) {
      const before = { ...x, bg: x.bg ?? bg }, L0 = textLayout(before, base);
      const next: Shape = { ...before, ts };
      const L1 = textLayout(next, base);
      return clampBox({ ...next, h: next.h ? Math.max(next.h, L1.h) : undefined, at: { x: L0.x0 + L1.w / 2, y: L0.y0 + L1.h / 2 } });
    }
    return { ...x, ts };
  }
  const wheelBatch = useRef<{ id: string; t: number } | null>(null);
  function resizeShape(id: string, f: number) {
    const cur = shapesRef.current;
    const next = cur.map((x) => (x.id === id ? scaledShape(x, f) : x));
    const wb = wheelBatch.current, now = Date.now();
    // one undo step per burst of scrolling on the same item
    if (wb && wb.id === id && now - wb.t < 700) setShapes(next); else commit(next, cur);
    wheelBatch.current = { id, t: now };
  }
  function setShapeScale(id: string, v: number) {
    commit(shapes.map((x) => (x.id === id ? scaledShape(x, v / (x.ts || 1)) : x)));
  }
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    if (!img || !canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const p = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    const under = [...shapesRef.current].reverse().find((s) => hit(s, p, tolImg, base));
    const target = under?.id;   // only what's under the mouse — empty photo lets the page scroll
    if (!target) return;
    e.preventDefault();
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    resizeShape(target, Math.max(0.8, Math.min(1.25, f)));
    if (sel !== target) setSel(target);
  };
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    c.addEventListener("wheel", h, { passive: false });
    return () => c.removeEventListener("wheel", h);
  }, [img]);
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
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && sel) { e.preventDefault(); duplicateSel(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); deleteSel(); }
      else if (e.key === "Enter" && draft?.type === "path") finishOrDropDraft();
      else if (e.key === "Escape") { if (leaderFor) setLeaderFor(null); else if (draft) { setDraft(null); setHover(null); } else setSel(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  async function render(): Promise<string> {
    const c = document.createElement("canvas");
    const W = img!.naturalWidth, H = img!.naturalHeight;
    const PL = panel ? panelLayout(panel, W, H) : null;
    c.width = W + (PL && panel!.side === "right" ? PL.pw : 0); c.height = H + (PL && panel!.side === "bottom" ? PL.ph : 0);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0E1114"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img!, 0, 0);
    const all = draft && draft.type === "path" && (draft.points?.length || 0) >= 2 ? [...shapes, draft] : shapes;
    all.forEach((s) => drawShape(ctx, s, base));
    if (showCap && caption.trim()) drawCaption(ctx, caption, W, H, capScale, theme, capPos);
    if (legend) drawLegend(ctx, legend, all, W, H, showCap ? captionBoxH(caption, W, H, capScale, capPos) : 0, capPos);
    await drawStamp(ctx, W, H, brand).catch(() => {}); // chosen badge, bottom-right of the photo, on top of the markup
    if (PL) drawPanel(ctx, panel!, W, H, panel!.side === "right" ? W : 0, panel!.side === "right" ? 0 : H, theme);
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
      const cap = caption.trim();
      const markup: Markup = { v: 1, w: img!.naturalWidth, h: img!.naturalHeight, shapes: all, caption: cap, showCap, capScale, capPos, panel, brand, legend };
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
        const { error } = await sb.from("job_photos").update({ photo_b64: out, markup, caption: cap || "Marked up" }).eq("id", editRow.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("job_photos").insert({ job_id: jobId, phase: source.phase || "before", photo_b64: out, caption: cap || "Marked up", markup, source_photo_id: source.id }).select("id,job_id,phase,caption").single();
        if (error) throw error;
        setEditRow(data);
      }
      window.dispatchEvent(new Event("isola:changed"));
      kickMediaSync();
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
    leaderFor ? "Tap the spot this box points at — drag its round end later to move it"
    : tool === "path" ? (draft ? `${draft.points?.length} point${draft.points?.length === 1 ? "" : "s"} · tap to add more · tap the first point to close it · Done to finish` : "Tap to drop each point — lines connect as you go")
    : tool === "select" ? (selShape ? (selShape.type === "text" ? (isBox(selShape) ? "Tap again to edit the words · drag to move · drag a corner dot to resize" : "Tap again to edit the words · drag to move · restyle below") : "Drag to move · scroll the mouse wheel over it to size it · drag a white dot to reshape · Duplicate makes a copy") : "Tap any box or mark to select it · scroll the mouse wheel over anything to size it")
    : tool === "dim" ? "Drag from one end to the other, then type the measurement"
    : tool === "text" ? "Tap empty space for a new box (or drag to size it) · tap an existing box to edit it"
    : tool === "sym" ? `Tap to drop ${SYMS.find((x) => x.k === symKind)?.label.toLowerCase()}${symKind === "tag" ? ` (next: ${nextTag(shapes)})` : symKind === "struct" ? ` "${structText.toUpperCase() || "DW"}"` : ""} · each kind shows up in the legend · scroll over one to size it`
    : tool === "num" ? `Tap to drop numbered dots (next: ${nextNum(shapes)})${pinNotes ? " · type a note and it goes in a box beside the dot" : ""}`
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
                      {pickSrc(p) ? <img src={pickSrc(p)} alt={p.phase} loading="lazy" className="h-28 w-full object-cover" /> : <div className="skeleton h-28 w-full" />}
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

      {tool === "num" ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/[0.09] bg-card p-2">
          <span className="text-[13px] text-neutral-300">Note box beside each dot</span>
          <div className="ml-auto inline-flex rounded-lg border border-border bg-neutral-950 p-0.5">
            {[true, false].map((v) => (
              <button key={String(v)} onClick={() => setPinNotes(v)}
                className={cn("h-8 rounded-md px-3 text-[13px] font-semibold", pinNotes === v ? "bg-brand text-neutral-950" : "text-neutral-300")}>{v ? "On" : "Dot only"}</button>
            ))}
          </div>
        </div>
      ) : null}


      {tool === "sym" || selShape?.type === "sym" ? (() => {
        const curK = selShape?.type === "sym" ? selShape.sym || "dot" : symKind;
        const pickKind = (k: SymKind) => {
          setSymKind(k);
          if (selShape?.type === "sym") {
            const d = SYMS.find((x) => x.k === k)!;
            const text = k === "struct" ? (structText.toUpperCase() || "DW") : k === "tag" ? (selShape.sym === "tag" ? selShape.text : nextTag(shapes)) : k === "warn" ? "!" : undefined;
            commit(shapes.map((x) => (x.id === sel ? { ...x, sym: k, color: d.color, text } : x)));
          }
        };
        const setLetters = (t: string) => {
          setStructText(t);
          if (selShape?.type === "sym" && selShape.sym === "struct") commit(shapes.map((x) => (x.id === sel ? { ...x, text: t.toUpperCase().slice(0, 4) } : x)));
        };
        return (
          <div className="mb-2 rounded-lg border border-white/[0.09] bg-card p-2">
            <div className="no-scrollbar flex gap-1 overflow-x-auto">
              {SYMS.map((d) => (
                <button key={d.k} onClick={() => pickKind(d.k)}
                  className={cn("flex min-h-[52px] min-w-[68px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 text-[12px] font-semibold",
                    curK === d.k ? "border-brand bg-brand/15 text-white" : "border-white/[0.09] text-neutral-300 hover:text-white")}>
                  <MiniCanvas w={30} h={26} deps={[d.k, structText]} draw={(c) => drawSym(c, d.k, 15, 13, d.k === "struct" ? 11 : d.k === "cleanout" ? 8 : d.k === "tag" ? 8 : d.k === "replace" || d.k === "repoint" ? 10 : 9, d.color, d.k === "struct" ? (structText.toUpperCase() || "DW") : d.k === "tag" ? "G1" : d.k === "warn" ? "!" : "")} />
                  {d.label}
                </button>
              ))}
            </div>
            {curK === "struct" ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Letters</span>
                {["DW", "CB", "MH", "YD", "TD"].map((t) => (
                  <button key={t} onClick={() => setLetters(t)}
                    className={cn("h-8 rounded-md border px-2.5 text-[13px] font-bold", (selShape?.type === "sym" ? selShape.text : structText.toUpperCase()) === t ? "border-brand bg-brand text-neutral-950" : "border-white/[0.09] text-neutral-300")}>{t}</button>
                ))}
                <input value={selShape?.type === "sym" && selShape.sym === "struct" ? selShape.text || "" : structText} maxLength={4}
                  onChange={(e) => setLetters(e.target.value)} placeholder="Other"
                  className="h-8 w-20 rounded-md border border-white/[0.09] bg-neutral-950 px-2 text-[14px] font-bold uppercase text-white placeholder:normal-case placeholder:font-normal placeholder:text-neutral-600 focus:border-brand focus:outline-none" />
              </div>
            ) : null}
            {curK === "tag" ? <p className="mt-1.5 text-xs text-neutral-500">Tags count up as you tap — G1, G2, G3… Tap a tag twice to rename it.</p> : null}
          </div>
        );
      })() : null}

      {LINE_TYPES.has(tool as Shape["type"]) || selIsLine ? (() => {
        const cur = selIsLine ? selShape! : null;
        const dash = cur ? !!cur.dash : lineDash, flow = cur ? cur.flow || 0 : lineFlow, dots = cur ? !cur.nodots : lineDots;
        const showDots = cur ? cur.type === "path" : tool === "path";
        const canFlow = cur ? ["line", "arrow", "path"].includes(cur.type) : ["line", "arrow", "path"].includes(tool);
        return (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.09] bg-card p-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Line</span>
            <div className="inline-flex rounded-lg border border-border bg-neutral-950 p-0.5">
              {([[false, "Solid"], [true, "Dashed"]] as const).map(([v, l]) => (
                <button key={l} onClick={() => styleLine({ dash: v })}
                  className={cn("h-8 rounded-md px-3 text-[13px] font-semibold", dash === v ? "bg-brand text-neutral-950" : "text-neutral-300")}>{l}</button>
              ))}
            </div>
            {canFlow ? (
              <div className="inline-flex items-center rounded-lg border border-border bg-neutral-950 p-0.5">
                <span className="px-2 text-[12px] font-semibold text-neutral-400">Flow ➜</span>
                {[0, 1, 2, 3].map((n) => (
                  <button key={n} onClick={() => styleLine({ flow: n })}
                    className={cn("h-8 w-9 rounded-md text-[13px] font-semibold", flow === n ? "bg-brand text-neutral-950" : "text-neutral-300")}>{n === 0 ? "Off" : n}</button>
                ))}
              </div>
            ) : null}
            {showDots ? (
              <div className="inline-flex rounded-lg border border-border bg-neutral-950 p-0.5">
                {([[true, "Corner dots"], [false, "No dots"]] as const).map(([v, l]) => (
                  <button key={l} onClick={() => styleLine({ dots: v })}
                    className={cn("h-8 rounded-md px-3 text-[13px] font-semibold", dots === v ? "bg-brand text-neutral-950" : "text-neutral-300")}>{l}</button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })() : null}

      <div className="mb-2 flex min-h-[36px] flex-wrap items-center gap-2 text-[13px] text-neutral-400">
        <span className={cn("mr-auto", leaderFor ? "font-semibold text-brand" : "")}>{hint}</span>
        {leaderFor ? (
          <Button variant="outline" size="sm" onClick={() => setLeaderFor(null)}>Cancel pointer</Button>
        ) : draft?.type === "path" ? (
          <>
            <Button variant="outline" size="sm" onClick={() => finishOrDropDraft(true)}>Undo point</Button>
            {(draft.points?.length || 0) >= 3 ? <Button variant="outline" size="sm" onClick={closePath}>Close shape</Button> : null}
            <Button size="sm" onClick={() => finishOrDropDraft()} disabled={(draft.points?.length || 0) < 2}><Check size={15} /> Done</Button>
          </>
        ) : selShape ? (
          <>
            <SizeStepper value={selShape.ts || 1} min={0.3} max={6} onChange={(v) => setShapeScale(selShape.id, v)} label="Size" />
            {selShape.type === "text" || selShape.type === "dim" ? <Button variant="outline" size="sm" onClick={editSelText}>Edit {selShape.type === "dim" ? "measurement" : "text"}</Button> : null}
            {selShape.num != null ? <Button variant="outline" size="sm" onClick={editSelNum}>Change #{selShape.num}</Button> : null}
            {isBox(selShape) ? (selShape.to
              ? <Button variant="outline" size="sm" onClick={() => commit(shapes.map((x) => (x.id === sel ? { ...x, to: undefined } : x)))}><MoveUpRight size={15} /> Remove pointer</Button>
              : <Button variant="outline" size="sm" onClick={() => setLeaderFor(selShape.id)}><MoveUpRight size={15} /> Add pointer</Button>) : null}
            <Button variant="outline" size="sm" onClick={duplicateSel}><Copy size={15} /> Duplicate</Button>
            <Button variant="destructive" size="sm" onClick={deleteSel}><Trash2 size={15} /> Delete</Button>
          </>
        ) : null}
      </div>

      <div ref={wrapRef} className={cn("flex w-full justify-center", panel?.side === "bottom" ? "flex-col items-center" : "flex-row")}>
        <canvas ref={canvasRef}
          style={{ width: view.w, height: view.h, touchAction: "none", cursor: tool === "select" ? "default" : "crosshair" }}
          className="rounded-lg border border-white/[0.09] bg-black select-none"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onPointerLeave={() => setHover(null)} />
        {panel ? <canvas ref={panelRef} className="shrink-0 select-none" /> : null}
      </div>

      {jobId ? (
        <div className="mt-3 rounded-lg border border-brand/40 bg-card p-2.5">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Steps preset for this job</div>
          {lists.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <NativeSelect value={listId ?? ""} onChange={(e) => { const l = lists.find((x) => x.id === e.target.value); if (l) applyList(l); else { setListId(null); } }}
                className="min-w-0 flex-1 sm:max-w-xs">
                <option value="">Pick what this photo is…</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </NativeSelect>
              <div className="inline-flex rounded-lg border border-border bg-neutral-950 p-0.5">
                {([["right", "Side"], ["bottom", "Below"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => { setPanelSide(k); setPanelOn(true); }}
                    className={cn("h-8 rounded-md px-3 text-[13px] font-semibold", panelOn && panelSide === k ? "bg-brand text-neutral-950" : "text-neutral-300")}>{l}</button>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-neutral-500">No presets saved for this job yet — ask Claude to set them up.</p>}
          {lists.length ? <p className="mt-1.5 text-xs text-neutral-500">Picks the steps and writes them on the side or below. Then use the Number tool — dot 1 matches step 1, dot 2 step 2, and so on.</p> : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.09] bg-card p-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Logo</span>
        <NativeSelect aria-label="Logo on the photo" value={brand} onChange={(e) => setBrand(e.target.value as Brand)} className="min-w-0 flex-1 sm:max-w-xs">
          {BRANDS.map((b) => <option key={b.v} value={b.v}>{b.n}</option>)}
        </NativeSelect>
        <span className="hidden text-xs text-neutral-500 sm:inline">Bottom-right badge · steps panel colors follow it</span>
      </div>

      <div className="mt-3 rounded-lg border border-white/[0.09] bg-card p-2.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Legend</span>
          <div className="no-scrollbar inline-flex overflow-x-auto rounded-lg border border-border bg-neutral-950 p-0.5">
            {([["off", "Off"], ["tl", "Top left"], ["tr", "Top right"], ["bl", "Bottom left"], ["br", "Bottom right"]] as const).map(([k, l]) => {
              const on = k === "off" ? !legend?.on : !!legend?.on && legend.pos === k;
              return <button key={k} onClick={() => setLegend((g) => (k === "off" ? (g ? { ...g, on: false } : null) : { ...(g ?? DEFAULT_LEGEND()), on: true, pos: k }))}
                className={cn("h-8 shrink-0 rounded-md px-2.5 text-[13px] font-semibold", on ? "bg-brand text-neutral-950" : "text-neutral-300")}>{l}</button>;
            })}
          </div>
          {legend?.on ? <SizeStepper className="ml-auto" value={legend.scale || 1} onChange={(v) => setLegend((g) => (g ? { ...g, scale: v } : g))} label="Legend size" /> : null}
        </div>
        {legend?.on ? (() => {
          const entries = legendEntries(shapes);
          return (
            <>
              <input value={legend.title} onChange={(e) => setLegend((g) => (g ? { ...g, title: e.target.value } : g))} placeholder="Legend"
                className="mb-1.5 w-full rounded-md border border-white/[0.09] bg-neutral-950 px-3 py-2 text-[15px] font-semibold text-white placeholder:text-neutral-600 focus:border-brand focus:outline-none" />
              {entries.length ? (
                <div className="space-y-1.5">
                  {entries.map((e) => {
                    const hidden = legend.hide.includes(e.key);
                    return (
                      <div key={e.key} className={cn("flex items-center gap-2", hidden && "opacity-45")}>
                        <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md bg-white">
                          <MiniCanvas w={40} h={26} deps={[e.key, e.text]} draw={(c) => drawLegendSample(c, e, 4, 13, 32, 15)} />
                        </span>
                        <input value={legend.labels[e.key] ?? e.def}
                          onChange={(ev) => { const v = ev.target.value; setLegend((g) => (g ? { ...g, labels: { ...g.labels, [e.key]: v } } : g)); }}
                          className="min-w-0 flex-1 rounded-md border border-white/[0.09] bg-neutral-950 px-3 py-2 text-[15px] text-white focus:border-brand focus:outline-none" />
                        <button aria-label={hidden ? "Show in legend" : "Hide from legend"}
                          onClick={() => setLegend((g) => (g ? { ...g, hide: hidden ? g.hide.filter((k) => k !== e.key) : [...g.hide, e.key] } : g))}
                          className="shrink-0 rounded p-2 text-neutral-400 hover:text-white">{hidden ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-xs text-neutral-500">Draw lines or drop symbols — each kind gets a row here to name.</p>}
              <textarea value={legend.note} onChange={(e) => setLegend((g) => (g ? { ...g, note: e.target.value } : g))} rows={2}
                placeholder="Small print under the legend, e.g. Not to scale; locations approx."
                className="mt-1.5 w-full resize-none rounded-md border border-white/[0.09] bg-neutral-950 px-3 py-2 text-[14px] italic text-white placeholder:text-neutral-600 focus:border-brand focus:outline-none" />
              <p className="text-xs text-neutral-500">Rows build themselves from what you draw — one per color and line style, one per symbol. Rename them here; the eye hides a row.</p>
            </>
          );
        })() : <p className="text-xs text-neutral-500">A legend box on the photo that names each line color and symbol — like a site plan.</p>}
      </div>

      <div className="mt-3 rounded-lg border border-white/[0.09] bg-card p-2.5">
        <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          What are we looking at?
          <span className="ml-auto inline-flex items-center gap-1.5 normal-case tracking-normal">
            <input type="checkbox" checked={showCap} onChange={(e) => setShowCap(e.target.checked)} className="h-4 w-4 accent-[#F2C230]" />
            <span className="text-[13px] font-medium text-neutral-300">Show on photo</span>
          </span>
        </label>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2}
          placeholder="e.g. Chimney crown — cracked cap, open joints at flue tiles"
          className="w-full resize-none rounded-md border border-white/[0.09] bg-neutral-950 px-3 py-2 text-[15px] text-white placeholder:text-neutral-600 focus:border-brand focus:outline-none" />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-xs text-neutral-500">Saved as the photo&apos;s caption{showCap ? " and printed on the photo" : ""}.</p>
          {showCap ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-neutral-950 p-0.5" aria-label="Caption position">
                {([["tl", "Top left"], ["tr", "Top right"], ["bl", "Bottom left"], ["br", "Bottom right"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setCapPos(k)}
                    className={cn("h-8 rounded-md px-2.5 text-[12px] font-semibold", capPos === k ? "bg-brand text-neutral-950" : "text-neutral-300")}>{l}</button>
                ))}
              </div>
              <SizeStepper value={capScale} onChange={setCapScale} label="Caption text size" />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-white/[0.09] bg-card p-2.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Steps panel</span>
          <div className="inline-flex rounded-lg border border-border bg-neutral-950 p-0.5">
            {([["off", "Off"], ["right", "Side"], ["bottom", "Below"]] as const).map(([k, l]) => {
              const on = k === "off" ? !panelOn : panelOn && panelSide === k;
              return <button key={k} onClick={() => { if (k === "off") setPanelOn(false); else { setPanelOn(true); setPanelSide(k); } }}
                className={cn("h-8 rounded-md px-3 text-[13px] font-semibold", on ? "bg-brand text-neutral-950" : "text-neutral-300")}>{l}</button>;
            })}
          </div>
          {shapes.some((x) => x.type === "num") ? <Button variant="outline" size="sm" className="ml-auto" onClick={stepsFromDots}><Hash size={14} /> Fill from dots</Button> : null}
        </div>
        {panelOn ? (
          <>
            <div className="no-scrollbar -mx-0.5 mb-1.5 flex gap-1 overflow-x-auto px-0.5">
              {PANEL_TITLES.map((t) => (
                <button key={t} onClick={() => setPanelTitle(t)}
                  className={cn("h-8 shrink-0 rounded-full border px-3 text-[13px] font-semibold",
                    panelTitle.trim().toLowerCase() === t.toLowerCase() ? "border-brand bg-brand text-neutral-950" : "border-white/[0.09] text-neutral-300 hover:text-white")}>{t}</button>
              ))}
            </div>
            <div className="mb-1.5 flex items-center gap-2">
              <input value={panelTitle} onChange={(e) => setPanelTitle(e.target.value)} placeholder="Or type your own title"
                className="min-w-0 flex-1 rounded-md border border-white/[0.09] bg-neutral-950 px-3 py-2 text-[15px] font-semibold text-white placeholder:text-neutral-600 focus:border-brand focus:outline-none" />
              <SizeStepper value={titleScale} onChange={setTitleScale} label="Title text size" />
            </div>
            <div className="space-y-1.5">
              {(() => { const list = steps.length ? steps : [""]; const nums = stepNums(list); return list.map((st, i) => (
                <div key={i} className="flex items-center gap-2">
                  {nums[i] === null
                    ? <span title="Note — no number, printed at the bottom" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 text-[13px] font-extrabold text-neutral-400">*</span>
                    : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 text-[13px] font-extrabold"
                        style={{ background: dotColors[nums[i]!] ?? "#F2C230", color: contrast(dotColors[nums[i]!] ?? "#F2C230") }}>{nums[i]}</span>}
                  <input value={st} onChange={(e) => { const v = e.target.value; setSteps((prev) => { const a = prev.length ? [...prev] : [""]; a[i] = v; return a; }); }}
                    placeholder={i === 0 ? "e.g. Remove loose brick and failed mortar" : nums[i] === null ? "Note" : `Step ${nums[i]}`}
                    className="min-w-0 flex-1 rounded-md border border-white/[0.09] bg-neutral-950 px-3 py-2 text-[15px] text-white placeholder:text-neutral-600 focus:border-brand focus:outline-none" />
                  <button aria-label={`Remove step ${i + 1}`} onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    className="shrink-0 rounded p-1.5 text-neutral-500 hover:text-white"><X size={16} /></button>
                </div>
              )); })()}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSteps((prev) => [...(prev.length ? prev : [""]), ""])}>+ Add step</Button>
              <p className="text-xs text-neutral-500">Step 1 matches dot 1. Start a line with ** for a note with no number — it prints at the bottom like a disclosure.</p>
            </div>
          </>
        ) : <p className="text-xs text-neutral-500">Split a section off the photo that lists numbered steps — what will be done.</p>}
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
