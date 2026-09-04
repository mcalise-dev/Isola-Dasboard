"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS: { title: string; items: { href: string; label: string; icon: string }[] }[] = [
  { title: "", items: [{ href: "/home", label: "Home", icon: "🏠" }] },
  {
    title: "Operations",
    items: [
      { href: "/build", label: "Build", icon: "🧱" },
      { href: "/", label: "Jobs", icon: "🗂️" },
      { href: "/leads", label: "Leads", icon: "🔎" },
      { href: "/proposals", label: "Proposals", icon: "📤" },
      { href: "/schedule", label: "Schedule", icon: "📅" },
      { href: "/costs", label: "Costs", icon: "🧾" },
      { href: "/money", label: "Money", icon: "💵" },
      { href: "/tasks", label: "Tasks", icon: "✅" },
      { href: "/visits", label: "Site visits", icon: "📍" },
      { href: "/mail", label: "Mail", icon: "✉️" },
      { href: "/customers", label: "Customers", icon: "👥" },
  { href: "/crew", label: "Crew & time", icon: "⏱️" },
  { href: "/thm", label: "THM ledger", icon: "🤝" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { href: "/marketing", label: "CRM", icon: "📇" },
      { href: "/marketing/campaign", label: "Campaign", icon: "📣" },
      { href: "/marketing/tasks", label: "Marketing tasks", icon: "📋" },
    ],
  },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/marketing") return path === "/marketing";
  return path.startsWith(href);
}

export default function SideNav() {
  const path = usePathname();
  return (
    <aside className="hidden md:block fixed left-0 top-[57px] bottom-0 w-56 z-20 border-r border-neutral-800 bg-neutral-950/95 backdrop-blur overflow-y-auto">
      <nav className="p-3 space-y-4">
        {GROUPS.map((g) => (
          <div key={g.title || "top"}>
            {g.title ? <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">{g.title}</div> : null}
            <div className="space-y-0.5">
              {g.items.map((t) => {
                const active = isActive(path, t.href);
                return (
                  <Link key={t.href} href={t.href}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold ${active ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"}`}>
                    <span className="text-base leading-none">{t.icon}</span>
                    {t.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
