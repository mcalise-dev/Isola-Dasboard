"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { activeItem } from "@/lib/nav";

// Phone only: the other screens in the current group, as a scrollable strip.
// On desktop the sidebar already shows them.
export default function HubTabs() {
  const path = usePathname();
  const hit = activeItem(path);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>("[data-on='1']")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);
  if (!hit?.hub || hit.hub.items.length < 2 || path.startsWith("/jobs/")) return null;
  return (
    <div ref={strip} className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar md:hidden">
      {hit.hub.items.map((it) => {
        const on = it.href === hit.item.href;
        const Icon = it.icon;
        return (
          <Link key={it.href} href={it.href} data-on={on ? "1" : "0"}
            className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold ${on ? "border-white bg-white text-neutral-900" : "border-white/15 text-neutral-300"}`}>
            <Icon size={15} strokeWidth={2.2} />
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
