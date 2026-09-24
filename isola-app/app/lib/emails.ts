// Follow-up email templates (v4.1, 9/22/26).
// Same wording the morning Gmail-draft run uses — keep the two in step
// (the scheduled task's prompt carries a copy; see claude/App_v41_Today.md).
// Nothing here sends anything: the app opens a pre-filled email, the morning run
// only writes DRAFTS. Mike reads and hits send himself.

const SIGN = "Thanks,\nMike Calise\nIsola LLC\n508-933-2661";
const APP = "https://isola-dashboard.vercel.app";

const nice = (iso?: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric" });
};
const plus = (iso: string, days: number) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(y, m - 1, d + days);
  return t.toLocaleDateString("en-US", { month: "long", day: "numeric" });
};
export const firstName = (full?: string | null) => (full ?? "").trim().split(/\s+/)[0] || "there";
export const money$ = (n: number) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function proposalFollowup(stage: 1 | 2 | 3, o: { contact?: string | null; job: string; location?: string | null; sentDate?: string | null; token?: string | null }) {
  const hi = `Hi ${firstName(o.contact)},`;
  const what = `${o.job}${o.location && !o.job.includes(o.location) ? ` (${o.location})` : ""}`;
  const link = o.token ? `\n\nYou can review and approve it here: ${APP}/p/${o.token}` : "";
  const sent = o.sentDate ? ` on ${nice(o.sentDate)}` : "";
  if (stage === 1) return {
    subject: `Following up — ${o.job} proposal`,
    body: `${hi}\n\nJust checking in on the proposal I sent over${sent} for ${what}. Happy to walk through any of it or adjust the scope if something doesn't fit.${link}\n\nIf it looks good, reply here and we'll get you on the schedule.\n\n${SIGN}`,
  };
  if (stage === 2) return {
    subject: `Re: ${o.job} proposal`,
    body: `${hi}\n\nWanted to make sure the proposal for ${what} didn't get buried. Our schedule is filling up for the next few weeks, so if you'd like to lock in a start date, just let me know.${link}\n\n${SIGN}`,
  };
  return {
    subject: `Last check-in — ${o.job} proposal`,
    body: `${hi}\n\nLast check-in on the proposal for ${what}. Pricing is held for 30 days${o.sentDate ? `, through ${plus(o.sentDate, 30)}` : ""}.${link}\n\nIf the timing isn't right or you went another direction, no problem — a quick reply either way lets me close it out on my end.\n\n${SIGN}`,
  };
}

export function invoiceReminder(stage: 1 | 2 | 3, o: { contact?: string | null; ref: string; amount: number; due?: string | null; job?: string | null }) {
  const hi = `Hi ${firstName(o.contact)},`;
  const inv = `invoice #${o.ref}${o.job ? ` (${o.job})` : ""} for ${money$(o.amount)}`;
  const due = o.due ? `, due ${nice(o.due)}` : "";
  if (stage === 1) return {
    subject: `Invoice #${o.ref} — friendly reminder`,
    body: `${hi}\n\nFriendly reminder that ${inv}${due} is still open. If it's already in process, thank you — please disregard. If you need another copy, just let me know.\n\n${SIGN}`,
  };
  if (stage === 2) return {
    subject: `Invoice #${o.ref} — past due`,
    body: `${hi}\n\nFollowing up on ${inv}${due}, which is now past due. Could you let me know when payment is scheduled? Happy to resend the invoice or a payment link if that helps.\n\n${SIGN}`,
  };
  return {
    subject: `Invoice #${o.ref} — 30+ days past due`,
    body: `${hi}\n\n${inv.charAt(0).toUpperCase() + inv.slice(1)}${due} is now more than 30 days past due. Please let me know today when we can expect payment, or give me a call at 508-933-2661 if there's an issue with the invoice that I can help sort out.\n\n${SIGN}`,
  };
}

export function reviewRequest(o: { contact?: string | null; job: string; url?: string | null }) {
  return {
    subject: `Thank you — ${o.job}`,
    body: `Hi ${firstName(o.contact)},\n\nThanks again for having us out for ${o.job}. If you were happy with the work, would you mind leaving us a quick Google review? It takes a minute and makes a real difference for a small business like ours.${o.url ? `\n\n${o.url}` : ""}\n\nAnd if anything isn't right, just reply here and I'll take care of it.\n\n${SIGN}`,
  };
}

export const followupStage = (autoKey?: string | null): 1 | 2 | 3 =>
  autoKey === "awaiting:followup3" ? 3 : autoKey === "awaiting:followup2" ? 2 : 1;
export const invoiceStage = (daysOverdue: number): 1 | 2 | 3 | 0 =>
  daysOverdue >= 30 ? 3 : daysOverdue >= 14 ? 2 : daysOverdue >= 7 ? 1 : 0;

export const mailto = (to: string | null | undefined, e: { subject: string; body: string }) =>
  `mailto:${encodeURIComponent(to ?? "")}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}`;

// THM's Invoice #94 is the partner running tab — never chase it like a customer invoice.
export const isThmInvoice = (i: { ref?: string; customer?: string }) =>
  String(i.ref) === "94" || /\bthm\b/i.test(String(i.customer ?? ""));
