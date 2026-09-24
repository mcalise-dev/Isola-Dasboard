"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, CalendarDays, Clock } from "lucide-react";

const TABS = [
  { href: "/field", label: "Today", icon: Sun },
  { href: "/field/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/field/hours", label: "My hours", icon: Clock },
];

export default function FieldTabBar() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-2xl grid grid-cols-3">
        {TABS.map((t) => {
          const on = t.href === "/field" ? path === "/field" || path.startsWith("/field/job") : path.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className={`relative flex flex-col items-center justify-center gap-1 min-h-[60px] text-xs font-semibold ${on ? "text-white" : "text-neutral-400"}`}>
              {on ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-white" /> : null}
              <Icon size={22} strokeWidth={on ? 2.4 : 1.9} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
