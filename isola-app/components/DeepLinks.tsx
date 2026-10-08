"use client";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// v4.9: home-screen icon shortcuts (manifest "shortcuts") land on URLs like
//   /costs?add=receipt   /leads?add=1   /crew?clock=1
// This reads those params once, opens the matching UI, then strips the param so a
// refresh doesn't open it again. Mounted once in the app layout; renders nothing.

function stripParams(keys: string[]) {
  const u = new URL(window.location.href);
  keys.forEach((k) => u.searchParams.delete(k));
  window.history.replaceState(window.history.state, "", u.pathname + (u.search ? u.search : "") + u.hash);
}

// MyClock has no id to target, so find its Clock in / Clock out button and bring it up.
function focusClock() {
  let tries = 0;
  const t = window.setInterval(() => {
    tries++;
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /^(clock in|clock out)/i.test((b.textContent ?? "").trim())) as HTMLButtonElement | undefined;
    if (btn || tries > 40) {
      window.clearInterval(t);
      if (!btn) return;
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
      // clocked out: the job picker is the next thing to touch; clocked in: the button
      let sel: HTMLSelectElement | null = null;
      let el: HTMLElement | null = btn.parentElement;
      for (let i = 0; el && i < 4 && !sel; i++, el = el.parentElement) sel = el.querySelector("select");
      (sel ?? btn).focus({ preventScroll: true });
    }
  }, 150);
}

function Inner() {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    const add = params.get("add");
    const clock = params.get("clock");
    if (!add && !clock) return;
    const used: string[] = [];
    if (add) {
      used.push("add");
      // QuickAdd accepts detail "receipt" | "lead" | "task"
      const detail = add === "receipt" ? "receipt" : add === "task" ? "task" : add === "lead" || pathname.startsWith("/leads") ? "lead" : null;
      // let QuickAdd's listener mount first on a cold start
      window.setTimeout(() => {
        window.dispatchEvent(detail ? new CustomEvent("isola:quickadd", { detail }) : new Event("isola:quickadd"));
      }, 60);
    }
    if (clock) { used.push("clock"); focusClock(); }
    stripParams(used);
  }, [pathname, params]);

  return null;
}

export default function DeepLinks() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
