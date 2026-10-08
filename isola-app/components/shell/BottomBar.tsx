"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Plus, LogOut } from "lucide-react";
import { TABS, activeItem } from "@/lib/nav";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { NavGroups } from "@/components/shell/Sidebar";
import { useAttention } from "@/lib/attention";
import { cn } from "@/lib/utils";

// Phone: Home · Jobs · Schedule · Money · Menu. Menu opens every screen, grouped.
export default function BottomBar() {
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const a = useAttention();
  const hit = activeItem(path);
  const key = hit?.entry.key ?? "";
  const onTab = TABS.some((t) => t.match.includes(key));
  const moreCount = a ? (a.badges.targets || 0) + (a.badges.tasks || 0) + (a.badges.reviews || 0) : 0;
  return (
    <div className="md:hidden">
      <button onClick={() => window.dispatchEvent(new Event("isola:quickadd"))} aria-label="Quick add"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_8px_24px_rgba(0,0,0,.6)] ring-4 ring-black transition-transform active:scale-95">
        <Plus size={28} strokeWidth={2.6} />
      </button>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {TABS.map((t) => {
            const on = t.match.includes(key);
            const Icon = t.icon;
            const badge = t.key === "home" ? a?.badges.home : t.key === "money" ? a?.badges.money : 0;
            return (
              <button key={t.key} onClick={() => router.push(t.href)} aria-current={on ? "page" : undefined}
                className={cn("relative flex min-h-[60px] flex-col items-center justify-center gap-1 text-xs font-semibold", on ? "text-white" : "text-neutral-500")}>
                {on ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-white" /> : null}
                <span className="relative"><Icon size={22} strokeWidth={on ? 2.4 : 1.9} />
                  {badge ? <span className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">{badge}</span> : null}</span>
                {t.label}
              </button>
            );
          })}
          <button onClick={() => setMenu(true)} className={cn("relative flex min-h-[60px] flex-col items-center justify-center gap-1 text-xs font-semibold", !onTab && key ? "text-white" : "text-neutral-500")}>
            {!onTab && key ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-white" /> : null}
            <span className="relative"><Menu size={22} />
              {moreCount ? <span className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-white/20 px-1 text-[10px] font-bold leading-4 text-white">{moreCount}</span> : null}</span>
            Menu
          </button>
        </div>
      </nav>
      <Drawer open={menu} onOpenChange={setMenu}>
        <DrawerContent title="All screens">
          <div className="overflow-y-auto px-4 pb-4 pt-2">
            <NavGroups onNavigate={() => setMenu(false)} />
            <form action="/login" className="mt-4 border-t border-border pt-3">
              <button type="button" onClick={() => { const f = document.getElementById("logout-form") as HTMLFormElement | null; f?.requestSubmit(); }}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-neutral-400 hover:bg-white/[0.04]"><LogOut size={16} /> Sign out</button>
            </form>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
