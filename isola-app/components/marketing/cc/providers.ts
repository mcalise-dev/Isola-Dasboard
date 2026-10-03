// What each connector will show once connected, and the exact steps Mike takes to connect it.
// Shown on the Integrations screen and on every screen that depends on the connector.
export type ProviderInfo = {
  shows: string;
  steps: string[];
  oauth?: boolean;        // connects with "Sign in with Google" from this app
  writes?: string;        // what it could change later, always behind approval
  cost?: string;
};

export const REDIRECT_HINT = "https://xkgfekvgftithakacldr.supabase.co/functions/v1/mkt-integrations/callback";

export const GOOGLE_PROJECT_STEPS = [
  "Go to console.cloud.google.com and create a project named “Isola Command Center”.",
  "OAuth consent screen: choose Internal (only isola-ri.com accounts can use it).",
  "Credentials → Create credentials → OAuth client ID → Web application.",
  `Add this Authorized redirect URI: ${REDIRECT_HINT}`,
  "In Supabase → Edge Functions → Secrets, add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET with the values Google shows you. Don't paste them in chat.",
];

export const PROVIDERS: Record<string, ProviderInfo> = {
  isola_crm: {
    shows: "Jobs, customers, properties, prospects, estimates, won and lost work. This is the source of truth for revenue and attribution.",
    steps: ["Already connected: it's this app's own database."],
  },
  gmail: {
    shows: "Real inbound and outbound threads, replies to outreach, opt-outs and bounces, matched to targets and jobs.",
    oauth: true,
    steps: [...GOOGLE_PROJECT_STEPS, "In the same project, enable the Gmail API.", "Press Connect here and approve read-only access as mcalise@isola-ri.com. Sending permission is requested separately, later."],
    writes: "Send or reply, one approved message at a time.",
  },
  google_search_console: {
    shows: "Search queries and pages with clicks, impressions, CTR and position, branded vs non-branded.",
    oauth: true,
    steps: ["The new isola-ri.com has to be live first.", "Verify isola-ri.com in Search Console (DNS record on the domain).", "Enable the Google Search Console API in the Isola Command Center project.", "Press Connect here (read only)."],
  },
  google_analytics: {
    shows: "Sessions by channel and source, landing pages, form submissions and calls as conversions.",
    oauth: true,
    steps: ["Create a GA4 property for the new isola-ri.com and add its tag to the site (after you approve the change).", "Enable the Google Analytics Admin API and Data API in the project.", "Press Connect here (read only)."],
  },
  google_business_profile: {
    shows: "Your verified listing, categories, photos, reviews waiting for a reply, and the performance numbers Google allows.",
    steps: ["Make sure mcalise@isola-ri.com is an owner or manager of the Isola listing.", "Request Business Profile API access from Google (an application form; approval can take weeks).", "Until it's approved, review replies and posts stay manual tasks."],
    writes: "Posts and review replies, each approved individually.",
  },
  google_ads: {
    shows: "Campaigns, budgets, actual spend, search terms and conversions linked to real leads.",
    steps: ["Have a Google Ads account for Isola (or confirm you don't want ads yet).", "Apply for Google Ads API access through the Isola Command Center project (the old developer token process ended Sept 9, 2026).", "Connect read-only first. Any ad or budget change is a separate approval with the exact spend shown."],
    writes: "Create, pause or change campaigns and budgets, each approved with a spend cap.",
  },
  website_forms: {
    shows: "Every form submission and its source (UTM, referrer, Google click ID) as a lead in this app.",
    steps: ["Part of the isola-ri.com rebuild: the contact form posts to a signed webhook in this app.", "Add a spam check and record the source fields with each lead."],
  },
  callrail: {
    shows: "Tracked calls with source, duration and outcome, matched to leads, walkthroughs and estimates.",
    steps: ["Only if you buy CallRail.", "Create an API key and a webhook in CallRail; the key goes into Supabase secrets."],
    cost: "Paid plan",
  },
  semrush: {
    shows: "Rank tracking, site audit issues and competitor gaps next to your own Search Console data.",
    steps: ["Needs a Semrush plan that includes API units (SEO Business tier).", "Create an API key; it goes into Supabase secrets.", "Set a monthly unit cap. Runs that would go over it are refused."],
    cost: "Paid plan + API units",
  },
  brightlocal: {
    shows: "Local map rankings across Providence, Cranston, Warwick, East Providence and Pawtucket, plus citations and reviews.",
    steps: ["BrightLocal account, then request an API key through their support.", "Key goes into Supabase secrets."],
    cost: "Paid plan",
  },
  apollo: {
    shows: "Verified decision makers at RI property managers, medical practices, banks and GCs, with source and verification date.",
    steps: ["Apollo plan with API access.", "Key goes into Supabase secrets.", "Set a credit budget. Every lookup batch shows the credits it will use and waits for your approval."],
    cost: "Paid plan + credits",
    writes: "Uses paid credits, so every batch needs approval.",
  },
  linkedin: {
    shows: "Your company page posts and any paid ad performance LinkedIn allows.",
    steps: ["LinkedIn API access needs a developer app and product approval from LinkedIn.", "Until it's approved: research and posting stay manual. No automated connection requests or messages, ever."],
    writes: "Company posts, each approved individually.",
  },
};

export const ORDER = ["isola_crm", "gmail", "google_search_console", "google_analytics", "website_forms", "google_business_profile", "google_ads", "semrush", "brightlocal", "apollo", "callrail", "linkedin"];
