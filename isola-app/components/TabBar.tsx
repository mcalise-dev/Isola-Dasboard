"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const OPS = [
  { href: "/build", label: "Build", icon: "🧱" },
  { href: "/", label: "Jobs", icon: "🗂️" },
  { href: "/log", label: "Daily log", icon: "📓" },
  { href: "/billing", label: "Billing", icon: "💳" },
  { href: "/docs", label: "Documents", icon: "🛡️" },
  { href: "/reports", label: "Reports", icon: "📊" },
  { href: "/snow", label: "Recurring", icon: "❄️" },
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
];
const MKT = [
  { href: "/marketing", label: "CRM", icon: "📇" },
  { href: "/marketing/campaign", label: "Campaign", icon: "📣" },
  { href: "/marketing/tasks", label: "Marketing tasks", icon: "📋" },
];
const QUICK = [
  { href: "/build", label: "Start a build", sub: "Walk → Price → Send", icon: "🧱" },
  { href: "/log", label: "Log the day", sub: "What got done on site", icon: "📓" },
  { href: "/billing", label: "Record a payment", sub: "Deposit, midpoint, balance", icon: "💳" },
  { href: "/costs", label: "Add a cost", sub: "Receipt or labor", icon: "🧾" },
  { href: "/leads", label: "Add a lead", sub: "Job to go look at", icon: "🔎" },
  { href: "/tasks", label: "Add a task", sub: "Job to-do", icon: "✅" },
  { href: "/schedule", label: "Schedule a job", sub: "Put it on the calendar", icon: "📅" },
  { href: "/marketing", label: "Add a contact", sub: "New CRM prospect", icon: "📇" },
  { href: "/visits", label: "Log a site visit", sub: "Observed conditions", icon: "📍" },
  { href: "/customers", label: "Add a customer", sub: "Contact + client type", icon: "👥" },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/marketing") return path === "/marketing";
  return path.startsWith(href);
}

export default function TabBar() {
  const path = usePathname();
  const router = useRouter();
  const [sheet, setSheet] = useState<"" | "more" | "add">("");
  const inMkt = path.startsWith("/marketing");

  const tabs = [
    { key: "home", label: "Home", icon: "🏠", active: path === "/home", go: () => router.push("/home") },
    inMkt
      ? { key: "crm", label: "CRM", icon: "📇", active: path === "/marketing", go: () => router.push("/marketing") }
      : { key: "jobs", label: "Jobs", icon: "🗂️", active: path === "/", go: () => router.push("/") },
    { key: "add", label: "", icon: "＋", active: false, go: () => setSheet(sheet === "add" ? "" : "add") },
    inMkt
      ? { key: "camp", label: "Campaign", icon: "📣", active: path.startsWith("/marketing/campaign"), go: () => router.push("/marketing/campaign") }
      : { key: "tasks", label: "Tasks", icon: "✅", active: path.startsWith("/tasks"), go: () => router.push("/tasks") },
    { key: "more", label: "More", icon: "☰", active: sheet === "more", go: () => setSheet(sheet === "more" ? "" : "more") },
  ];

  function navRow(t: { href: string; label: string; icon: string }) {
    const active = isActive(path, t.href);
    return (
      <Link key={t.href} href={t.href} onClick={() => setSheet("")}
        className={`flex items-center gap-3 rounded-xl px-3.5 py-3 border ${active ? "border-neutral-400 bg-neutral-800" : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"}`}>
        <span className="text-xl leading-none">{t.icon}</span>
        <span className={`text-sm font-semibold ${active ? "text-white" : "text-neutral-200"}`}>{t.label}</span>
        {active ? <span className="ml-auto text-[10px] font-bold uppercase text-neutral-400">You're here</span> : null}
      </Link>
    );
  }

  return (
    <>
      {sheet ? (
        <div className="fixed inset-0 z-40 bg-black/70" onClick={() => setSheet("")}>
          <div className="absolute bottom-0 left-0 right-0 pb-[calc(env(safe-area-inset-bottom)+72px)]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto max-w-2xl bg-neutral-900 border-t border-x border-neutral-700 rounded-t-2xl px-4 pt-3 pb-4">
              <div className="w-10 h-1 rounded-full bg-neutral-700 mx-auto mb-3" />
              {sheet === "more" ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Operations</div>
                    <div className="space-y-1.5">{OPS.map(navRow)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Marketing</div>
                    <div className="space-y-1.5">{MKT.map(navRow)}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Quick add</div>
                  {QUICK.map((a) => (
                    <Link key={a.label} href={a.href} onClick={() => setSheet("")}
                      className="flex items-center gap-3 rounded-xl px-3.5 py-3 border border-neutral-800 bg-neutral-950 hover:border-neutral-600">
                      <span className="text-xl leading-none">{a.icon}</span>
                      <span>
                        <span className="block text-sm font-semibold text-white">{a.label}</span>
                        <span className="block text-xs text-neutral-500">{a.sub}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950 border-t border-neutral-800 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-2xl grid grid-cols-5">
          {tabs.map((t) =>
            t.key === "add" ? (
              <button key={t.key} onClick={t.go} aria-label="Quick add" className="flex items-center justify-center py-1.5">
                <span className={`w-11 h-11 -mt-4 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg ring-4 ring-neutral-950 ${sheet === "add" ? "bg-neutral-300 text-neutral-900" : "bg-white text-neutral-900"}`}>＋</span>
              </button>
            ) : (
              <button key={t.key} onClick={t.go} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${t.active ? "text-white" : "text-neutral-500"}`}>
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </button>
            )
          )}
        </div>
      </nav>
    </>
  );
}
