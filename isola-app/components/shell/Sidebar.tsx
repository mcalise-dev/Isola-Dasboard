"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { GROUPS, HOME, activeItem, type NavItem } from "@/lib/nav";
import { useAttention } from "@/lib/attention";
import { cn } from "@/lib/utils";

export function NavLink({ item, on, count, onClick }: { item: NavItem; on: boolean; count?: number; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} onClick={onClick} aria-current={on ? "page" : undefined}
      className={cn("group flex min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-medium transition-colors",
        on ? "bg-white/[0.08] text-white shadow-[inset_2px_0_0_#fff]" : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-100")}>
      <Icon size={16} strokeWidth={2} className={on ? "text-white" : "text-neutral-500 group-hover:text-neutral-300"} />
      <span className="flex-1 truncate">{item.label}</span>
      {count ? <span className={cn("min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-bold leading-5", item.badge === "home" || item.badge === "money" || item.badge === "jobs" ? "bg-red-500/90 text-white" : "bg-white/10 text-neutral-200")}>{count}</span> : null}
    </Link>
  );
}

export function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const hit = activeItem(path);
  const a = useAttention();
  const [shut, setShut] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setShut(JSON.parse(localStorage.getItem("isola.nav.shut") || "{}")); } catch {} }, []);
  const toggle = (k: string) => setShut((s) => { const n = { ...s, [k]: !s[k] }; try { localStorage.setItem("isola.nav.shut", JSON.stringify(n)); } catch {} return n; });
  const cnt = (i: NavItem) => (i.badge && a ? a.badges[i.badge] : 0) || 0;
  return (
    <nav className="space-y-4">
      <NavLink item={HOME} on={hit?.item.href === HOME.href} count={cnt(HOME)} onClick={onNavigate} />
      {GROUPS.map((g) => {
        const closed = shut[g.key] && hit?.hub?.key !== g.key;
        const total = g.items.reduce((s, i) => s + cnt(i), 0);
        return (
          <div key={g.key}>
            <button onClick={() => toggle(g.key)} className="mb-1 flex w-full items-center gap-1.5 px-2.5 text-xs font-semibold text-neutral-500 hover:text-neutral-300">
              {g.label}
              {closed && total ? <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-neutral-300">{total}</span> : null}
              <ChevronDown size={13} className={cn("ml-auto transition-transform", closed && "-rotate-90")} />
            </button>
            {!closed ? (
              <div className="space-y-0.5">
                {g.items.map((i) => <NavLink key={i.href} item={i} on={hit?.item.href === i.href} count={cnt(i)} onClick={onNavigate} />)}
              </div>
            ) : null}
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
