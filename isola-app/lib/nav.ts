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
  Settings, FolderCheck, HandCoins, Clock, PenTool, TrendingUp, CalendarCheck,
  type LucideIcon,
} from "lucide-react";

// A screen. A menu entry is a NavItem with `tabs` (its screens, first tab = the entry's
// own page) or without (a single screen).
export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string; key?: string; tabs?: NavItem[] };
export type NavGroup = { key: string; label: string; icon: LucideIcon; home: string; items: NavItem[]; /** starts folded in the menu */ collapsed?: boolean };

// v7.4 (10/22/26): Crew & subs gets its own entry (crew, vendors/COIs, subs payroll) and
// Reports splits out of Money. The menu now lists every screen under its entry.
// v6.8 (10/19/26): cleanup — 7 menu entries instead of 13. Today/Game plan/Daily log/Mail
// moved under Home, Build & proposals under Jobs, Crew & time under Schedule, Costs under
// Money, Docs & vendors under Customers. Settings sits at the bottom of the menu.
export const HOME: NavItem = { href: "/home", label: "Home", icon: Home, badge: "home", key: "home", tabs: [
  { href: "/home", label: "Home", icon: Home, badge: "home" },
  { href: "/today", label: "Day sheet", icon: Sun },
  { href: "/gameplan", label: "Game plan", icon: ClipboardList },
  { href: "/log", label: "Daily log", icon: NotebookPen },
  { href: "/mail", label: "Mail", icon: Mail },
] };

export const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: Settings, key: "settings" };

// v8.0 (10/28/26): Mike's cleanup. Main list, in his order: Pipeline · Projects · Schedule ·
// Crew & vendors · Clients · Accounting · Tasks. Marketing is tucked under its own collapsed
// group at the bottom. Every old route still works.
export const GROUPS: NavGroup[] = [
  {
    key: "work", label: "Run the business", icon: Briefcase, home: "/",
    items: [
      // Leads · Awaiting quote · Sent · Booked · In progress · Complete · Future (stage strip on the page)
      { key: "pipeline", href: "/", label: "Pipeline", icon: Workflow, badge: "leads", tabs: [
        { href: "/", label: "Pipeline", icon: Workflow, badge: "leads" },
        { href: "/visits", label: "Site visits", icon: MapPin },
        { href: "/proposals", label: "Proposals sent", icon: Send, badge: "proposals" },
      ] },
      { key: "projects", href: "/projects", label: "Projects", icon: Briefcase, tabs: [
        { href: "/projects", label: "Active projects", icon: Briefcase },
        { href: "/build", label: "Build & price", icon: Hammer },
        { href: "/punchlist", label: "Punch list", icon: ClipboardCheck },
        { href: "/markup", label: "Photo markup", icon: PenTool },
      ] },
      { key: "schedule", href: "/dispatch", label: "Schedule", icon: CalendarDays, tabs: [
        { href: "/dispatch", label: "Dispatch board", icon: LayoutGrid, badge: "dispatch" },
        { href: "/schedule", label: "Calendar", icon: CalendarDays },
        { href: "/snow", label: "Recurring", icon: Snowflake },
      ] },
      { key: "crew", href: "/crew", label: "Crew & vendors", icon: HardHat, tabs: [
        { href: "/crew", label: "Crew & time", icon: HardHat },
        { href: "/vendors", label: "Vendors (COI, W-9)", icon: Truck, badge: "vendors" },
      ] },
      { key: "clients", href: "/customers", label: "Clients", icon: Building2, tabs: [
        { href: "/customers", label: "Clients & properties", icon: Building2 },
        { href: "/docs", label: "Documents", icon: ShieldCheck },
      ] },
      // who's owed what, from which job — both directions — plus THM, costs and the books
      { key: "accounting", href: "/money", label: "Accounting", icon: Wallet, tabs: [
        { href: "/money", label: "Owed to me", icon: Wallet, badge: "money" },
        { href: "/payroll", label: "Owed to crew", icon: HandCoins },
        { href: "/thm", label: "THM tab", icon: Handshake },
        { href: "/costs", label: "Costs", icon: Receipt, badge: "costs" },
        { href: "/billing", label: "Billing", icon: CreditCard },
        { href: "/tm", label: "T&M billing", icon: Clock },
        { href: "/reports", label: "Reports", icon: BarChart3 },
        { href: "/money/cashflow", label: "Cash flow", icon: TrendingUp },
        { href: "/money/review", label: "Monthly review", icon: CalendarCheck },
        { href: "/money/pay", label: "My pay", icon: Gauge },
      ] },
      { key: "tasks", href: "/tasks", label: "Tasks", icon: ListChecks, tabs: [
        { href: "/tasks", label: "Tasks", icon: ListChecks, badge: "tasks" },
        { href: "/marketing/tasks", label: "Marketing to-dos", icon: ListChecks, badge: "mkttasks" },
      ] },
    ],
  },
  {
    key: "grow", label: "Marketing", icon: Megaphone, home: "/marketing", collapsed: true,
    items: [
      { key: "marketing", href: "/marketing", label: "Marketing", icon: Megaphone, tabs: [
        { href: "/marketing", label: "Overview", icon: Gauge },
        { href: "/marketing/approvals", label: "Approvals", icon: ShieldCheck, badge: "approvals" },
        { href: "/marketing/targets", label: "Prospects & targets", icon: Target, badge: "targets" },
        { href: "/marketing/pipeline", label: "Commercial pipeline", icon: Contact },
        { href: "/marketing/outreach", label: "Campaign studio", icon: Workflow, badge: "outreach" },
        { href: "/marketing/inbox", label: "Inbox", icon: Mail },
        { href: "/marketing/reviews", label: "Reviews & referrals", icon: Star, badge: "reviews" },
        { href: "/marketing/seo", label: "SEO & competitors", icon: Search },
        { href: "/marketing/local", label: "Local presence", icon: MapPin },
        { href: "/marketing/ai-search", label: "AI search", icon: Sparkles },
        { href: "/marketing/paid", label: "Paid media & LinkedIn", icon: BadgeDollarSign },
        { href: "/marketing/calls", label: "Calls & attribution", icon: PhoneCall },
        { href: "/marketing/playbook", label: "Calendar & playbook", icon: CalendarRange },
        { href: "/marketing/integrations", label: "Integrations & audit", icon: PlugZap },
      ] },
    ],
  },
];

// The screens under a menu entry (an entry without tabs is its own single screen).
export const screensOf = (entry: NavItem): NavItem[] => entry.tabs ?? [entry];

// Phone bottom bar — `match` lists menu-entry keys. v8.0: Home · Pipeline · Projects · Accounting · Menu.
export const TABS: { key: string; label: string; icon: LucideIcon; href: string; match: string[] }[] = [
  { key: "home", label: "Home", icon: Home, href: "/home", match: ["home"] },
  { key: "pipeline", label: "Pipeline", icon: Workflow, href: "/", match: ["pipeline"] },
  { key: "projects", label: "Projects", icon: Briefcase, href: "/projects", match: ["projects", "schedule"] },
  { key: "accounting", label: "Accounting", icon: Wallet, href: "/money", match: ["accounting"] },
];

// Old name kept so anything importing HUBS still compiles.
export const HUBS = GROUPS;

// Every screen, flat (search palette, pins, settings). Shape: { group, item }.
export const ALL_ITEMS: { group: NavGroup | null; item: NavItem }[] = [
  ...screensOf(HOME).map((item) => ({ group: null, item })),
  ...GROUPS.flatMap((g) => g.items.flatMap((e) => screensOf(e).map((item) => ({ group: g, item })))),
  { group: null, item: SETTINGS },
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
  for (const s of screensOf(HOME)) consider(null, HOME, s);
  consider(null, SETTINGS, SETTINGS);
  for (const g of GROUPS) for (const e of g.items) for (const s of screensOf(e)) consider(g, e, s);
  return best;
}

export const Icons = { Users };
