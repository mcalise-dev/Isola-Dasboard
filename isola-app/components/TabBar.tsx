"use client";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { HUBS, activeItem } from "@/lib/nav";

// v4.3: the bottom bar is the five hubs and never changes. The screens inside a hub
// are the tab strip at the top of the page. ＋ floats above the bar on the right.
export default function TabBar() {
  const path = usePathname();
  const router = useRouter();
  const hub = activeItem(path)?.hub.key;

  return (
    <>
      <button onClick={() => window.dispatchEvent(new Event("isola:quickadd"))} aria-label="Quick add"
        className="fixed z-50 right-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] w-14 h-14 rounded-full bg-white text-neutral-900 shadow-[0_8px_24px_rgba(0,0,0,.6)] ring-4 ring-black flex items-center justify-center active:scale-95 transition-transform">
        <Plus size={28} strokeWidth={2.6} />
      </button>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950 border-t border-neutral-800 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-2xl grid grid-cols-5">
          {HUBS.map((h) => {
            const on = hub === h.key;
            const Icon = h.icon;
            return (
              <button key={h.key} onClick={() => router.push(h.home)} aria-current={on ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[60px] text-xs font-semibold ${on ? "text-white" : "text-neutral-400"}`}>
                {on ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-white" /> : null}
                <Icon size={22} strokeWidth={on ? 2.4 : 1.9} />
                {h.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
