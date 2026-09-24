// v4.3 (9/23/26): the app is organised into five hubs. Every old route still works —
// the hubs only change how you get there. Each hub shows its screens as a tab strip
// at the top of the page (HubTabs), and the bottom bar / side menu show the hubs.
import {
  Sun, Briefcase, CalendarDays, Wallet, Users,
  ClipboardList, NotebookPen, ListChecks, Megaphone,
  Search, Hammer, Send, MapPin,
  HardHat, Snowflake,
  Receipt, CreditCard, Handshake, BarChart3, ShieldCheck,
  Contact, Mail, Building2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type Hub = { key: string; label: string; icon: LucideIcon; home: string; items: NavItem[] };

export const HUBS: Hub[] = [
  {
    key: "today", label: "Today", icon: Sun, home: "/home",
    items: [
      { href: "/home", label: "Today", icon: Sun },
      { href: "/tasks", label: "Tasks", icon: ListChecks },
      { href: "/marketing/tasks", label: "Marketing to-dos", icon: Megaphone },
      { href: "/gameplan", label: "Game plan", icon: ClipboardList },
      { href: "/log", label: "Daily log", icon: NotebookPen },
    ],
  },
  {
    key: "jobs", label: "Jobs", icon: Briefcase, home: "/",
    items: [
      { href: "/", label: "All jobs", icon: Briefcase },
      { href: "/leads", label: "To quote", icon: Search },
      { href: "/visits", label: "Site visits", icon: MapPin },
      { href: "/build", label: "Build & price", icon: Hammer },
      { href: "/proposals", label: "Proposals sent", icon: Send },
    ],
  },
  {
    key: "schedule", label: "Schedule", icon: CalendarDays, home: "/schedule",
    items: [
      { href: "/schedule", label: "Calendar", icon: CalendarDays },
      { href: "/crew", label: "Crew & time", icon: HardHat },
      { href: "/snow", label: "Recurring", icon: Snowflake },
    ],
  },
  {
    key: "money", label: "Money", icon: Wallet, home: "/money",
    items: [
      { href: "/money", label: "Owed to me", icon: Wallet },
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/costs", label: "Costs", icon: Receipt },
      { href: "/thm", label: "THM tab", icon: Handshake },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/docs", label: "Documents", icon: ShieldCheck },
    ],
  },
  {
    key: "people", label: "People", icon: Users, home: "/customers",
    items: [
      { href: "/customers", label: "Customers", icon: Building2 },
      { href: "/marketing", label: "Prospects", icon: Contact },
      { href: "/marketing/campaign", label: "Campaign", icon: Megaphone },
      { href: "/mail", label: "Mail", icon: Mail },
    ],
  },
];

// Longest matching href wins, so /marketing/tasks beats /marketing and "/" only matches itself.
export function activeItem(path: string): { hub: Hub; item: NavItem } | null {
  let best: { hub: Hub; item: NavItem } | null = null;
  let bestLen = -1;
  for (const hub of HUBS) {
    for (const item of hub.items) {
      const hit = item.href === "/" ? path === "/" : path === item.href || path.startsWith(item.href + "/");
      if (hit && item.href.length > bestLen) { best = { hub, item }; bestLen = item.href.length; }
    }
  }
  if (!best && path.startsWith("/customers")) best = { hub: HUBS[4], item: HUBS[4].items[0] };
  return best;
}
