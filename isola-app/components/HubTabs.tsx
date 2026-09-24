"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { activeItem } from "@/lib/nav";

// The screens inside the current hub, as a scrollable strip at the top of the page.
export default function HubTabs() {
  const path = usePathname();
  const hit = activeItem(path);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>("[data-on='1']")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);
  if (!hit || hit.hub.items.length < 2) return null;
  return (
    <div ref={strip} className="-mx-4 px-4 mb-4 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {hit.hub.items.map((it) => {
        const on = it.href === hit.item.href;
        const Icon = it.icon;
        return (
          <Link key={it.href} href={it.href} data-on={on ? "1" : "0"}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 min-h-[40px] text-sm font-semibold border ${on ? "bg-white text-neutral-900 border-white" : "border-neutral-700 text-neutral-300 hover:border-neutral-500"}`}>
            <Icon size={16} strokeWidth={2.2} />
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
