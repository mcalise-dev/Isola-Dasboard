"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sun, CalendarDays, Clock, Receipt, Truck, Wallet } from "lucide-react";

const TABS = [
  { href: "/field", label: "Today", icon: Sun },
  { href: "/field/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/field/hours", label: "My hours", icon: Clock },
  { href: "/field/payments", label: "Payments", icon: Wallet },
];

export default function FieldTabBar() {
  const path = usePathname();
  // THM partner (Tyler) also gets a Receipts tab for materials he paid for
  const [thm, setThm] = useState(false);
  useEffect(() => { createClient().rpc("crew_is_thm").then(({ data }) => setThm(!!data)); }, []);
  const tabs = thm ? [...TABS, { href: "/field/thm", label: "THM jobs", icon: Truck }, { href: "/field/receipts", label: "Receipts", icon: Receipt }] : TABS;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)]">
      <div className={`mx-auto max-w-2xl grid ${tabs.length === 6 ? "grid-cols-6" : "grid-cols-4"}`}>
        {tabs.map((t) => {
          const on = t.href === "/field" ? path === "/field" || path.startsWith("/field/job") : path.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className={`relative flex flex-col items-center justify-center gap-1 min-h-[60px] text-[11px] font-semibold ${on ? "text-white" : "text-neutral-400"}`}>
              {on ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" /> : null}
              <Icon size={22} strokeWidth={on ? 2.4 : 1.9} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
