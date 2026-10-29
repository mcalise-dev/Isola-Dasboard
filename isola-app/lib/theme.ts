// Light / dark theme for the owner dashboard. "auto" = light 6 AM–6 PM, dark otherwise.
// Stored per device in localStorage; applied as html.light (see globals.css).
export type ThemeMode = "auto" | "light" | "dark";
export const THEME_KEY = "isola-theme";
export const DAY_START = 6;  // 6 AM
export const DAY_END = 18;   // 6 PM

export function readMode(): ThemeMode {
  try { const v = localStorage.getItem(THEME_KEY); if (v === "light" || v === "dark" || v === "auto") return v; } catch {}
  return "auto";
}
export function saveMode(m: ThemeMode) { try { localStorage.setItem(THEME_KEY, m); } catch {} }
export function isLight(m: ThemeMode, now = new Date()) {
  if (m === "light") return true;
  if (m === "dark") return false;
  const h = now.getHours();
  return h >= DAY_START && h < DAY_END;
}
export function applyTheme(m: ThemeMode = readMode()) {
  const light = isLight(m);
  document.documentElement.classList.toggle("light", light);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", light ? "#F3F4F6" : "#000000");
}
// Runs inline before first paint so there's no dark flash in the daytime.
export const THEME_BOOT = `(function(){try{var m=localStorage.getItem("${THEME_KEY}")||"auto";var h=new Date().getHours();var l=m==="light"||(m==="auto"&&h>=${DAY_START}&&h<${DAY_END});if(l)document.documentElement.classList.add("light");}catch(e){}})();`;
