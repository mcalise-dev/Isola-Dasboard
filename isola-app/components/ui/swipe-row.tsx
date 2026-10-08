"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

// v4.9: touch-swipe shortcut for list rows. Swipe right = primary (e.g. Done),
// swipe left = secondary (e.g. Delete). Touch/pen only — mouse users keep the row's
// own buttons, which always stay in place. Vertical scrolling is left to the browser
// (touch-action: pan-y) and the swipe only engages when sideways movement dominates.

export type SwipeAction = {
  label: string;
  icon?: React.ReactNode;
  tone?: "success" | "danger" | "neutral";
  onCommit: () => void;
};

const TONE: Record<NonNullable<SwipeAction["tone"]>, string> = {
  success: "bg-emerald-500 text-neutral-950",
  danger: "bg-red-600 text-white",
  neutral: "bg-neutral-700 text-white",
};

const SLOP = 8; // px before deciding horizontal vs vertical
const SNAP_MS = 180;

export function SwipeRow({
  right, left, children, className, disabled,
}: {
  right?: SwipeAction;
  left?: SwipeAction;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const g = React.useRef<{ id: number; x: number; y: number; mode: "pending" | "swipe" | "off"; w: number } | null>(null);
  const swiped = React.useRef(false);
  const [dx, setDxState] = React.useState(0);
  const dxRef = React.useRef(0);
  const setDx = (v: number) => { dxRef.current = v; setDxState(v); };
  const [anim, setAnim] = React.useState(false);

  const threshold = (w: number) => Math.min(110, w * 0.35);

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || (!right && !left)) return;
    if (e.pointerType === "mouse") return; // desktop: use the buttons
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches && e.pointerType !== "touch") return;
    g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: "pending", w: ref.current?.offsetWidth ?? 320 };
    swiped.current = false;
    setAnim(false);
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = g.current;
    if (!s || s.id !== e.pointerId || s.mode === "off") return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (s.mode === "pending") {
      if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
      if (Math.abs(mx) <= Math.abs(my) * 1.2) { s.mode = "off"; return; } // vertical scroll wins
      s.mode = "swipe";
      try { ref.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    let x = mx;
    if (x > 0 && !right) x = 0;
    if (x < 0 && !left) x = 0;
    // a little resistance past the commit point
    const t = threshold(s.w);
    if (Math.abs(x) > t) x = Math.sign(x) * (t + (Math.abs(x) - t) * 0.4);
    setDx(x);
  }

  function finish(e: React.PointerEvent, cancelled: boolean) {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    g.current = null;
    if (s.mode !== "swipe") return;
    swiped.current = true;
    setAnim(true);
    const dx = dxRef.current;
    const act = dx > 0 ? right : dx < 0 ? left : undefined;
    if (!cancelled && act && Math.abs(dx) >= threshold(s.w)) {
      setDx(Math.sign(dx) * s.w);
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch { /* ignore */ } }
      window.setTimeout(() => {
        act.onCommit();
        setAnim(false);
        setDx(0);
      }, SNAP_MS);
    } else {
      setDx(0);
    }
  }

  // a swipe must not also fire the row's links/buttons underneath the finger
  function onClickCapture(e: React.MouseEvent) {
    if (swiped.current) { e.preventDefault(); e.stopPropagation(); swiped.current = false; }
  }

  const act = dx > 0 ? right : dx < 0 ? left : undefined;
  const armed = act && ref.current ? Math.abs(dx) >= threshold(ref.current.offsetWidth) : false;

  return (
    <div ref={ref} className={cn("relative overflow-hidden rounded-xl", className)}
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)} onPointerCancel={(e) => finish(e, true)}
      onClickCapture={onClickCapture}>
      {act ? (
        <div aria-hidden
          className={cn("absolute inset-y-0 flex items-center gap-1.5 px-4 text-sm font-bold", TONE[act.tone ?? "neutral"], dx > 0 ? "left-0 justify-start" : "right-0 justify-end", !armed && "opacity-70")}
          style={{ width: Math.abs(dx), transition: anim ? `width ${SNAP_MS}ms ease-out` : undefined }}>
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">{act.icon}{act.label}</span>
        </div>
      ) : null}
      <div style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: anim ? `transform ${SNAP_MS}ms ease-out` : undefined }}>
        {children}
      </div>
    </div>
  );
}

export default SwipeRow;
