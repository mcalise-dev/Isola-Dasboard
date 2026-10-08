"use client";
import { useEffect, useRef, useState } from "react";
import { Undo2, X, Check, AlertTriangle } from "lucide-react";

// v4.3: one toast at a time at the bottom of the screen.
// showToast("Saved") for a confirmation; undoable(...) for deletes — the row disappears
// straight away, the real delete runs when the toast times out, and Undo puts it back.
// v4.8: showError("Save failed: …") replaces alert() for errors — red, stays longer.
type Toast = { id: number; text: string; undo?: () => void; commit?: () => void; ms: number; tone?: "error" };
const EVT = "isola:toast";
let seq = 0;

export function showToast(text: string, ms = 2600) {
  window.dispatchEvent(new CustomEvent(EVT, { detail: { id: ++seq, text, ms } }));
}

export function showError(text: string, ms = 6000) {
  window.dispatchEvent(new CustomEvent(EVT, { detail: { id: ++seq, text, ms, tone: "error" } }));
}

export function undoable(o: { text: string; hide: () => void; restore: () => void; commit: () => unknown; ms?: number }) {
  o.hide();
  window.dispatchEvent(new CustomEvent(EVT, {
    detail: { id: ++seq, text: o.text, ms: o.ms ?? 5000, undo: o.restore,
    // Promise.resolve runs Supabase query builders, which only execute when awaited
    commit: () => {
      Promise.resolve(o.commit())
        .then((r: any) => { if (r?.error) { o.restore(); showError("Delete failed: " + r.error.message); } })
        .catch((e) => { o.restore(); showError("Delete failed: " + (e?.message ?? e)); });
    } },
  }));
}

export default function Toaster() {
  const [t, setT] = useState<Toast | null>(null);
  const cur = useRef<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // finish the toast that is showing: run its pending delete unless it was undone
  function settle(runCommit: boolean) {
    const c = cur.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    cur.current = null;
    setT(null);
    if (c && runCommit) c.commit?.();
  }

  useEffect(() => {
    const on = (e: Event) => {
      const next = (e as CustomEvent).detail as Toast;
      if (cur.current) settle(true); // a new toast commits the previous delete
      cur.current = next;
      setT(next);
      timer.current = setTimeout(() => settle(true), next.ms);
    };
    // leaving or backgrounding the app must not lose a pending delete
    const flush = () => { if (cur.current?.commit) settle(true); };
    window.addEventListener(EVT, on);
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener("pagehide", flush); };
  }, []);

  if (!t) return null;
  return (
    <div className="fixed inset-x-0 z-[70] flex justify-center px-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] md:bottom-6 pointer-events-none">
      <div role={t.tone === "error" ? "alert" : "status"} className={`pointer-events-auto flex items-center gap-3 rounded-xl shadow-2xl pl-4 pr-2 py-2 max-w-md w-full md:w-auto ${t.tone === "error" ? "bg-red-600 text-white" : "bg-white text-neutral-900"}`}>
        {t.tone === "error" ? <AlertTriangle size={18} className="shrink-0" /> : !t.undo ? <Check size={18} className="shrink-0" /> : null}
        <span className={`text-sm font-semibold flex-1 min-w-0 ${t.tone === "error" ? "line-clamp-3" : "truncate"}`}>{t.text}</span>
        {t.undo ? (
          <button onClick={() => { t.undo!(); settle(false); }} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 text-white px-3 min-h-[40px] text-sm font-bold">
            <Undo2 size={16} /> Undo
          </button>
        ) : (
          <button onClick={() => settle(true)} aria-label="Dismiss" className={`shrink-0 p-2 ${t.tone === "error" ? "text-white/80" : "text-neutral-400"}`}><X size={16} /></button>
        )}
      </div>
    </div>
  );
}
