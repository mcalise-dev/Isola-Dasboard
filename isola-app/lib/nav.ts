// v4.6 (10/3/26): grouped sidebar (Field Desk layout) — Home, then Work / Schedule /
// Customers / Marketing / Money / Planning. Every old route still works. The phone keeps
// a 5-button bottom bar (Home, Jobs, Schedule, Money, Menu) and the Menu opens all groups.
import {
  Home, Briefcase, CalendarDays, Wallet, Users,
  ClipboardList, NotebookPen, ListChecks, Megaphone,
  Search, Hammer, Send, MapPin, HardHat, Snowflake,
  Receipt, CreditCard, Handshake, BarChart3, ShieldCheck,
  Contact, Mail, Building2, LayoutGrid, Target, Workflow, Star, Sun, Gauge,
  Sparkles, BadgeDollarSign, PhoneCall, CalendarRange, PlugZap, Truck, ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string };
// compact: the sidebar shows the group as ONE link to `home`; its screens appear as a tab
// strip at the top of the page instead (HubTabs), on desktop as well as phone.
export type NavGroup = { key: string; label: string; icon: LucideIcon; home: string; items: NavItem[]; compact?: boolean };

export const HOME: NavItem = { href: "/home", label: "Home", icon: Home, badge: "home" };

export const GROUPS: NavGroup[] = [
  {
    key: "work", label: "Work", icon: Briefcase, home: "/",
    items: [
      { href: "/", label: "Jobs", icon: Briefcase, badge: "jobs" },
      { href: "/leads", label: "To quote", icon: Search, badge: "leads" },
      { href: "/visits", label: "Site visits", icon: MapPin },
      { href: "/build", label: "Build & price", icon: Hammer },
      { href: "/proposals", label: "Proposals sent", icon: Send, badge: "proposals" },
      { href: "/punchlist", label: "Punch list", icon: ClipboardCheck },
    ],
  },
  {
    key: "schedule", label: "Schedule", icon: CalendarDays, home: "/schedule",
    items: [
      { href: "/dispatch", label: "Dispatch board", icon: LayoutGrid, badge: "dispatch" },
      { href: "/schedule", label: "Calendar", icon: CalendarDays },
      { href: "/crew", label: "Crew & time", icon: HardHat },
      { href: "/snow", label: "Recurring", icon: Snowflake },
    ],
  },
  {
    key: "customers", label: "Customers", icon: Building2, home: "/customers",
    items: [
      { href: "/customers", label: "Customers & properties", icon: Building2 },
      { href: "/mail", label: "Mail", icon: Mail },
    ],
  },
  {
    key: "marketing", label: "Marketing", icon: Megaphone, home: "/marketing", compact: true,
    items: [
      { href: "/marketing", label: "Overview", icon: Gauge },
      { href: "/marketing/approvals", label: "Approvals", icon: ShieldCheck, badge: "approvals" },
      { href: "/marketing/targets", label: "Prospects & targets", icon: Target, badge: "targets" },
      { href: "/marketing/pipeline", label: "Commercial pipeline", icon: Contact },
      { href: "/marketing/outreach", label: "Campaign studio", icon: Workflow, badge: "outreach" },
      { href: "/marketing/inbox", label: "Inbox", icon: Mail },
      { href: "/marketing/seo", label: "SEO & competitors", icon: Search },
      { href: "/marketing/local", label: "Local presence", icon: MapPin },
      { href: "/marketing/ai-search", label: "AI search", icon: Sparkles },
      { href: "/marketing/paid", label: "Paid media & LinkedIn", icon: BadgeDollarSign },
      { href: "/marketing/calls", label: "Calls & attribution", icon: PhoneCall },
      { href: "/marketing/reviews", label: "Reviews & referrals", icon: Star, badge: "reviews" },
      { href: "/marketing/playbook", label: "Calendar & playbook", icon: CalendarRange },
      { href: "/marketing/tasks", label: "Marketing to-dos", icon: ListChecks, badge: "mkttasks" },
      { href: "/marketing/integrations", label: "Integrations & audit", icon: PlugZap },
    ],
  },
  {
    key: "money", label: "Money", icon: Wallet, home: "/money",
    items: [
      { href: "/money", label: "Owed to me", icon: Wallet, badge: "money" },
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/costs", label: "Costs", icon: Receipt, badge: "costs" },
      { href: "/thm", label: "THM tab", icon: Handshake },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/docs", label: "Documents", icon: ShieldCheck },
      { href: "/vendors", label: "Vendors", icon: Truck },
    ],
  },
  {
    key: "planning", label: "Planning", icon: ClipboardList, home: "/tasks",
    items: [
      { href: "/tasks", label: "Tasks", icon: ListChecks, badge: "tasks" },
      { href: "/today", label: "Day sheet", icon: Sun },
      { href: "/gameplan", label: "Game plan", icon: ClipboardList },
      { href: "/log", label: "Daily log", icon: NotebookPen },
    ],
  },
];

// Phone bottom bar
export const TABS: { key: string; label: string; icon: LucideIcon; href: string; match: string[] }[] = [
  { key: "home", label: "Home", icon: Home, href: "/home", match: ["home"] },
  { key: "work", label: "Jobs", icon: Briefcase, href: "/", match: ["work"] },
  { key: "schedule", label: "Schedule", icon: CalendarDays, href: "/schedule", match: ["schedule"] },
  { key: "money", label: "Money", icon: Wallet, href: "/money", match: ["money"] },
];

// Old name kept so anything importing HUBS still compiles.
export const HUBS = GROUPS;
export const ALL_ITEMS: { group: NavGroup | null; item: NavItem }[] = [
  { group: null, item: HOME },
  ...GROUPS.flatMap((g) => g.items.map((item) => ({ group: g, item }))),
];

// Longest matching href wins, so /marketing/tasks beats /marketing and "/" only matches itself.
export function activeItem(path: string): { hub: NavGroup | null; item: NavItem } | null {
  let best: { hub: NavGroup | null; item: NavItem } | null = null;
  let bestLen = -1;
  for (const { group, item } of ALL_ITEMS) {
    const hit = item.href === "/" ? path === "/" || path.startsWith("/jobs") : path === item.href || path.startsWith(item.href + "/");
    const len = item.href === "/" && path.startsWith("/jobs") ? 1 : item.href.length;
    if (hit && len > bestLen) { best = { hub: group, item }; bestLen = len; }
  }
  return best;
}

export const Icons = { Users };
