"use client";
import { useEffect, useState } from "react";
import { Sun, Moon, SunMoon } from "lucide-react";
import { applyTheme, readMode, saveMode, type ThemeMode } from "@/lib/theme";
import { showToast } from "@/components/Toaster";

const NEXT: Record<ThemeMode, ThemeMode> = { auto: "light", light: "dark", dark: "auto" };
const LABEL: Record<ThemeMode, string> = {
  auto: "Auto: light 6 AM–6 PM, dark at night",
  light: "Light theme",
  dark: "Dark theme",
};

// Top-bar button: Auto -> Light -> Dark. Auto re-checks the clock every few minutes.
export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("auto");
  useEffect(() => {
    const m = readMode(); setMode(m); applyTheme(m);
    const t = setInterval(() => applyTheme(), 5 * 60 * 1000);
    const vis = () => { if (document.visibilityState === "visible") applyTheme(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []);
  function cycle() {
    const n = NEXT[mode]; setMode(n); saveMode(n); applyTheme(n); showToast(LABEL[n]);
  }
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : SunMoon;
  return (
    <button type="button" onClick={cycle} aria-label={`Theme: ${LABEL[mode]}. Tap to change.`} title={LABEL[mode]}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/[0.06] hover:text-white">
      <Icon size={18} />
    </button>
  );
}
