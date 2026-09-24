"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { HUBS, activeItem } from "@/lib/nav";

// Desktop menu: the five hubs, each with its screens underneath.
export default function SideNav() {
  const path = usePathname();
  const hit = activeItem(path);
  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-[61px] bottom-0 w-56 z-20 border-r border-neutral-800 bg-neutral-950 overflow-y-auto">
      <div className="p-3">
        <button onClick={() => window.dispatchEvent(new Event("isola:quickadd"))}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white text-neutral-900 min-h-[40px] text-sm font-bold">
          <Plus size={18} strokeWidth={2.6} /> Add
        </button>
      </div>
      <nav className="px-3 pb-6 space-y-4">
        {HUBS.map((h) => {
          const HubIcon = h.icon;
          const hubOn = hit?.hub.key === h.key;
          return (
            <div key={h.key}>
              <Link href={h.home} className={`flex items-center gap-2 px-2 pb-1 text-xs font-bold uppercase tracking-wider ${hubOn ? "text-white" : "text-neutral-400 hover:text-neutral-200"}`}>
                <HubIcon size={14} strokeWidth={2.4} /> {h.label}
              </Link>
              <div className="space-y-0.5">
                {h.items.map((t) => {
                  const on = hit?.item.href === t.href;
                  const Icon = t.icon;
                  return (
                    <Link key={t.href} href={t.href}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 min-h-[36px] text-sm font-medium ${on ? "bg-neutral-800 text-white" : "text-neutral-300 hover:bg-neutral-900 hover:text-white"}`}>
                      <Icon size={16} strokeWidth={2} className={on ? "" : "text-neutral-400"} />
                      {t.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
