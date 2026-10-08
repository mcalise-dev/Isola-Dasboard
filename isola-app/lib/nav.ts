// v4.9 (10/8/26): 13 menu entries instead of ~37. Screens that belong together sit under
// ONE entry and show as a tab strip at the top of the page (HubTabs) on phone and desktop.
// Every old route still works. Phone keeps the 5-button bottom bar (Home, Jobs, Schedule,
// Money, Menu); Menu opens the same entries.
import {
  Home, Briefcase, CalendarDays, Wallet, Users,
  ClipboardList, NotebookPen, ListChecks, Megaphone,
  Search, Hammer, Send, MapPin, HardHat, Snowflake,
  Receipt, CreditCard, Handshake, BarChart3, ShieldCheck,
  Contact, Mail, Building2, LayoutGrid, Target, Workflow, Star, Sun, Gauge,
  Sparkles, BadgeDollarSign, PhoneCall, CalendarRange, PlugZap, Truck, ClipboardCheck,
  Settings, FolderCheck,
  type LucideIcon,
} from "lucide-react";

// A screen. A menu entry is a NavItem with `tabs` (its screens, first tab = the entry's
// own page) or without (a single screen).
export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string; key?: string; tabs?: NavItem[] };
export type NavGroup = { key: string; label: string; icon: LucideIcon; home: string; items: NavItem[] };

export const HOME: NavItem = { href: "/home", label: "Home", icon: Home, badge: "home", key: "home" };

export const GROUPS: NavGroup[] = [
  {
    key: "work", label: "Work", icon: Briefcase, home: "/",
    items: [
      { key: "jobs", href: "/", label: "Jobs", icon: Briefcase, tabs: [
        { href: "/", label: "Jobs", icon: Briefcase, badge: "jobs" },
        { href: "/leads", label: "To quote", icon: Search, badge: "leads" },
        { href: "/visits", label: "Site visits", icon: MapPin },
        { href: "/punchlist", label: "Punch list", icon: ClipboardCheck },
      ] },
      { key: "build", href: "/build", label: "Build & proposals", icon: Hammer, tabs: [
        { href: "/build", label: "Build & price", icon: Hammer },
        { href: "/proposals", label: "Proposals sent", icon: Send, badge: "proposals" },
      ] },
      { key: "schedule", href: "/dispatch", label: "Schedule", icon: CalendarDays, tabs: [
        { href: "/dispatch", label: "Dispatch board", icon: LayoutGrid, badge: "dispatch" },
        { href: "/schedule", label: "Calendar", icon: CalendarDays },
        { href: "/snow", label: "Recurring", icon: Snowflake },
      ] },
      { key: "crew", href: "/crew", label: "Crew & time", icon: HardHat },
    ],
  },
  {
    key: "people", label: "People", icon: Building2, home: "/customers",
    items: [
      { key: "customers", href: "/customers", label: "Customers", icon: Building2, tabs: [
        { href: "/customers", label: "Customers & properties", icon: Building2 },
        { href: "/mail", label: "Mail", icon: Mail },
      ] },
      { key: "marketing", href: "/marketing", label: "Marketing", icon: Megaphone, tabs: [
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
        { href: "/marketing/integrations", label: "Integrations & audit", icon: PlugZap },
      ] },
      { key: "paperwork", href: "/docs", label: "Docs & vendors", icon: FolderCheck, tabs: [
        { href: "/docs", label: "Documents", icon: ShieldCheck },
        { href: "/vendors", label: "Vendors", icon: Truck },
      ] },
    ],
  },
  {
    key: "money", label: "Money", icon: Wallet, home: "/money",
    items: [
      { key: "money", href: "/money", label: "Money", icon: Wallet, tabs: [
        { href: "/money", label: "Owed to me", icon: Wallet, badge: "money" },
        { href: "/billing", label: "Billing", icon: CreditCard },
        { href: "/reports", label: "Reports", icon: BarChart3 },
        { href: "/thm", label: "THM tab", icon: Handshake },
      ] },
      { key: "costs", href: "/costs", label: "Costs", icon: Receipt, badge: "costs" },
    ],
  },
  {
    key: "planning", label: "Planning", icon: ClipboardList, home: "/tasks",
    items: [
      { key: "today", href: "/today", label: "Today", icon: Sun, tabs: [
        { href: "/today", label: "Day sheet", icon: Sun },
        { href: "/gameplan", label: "Game plan", icon: ClipboardList },
        { href: "/log", label: "Daily log", icon: NotebookPen },
      ] },
      { key: "tasks", href: "/tasks", label: "Tasks", icon: ListChecks, tabs: [
        { href: "/tasks", label: "Tasks", icon: ListChecks, badge: "tasks" },
        { href: "/marketing/tasks", label: "Marketing to-dos", icon: ListChecks, badge: "mkttasks" },
      ] },
      { key: "settings", href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

// The screens under a menu entry (an entry without tabs is its own single screen).
export const screensOf = (entry: NavItem): NavItem[] => entry.tabs ?? [entry];

// Phone bottom bar — `match` lists menu-entry keys.
export const TABS: { key: string; label: string; icon: LucideIcon; href: string; match: string[] }[] = [
  { key: "home", label: "Home", icon: Home, href: "/home", match: ["home"] },
  { key: "work", label: "Jobs", icon: Briefcase, href: "/", match: ["jobs", "build"] },
  { key: "schedule", label: "Schedule", icon: CalendarDays, href: "/dispatch", match: ["schedule"] },
  { key: "money", label: "Money", icon: Wallet, href: "/money", match: ["money", "costs"] },
];

// Old name kept so anything importing HUBS still compiles.
export const HUBS = GROUPS;

// Every screen, flat (search palette, pins, settings). Shape: { group, item }.
export const ALL_ITEMS: { group: NavGroup | null; item: NavItem }[] = [
  { group: null, item: HOME },
  ...GROUPS.flatMap((g) => g.items.flatMap((e) => screensOf(e).map((item) => ({ group: g, item })))),
];

const matches = (path: string, href: string) =>
  href === "/" ? path === "/" || path.startsWith("/jobs") : path === href || path.startsWith(href + "/");

// Longest matching screen wins, so /marketing/tasks beats /marketing and "/" only matches
// itself (plus /jobs/...). Returns the group, the menu entry and the specific screen.
export function activeItem(path: string): { hub: NavGroup | null; entry: NavItem; item: NavItem } | null {
  let best: { hub: NavGroup | null; entry: NavItem; item: NavItem } | null = null;
  let bestLen = -1;
  const consider = (hub: NavGroup | null, entry: NavItem, item: NavItem) => {
    if (!matches(path, item.href)) return;
    const len = item.href === "/" ? 1 : item.href.length;
    if (len > bestLen) { best = { hub, entry, item }; bestLen = len; }
  };
  consider(null, HOME, HOME);
  for (const g of GROUPS) for (const e of g.items) for (const s of screensOf(e)) consider(g, e, s);
  return best;
}

export const Icons = { Users };
