"use client";
// Connector-dependent screens. Until a source is connected each shows its status, what it
// will show, and how to connect it — never placeholder numbers (spec addendum B).
import { PageHeader } from "@/components/ui/bits";
import { Card } from "@/components/ui/card";
import { ConnectorGate } from "@/components/marketing/cc/shared";

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="p-4"><h3 className="mb-1.5 text-[15px] font-semibold text-white">{title}</h3><div className="space-y-2 text-sm text-neutral-400">{children}</div></Card>;
}

export function InboxScreen() {
  return (<div>
    <PageHeader title="Inbox & conversations" sub="Real threads from mcalise@isola-ri.com, matched to targets, leads and jobs." />
    <ConnectorGate title="The inbox" providers={["gmail"]}>
      <Note title="How replies will work">
        <p>Replies to outreach are pulled in read-only and tagged interested, not now, opt-out or bounced. Opt-outs and bounces go straight onto the do-not-contact list.</p>
        <p>Suggested replies are saved as drafts in Approvals. Opening or editing a draft never sends it.</p>
      </Note>
    </ConnectorGate>
  </div>);
}

export function SeoScreen() {
  return (<div>
    <PageHeader title="SEO & competitors" sub="What people search to find commercial drainage, concrete and masonry work in Rhode Island, and how isola-ri.com shows up." />
    <ConnectorGate title="SEO" providers={["google_search_console", "google_analytics", "semrush"]}>
      <Note title="Service pages this will track">
        <p>Commercial drainage, parking-lot and site drainage, concrete repair, masonry restoration, retaining walls, commercial sitework, property maintenance. Location pages only for towns you actually serve.</p>
        <p>Recommendations arrive as editable briefs (title, page copy, schema). Publishing any website change is a separate approval with the before/after shown.</p>
      </Note>
    </ConnectorGate>
  </div>);
}

export function LocalScreen() {
  return (<div>
    <PageHeader title="Local presence" sub="Your Google Business listing, reviews, and map rankings across Providence, Cranston, Warwick, East Providence and Pawtucket." />
    <ConnectorGate title="Local presence" providers={["google_business_profile", "brightlocal"]}>
      <Note title="Until Business Profile API access is approved">
        <p>Review replies and posts stay manual. Reviews & referrals (in the menu) still tracks which finished jobs to ask for a review.</p>
      </Note>
    </ConnectorGate>
  </div>);
}

export function AiSearchScreen() {
  return (<div>
    <PageHeader title="AI search" sub="Whether AI answers mention or cite Isola for commercial work in RI." />
    <ConnectorGate title="AI search" providers={["google_search_console"]}>
      <Note title="Method (no invented scores)">
        <p>No official API reports AI rankings. This screen will log observations: a fixed list of non-personalized questions (for example “commercial drainage contractor Providence RI”), the AI tool and date, a snapshot of the answer, and any sources it cited. Results vary run to run, and that's shown.</p>
        <p>Where Search Console offers generative AI performance reports through its API, those numbers appear here with their source. What improves visibility: real case studies with dated photos, clear service pages, consistent business details, and helpful FAQs.</p>
      </Note>
    </ConnectorGate>
  </div>);
}

export function PaidScreen() {
  return (<div>
    <PageHeader title="Paid media & LinkedIn" sub="Read-only performance first. Any ad, budget or post change is its own approval with the exact spend." />
    <ConnectorGate title="Paid media" providers={["google_ads", "linkedin"]}>
      <Note title="Spend rules">
        <p>Setting a budget is not approval to launch. Each campaign creation, enable, pause, keyword, geography or budget change shows the exact diff and the maximum daily spend before you approve it. Forecasts are labeled FORECAST, never shown as actual.</p>
      </Note>
    </ConnectorGate>
  </div>);
}

export function CallsScreen() {
  return (<div>
    <PageHeader title="Calls & attribution" sub="Which calls and form fills became walkthroughs, estimates and awarded jobs." />
    <ConnectorGate title="Calls & attribution" providers={["website_forms", "callrail", "isola_crm"]}>
      <Note title="How attribution will count">
        <p>Revenue counts only from real jobs in this app. First touch and last touch are shown separately, plus “unknown” when the source isn't known. The Overview's channel table uses the lead source you set on each job today.</p>
      </Note>
    </ConnectorGate>
  </div>);
}
