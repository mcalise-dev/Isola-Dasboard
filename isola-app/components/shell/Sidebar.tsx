"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Pin, PinOff } from "lucide-react";
import { GROUPS, HOME, ALL_ITEMS, activeItem, type NavItem } from "@/lib/nav";
import { useAttention } from "@/lib/attention";
import { cn } from "@/lib/utils";

export function NavLink({ item, on, count, onClick, pinned, onPin }: { item: NavItem; on: boolean; count?: number; onClick?: () => void; pinned?: boolean; onPin?: () => void }) {
  const Icon = item.icon;
  return (
    <div className="group relative">
      <Link href={item.href} onClick={onClick} aria-current={on ? "page" : undefined}
        className={cn("flex min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-medium transition-colors",
          onPin && "pr-9",
          on ? "bg-white/[0.08] text-white shadow-[inset_2px_0_0_#fff]" : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-100")}>
        <Icon size={16} strokeWidth={2} className={on ? "text-white" : "text-neutral-500 group-hover:text-neutral-300"} />
        <span className="flex-1 truncate">{item.label}</span>
        {count ? <span className={cn("min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-bold leading-5", item.badge === "home" || item.badge === "money" || item.badge === "jobs" || item.badge === "approvals" ? "bg-red-500/90 text-white" : "bg-white/10 text-neutral-200")}>{count}</span> : null}
      </Link>
      {onPin ? (
        <button onClick={onPin} aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`} title={pinned ? "Unpin" : "Pin to top"}
          className={cn("absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-neutral-500 hover:bg-white/10 hover:text-white",
            "md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100", pinned && "text-neutral-300")}>
          {pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
      ) : null}
    </div>
  );
}

const PIN_KEY = "isola.nav.pins";
const PIN_EVT = "isola:pins";
function readPins(): string[] { try { return JSON.parse(localStorage.getItem(PIN_KEY) || "[]"); } catch { return []; } }

export function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const hit = activeItem(path);
  const a = useAttention();
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const [pins, setPins] = useState<string[]>([]);
  useEffect(() => {
    try { setShut(JSON.parse(localStorage.getItem("isola.nav.shut") || "{}")); } catch {}
    setPins(readPins());
    const sync = () => setPins(readPins());           // keep sidebar + phone menu in step
    window.addEventListener(PIN_EVT, sync);
    return () => window.removeEventListener(PIN_EVT, sync);
  }, []);
  const toggle = (k: string) => setShut((s) => { const n = { ...s, [k]: !s[k] }; try { localStorage.setItem("isola.nav.shut", JSON.stringify(n)); } catch {} return n; });
  const togglePin = (href: string) => {
    const cur = readPins();
    const next = cur.includes(href) ? cur.filter((h) => h !== href) : [...cur, href];
    try { localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch {}
    setPins(next);
    window.dispatchEvent(new Event(PIN_EVT));
  };
  const cnt = (i: NavItem) => (i.badge && a ? a.badges[i.badge] : 0) || 0;
  const pinnedItems = pins.map((h) => ALL_ITEMS.find((x) => x.item.href === h)?.item).filter(Boolean) as NavItem[];
  const link = (i: NavItem) => (
    <NavLink key={i.href} item={i} on={hit?.item.href === i.href} count={cnt(i)} onClick={onNavigate}
      pinned={pins.includes(i.href)} onPin={i.href === HOME.href ? undefined : () => togglePin(i.href)} />
  );
  return (
    <nav className="space-y-4">
      {link(HOME)}
      {pinnedItems.length ? (
        <div>
          <div className="mb-1 flex items-center gap-1.5 px-2.5 text-xs font-semibold text-neutral-500"><Pin size={11} /> Pinned</div>
          <div className="space-y-0.5">{pinnedItems.map(link)}</div>
        </div>
      ) : null}
      {GROUPS.map((g) => {
        const total = g.items.reduce((s, i) => s + cnt(i), 0);
        if (g.compact) {
          // One link for the whole group; its screens are tabs on the page itself.
          // red count when something in the group is urgent (e.g. marketing approvals waiting)
          const urgent = g.items.find((i) => (i.badge === "approvals" || i.badge === "money" || i.badge === "jobs") && cnt(i) > 0);
          const groupItem: NavItem = { href: g.home, label: g.label, icon: g.icon, badge: urgent?.badge };
          return (
            <div key={g.key}>
              <NavLink item={groupItem} on={hit?.hub?.key === g.key} count={total} onClick={onNavigate} />
            </div>
          );
        }
        const closed = shut[g.key] && hit?.hub?.key !== g.key;
        return (
          <div key={g.key}>
            <button onClick={() => toggle(g.key)} className="mb-1 flex w-full items-center gap-1.5 px-2.5 text-xs font-semibold text-neutral-500 hover:text-neutral-300">
              {g.label}
              {closed && total ? <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-neutral-300">{total}</span> : null}
              <ChevronDown size={13} className={cn("ml-auto transition-transform", closed && "-rotate-90")} />
            </button>
            {!closed ? <div className="space-y-0.5">{g.items.map(link)}</div> : null}
          </div>
        );
      })}
    </nav>
  );
}

export default function Sidebar() {
  return (
    <aside className="fixed bottom-0 left-0 top-[calc(3.5rem+1px+env(safe-area-inset-top))] z-30 hidden w-[232px] flex-col border-r border-border bg-black md:flex">
      <div className="flex-1 overflow-y-auto scroll-thin px-3 py-4">
        <NavGroups />
      </div>
      <div className="border-t border-border px-4 py-3 text-xs leading-snug text-neutral-500">
        <span className="block font-semibold text-neutral-300">Isola LLC</span>
        Concrete · Masonry · Sitework
      </div>
    </aside>
  );
}
