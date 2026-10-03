"use client";
// 90-day rollout and weekly owner rhythm (spec addendum H, I). Guidance, not data.
import { PageHeader, SectionTitle } from "@/components/ui/bits";
import { Badge } from "@/components/ui/badge";

const PLAN = [
  { window: "Days 1–15", work: "Safety foundation live (approvals, audit log, kill switch). Connect Gmail and, once the new site is up, Search Console and GA4 read-only. Confirm service pages, lead intake and tracking plan.", gate: "Real source IDs and last-sync dates; proven that nothing can send without approval.", now: true },
  { window: "Days 16–30", work: "Clean up CRM data; source-to-estimate funnel; test Semrush and BrightLocal plans; baseline technical and local audit; first account segmentation.", gate: "Real analytics with honest missing-data states." },
  { window: "Days 31–45", work: "Apollo discovery with an approved credit cap; first 100 verified target accounts; campaign drafts for property management and medical sites.", gate: "Every prospect has a source; no unsolicited sends." },
  { window: "Days 46–60", work: "You pick and release individual messages; sync real replies; CallRail if purchased.", gate: "Real delivery and reply history; opt-outs honored." },
  { window: "Days 61–75", work: "SEO work items, case studies, Business Profile improvements, Google Ads read-only baseline and draft proposals, LinkedIn access check.", gate: "Publishing stays gated; API limits visible." },
  { window: "Days 76–90", work: "Weekly marketing review, optional small approved ad tests, tie revenue back to source.", gate: "Each reported opportunity traces to real interactions, estimates and awarded jobs." },
];
const WEEK = [
  ["Monday", "New opportunities, unanswered real emails, connector problems, pending approvals."],
  ["Tuesday", "High-priority commercial prospect research; approve selected outreach yourself."],
  ["Wednesday", "Search and AI-search signals, site issues, local rankings; pick one page fix."],
  ["Thursday", "Walkthroughs, proposal follow-ups and handoffs to the job board; approve replies."],
  ["Friday", "Qualified leads, wins and losses, marketing costs, open pipeline, source attribution, next week's plan."],
];

export default function PlaybookScreen() {
  return (
    <div>
      <PageHeader title="Marketing calendar & playbook" sub="The 90-day rollout and the weekly rhythm from your Command Center spec." />
      <SectionTitle>90-day rollout</SectionTitle>
      <ol className="mb-8 overflow-hidden rounded-xl border border-border">
        {PLAN.map((p) => (
          <li key={p.window} className="grid gap-1 border-b border-border bg-card px-4 py-3 last:border-0 md:grid-cols-[120px_1fr_1fr] md:gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">{p.window}{p.now ? <Badge variant="warning">Now</Badge> : null}</div>
            <div className="text-sm text-neutral-300">{p.work}</div>
            <div className="text-xs text-neutral-500"><span className="font-semibold text-neutral-400">Done when: </span>{p.gate}</div>
          </li>
        ))}
      </ol>
      <SectionTitle>Weekly rhythm</SectionTitle>
      <div className="overflow-hidden rounded-xl border border-border">
        {WEEK.map(([d, t]) => (
          <div key={d} className="grid grid-cols-[100px_1fr] gap-3 border-b border-border bg-card px-4 py-3 last:border-0">
            <div className="text-sm font-semibold text-white">{d}</div><div className="text-sm text-neutral-300">{t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
