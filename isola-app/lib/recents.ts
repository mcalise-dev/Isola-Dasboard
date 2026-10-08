// Recently viewed pages for the search palette. Lives only in this browser (localStorage
// "isola.recent"); every access is guarded because storage can be blocked or empty.
export type RecentKind = "job" | "customer" | "screen";
export type Recent = { href: string; label: string; kind: RecentKind; at: number };

const KEY = "isola.recent";
const MAX = 8;

export function loadRecents(): Recent[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r) => r && typeof r.href === "string" && typeof r.label === "string")
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecent(entry: Omit<Recent, "at">): Recent[] {
  const next = [{ ...entry, at: Date.now() }, ...loadRecents().filter((r) => r.href !== entry.href)].slice(0, MAX);
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}
