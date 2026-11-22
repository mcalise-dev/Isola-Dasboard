// Sends the SiteLine "your projects" link email (v7.4, 10/23/26).
// Uses plain SMTP so it can send from Isola's own Google Workspace mailbox.
// Vercel env: SMTP_USER (e.g. mcalise@isola-ri.com), SMTP_PASS (a Google app password),
// optional SMTP_FROM ("Isola SiteLine <info@isola-ri.com>"), SMTP_HOST, SMTP_PORT.
// If SMTP isn't set up, nothing sends and the caller is told so (it never errors to the client).
import nodemailer from "nodemailer";

const APP = "https://isola-dashboard.vercel.app";

export const smtpReady = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function sendPortalEmail(o: { to: string; token: string; name?: string | null; count: number }) {
  if (!smtpReady()) return { sent: false, reason: "smtp_not_configured" as const };
  const port = Number(process.env.SMTP_PORT || 465);
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const link = `${APP}/siteline/${o.token}`;
  const hi = o.name ? `Hi ${o.name},` : "Hi,";
  const what = o.count === 1 ? "your project" : `your ${o.count} projects`;
  const text =
    `${hi}\n\nHere's your Isola SiteLine page with ${what}:\n${link}\n\n` +
    `Tap a project to see where it stands, when the crew is next on site, and anything waiting on your signature.\n\n` +
    `This link works for 30 days. You can always get a new one at ${APP}/siteline.\n\n` +
    `If you didn't ask for this, you can ignore it.\n\nMike Calise\nIsola\n508-933-2661`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:520px">
<p>${esc(hi)}</p>
<p>Here's your Isola SiteLine page with ${esc(what)}.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#F2C230;color:#111;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:8px;display:inline-block">Open my projects</a></p>
<p>Tap a project to see where it stands, when the crew is next on site, and anything waiting on your signature.</p>
<p style="color:#666;font-size:13px">This link works for 30 days. You can always get a new one at <a href="${APP}/siteline" style="color:#666">${APP.replace("https://", "")}/siteline</a>. If you didn't ask for this, you can ignore it.</p>
<p>Mike Calise<br>Isola<br>508-933-2661</p></div>`;
  await t.sendMail({
    from: process.env.SMTP_FROM || `Isola SiteLine <${process.env.SMTP_USER}>`,
    to: o.to,
    subject: "Your Isola SiteLine link",
    text,
    html,
  });
  return { sent: true as const };
}

// ---- v8.0 (11/18/26): generic SiteLine invite email ----
// One template for every invite. Only the first name, what they'll see, and the link change.
// The how-it-works picture is hosted at /siteline-how-it-works.jpg and embedded inline (cid).
export async function sendInviteEmail(o: { to: string; name?: string | null; scope: string; customer: string; url: string }) {
  if (!smtpReady()) return { sent: false, reason: "smtp_not_configured" as const };
  const port = Number(process.env.SMTP_PORT || 465);
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const first = (o.name ?? "").trim().split(/\s+/)[0];
  const hi = first ? `Hi ${first},` : "Hi,";
  const covers = o.scope.startsWith("All ")
    ? `every ${o.customer} job we have going, plus new ones as they come up`
    : `${o.scope}, including new work there as it comes up`;
  const bullets = [
    "Where each job stands (proposal, scheduled, in progress, complete)",
    "When the crew is next on site",
    "Daily updates from the field",
    "Anything waiting on your signature, which you can review and sign from your phone",
  ];
  const text =
    `${hi}\n\nI set you up with your own Isola SiteLine page so you can check on your projects any time without having to call or email me. It covers ${covers}.\n\n` +
    `On one page you'll see:\n${bullets.map((b) => `- ${b}`).join("\n")}\n\n` +
    `To set it up, open this link and enter your name and email (takes about a minute):\n${o.url}\n\n` +
    `The setup link works once and is good for 7 days. After that, get back in any time at ${APP.replace("https://", "")}/siteline with the same email.\n\n` +
    `If anyone else on your team should have access, let me know and I'll send them their own link.\n\nMike Calise\nIsola\n508-933-2661`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:620px">
<p>${esc(hi)}</p>
<p>I set you up with your own <b>Isola SiteLine</b> page so you can check on your projects any time without having to call or email me. It covers ${esc(covers)}.</p>
<p>On one page you'll see:</p>
<ul style="padding-left:20px;margin:0 0 14px">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
<p>To set it up, tap the button and enter your name and email. It takes about a minute.</p>
<p style="margin:22px 0"><a href="${o.url}" style="background:#F2C500;color:#111;text-decoration:none;font-weight:bold;padding:14px 24px;display:inline-block">Set up my SiteLine &rarr;</a></p>
<p style="color:#666;font-size:13px">The setup link works once and is good for 7 days. After that, get back in any time at <a href="${APP}/siteline" style="color:#666">${APP.replace("https://", "")}/siteline</a> with the same email.</p>
<p><b>Here's what it looks like:</b></p>
<p><img src="cid:howitworks" alt="How Isola SiteLine works: set up with your link, see all your projects, tap a project for schedule and updates" style="width:100%;max-width:620px;height:auto;border:0"></p>
<p>If anyone else on your team should have access, let me know and I'll send them their own link.</p>
<p>Mike Calise<br>Isola<br>508-933-2661</p></div>`;
  await t.sendMail({
    from: process.env.SMTP_FROM || `Isola SiteLine <${process.env.SMTP_USER}>`,
    replyTo: process.env.SMTP_USER,
    to: o.to,
    subject: "Your Isola SiteLine project page",
    text,
    html,
    attachments: [{ filename: "siteline-how-it-works.jpg", path: `${APP}/siteline-how-it-works.jpg`, cid: "howitworks" }],
  });
  return { sent: true as const };
}

// ---- v9.3 (11/22/26): "your project page was updated" email, sent by the 6 PM run ----
// One email per portal contact, only for portals whose jobs got an update that day.
// The update's own text is in the email (dollar amounts already stripped by the database),
// with a button to open the portal for photos and details. Company voice, signed Isola.
export type MailUpdate = { date: string; body: string | null; photos: number };
export type MailJob = { share_token: string; job_name: string; location: string | null; updates: MailUpdate[] };
export type MailPortal = { portal_id: string; token: string; welcome_name: string | null; emails: string[]; jobs: MailJob[] };

const PORTAL_BASE = (process.env.PORTAL_BASE_URL || "https://app.isola-ri.com").replace(/\/$/, "");

function transport() {
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const longDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
};
const paras = (s: string | null) => (s ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export function portalUpdateEmail(p: MailPortal, o: { test?: boolean } = {}) {
  const hi = p.welcome_name ? `Hi ${p.welcome_name},` : "Hello,";
  const one = p.jobs.length === 1 ? p.jobs[0] : null;
  const subject = (o.test ? "[Test] " : "") + (one ? `Project update: ${one.job_name}` : "Project updates from Isola");
  const lead = one
    ? `We posted today's update for ${one.job_name}.`
    : `We posted today's updates for ${p.jobs.length} of your projects.`;
  const link = (j: MailJob) => `${PORTAL_BASE}/portal/${p.token}?job=${j.share_token}`;
  const photoCount = (j: MailJob) => j.updates.reduce((n, u) => n + (u.photos || 0), 0);
  const cta = (j: MailJob) => { const n = photoCount(j); return n ? `See the ${n} photo${n === 1 ? "" : "s"} and details` : "See the full project page"; };

  const text =
    `${hi}\n\n${lead}\n\n` +
    p.jobs.map((j) =>
      `${j.job_name.toUpperCase()}\n` +
      j.updates.map((u) => `${longDate(u.date)}\n\n${paras(u.body).join("\n\n")}`).join("\n\n") +
      `\n\n${cta(j)}: ${link(j)}`).join("\n\n----\n\n") +
    `\n\nIf you have any questions, reply to this email or call us at 508-933-2661.\n\nIsola\n508-933-2661`;

  const F = "font-family:Arial,Helvetica,sans-serif";
  const html = `<div style="background:#F1F1F1;padding:24px 12px;${F}">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">
  <div style="padding:20px 24px 4px;font-size:20px;font-weight:800;letter-spacing:0.04em;color:#111">ISOLA <span style="letter-spacing:-0.02em">Site<span style="color:#B08D00">Line</span></span></div>
  <div style="padding:8px 24px 4px;font-size:15px;line-height:1.55;color:#171717">
    <p style="margin:12px 0 4px">${esc(hi)}</p>
    <p style="margin:0 0 8px">${esc(lead)}</p>
  </div>
  ${p.jobs.map((j) => `
  <div style="margin:12px 24px 20px;border-top:2px solid #111;padding-top:14px">
    <div style="font-size:18px;font-weight:800;color:#111;line-height:1.3">${esc(j.job_name)}</div>
    ${j.updates.map((u) => `
    <div style="margin-top:12px;font-size:12px;font-weight:700;letter-spacing:0.02em;color:#B08D00">${esc(longDate(u.date))}</div>
    ${paras(u.body).map((t) => `<p style="margin:6px 0 12px;font-size:15px;line-height:1.6;color:#222">${esc(t)}</p>`).join("")}`).join("")}
    <p style="margin:18px 0 0"><a href="${link(j)}" style="background:#F2C500;color:#111;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 22px;display:inline-block">${esc(cta(j))} &rarr;</a></p>
  </div>`).join("")}
  <div style="padding:8px 24px 24px;font-size:13px;line-height:1.55;color:#666">
    <p style="margin:0 0 10px">If you have any questions, reply to this email or call us at <a href="tel:5089332661" style="color:#666">508-933-2661</a>.</p>
    <p style="margin:0;color:#111;font-weight:bold">Isola</p>
    <p style="margin:0">Concrete, masonry, drainage and sitework &middot; Rhode Island and southeastern Massachusetts</p>
  </div>
</div></div>`;
  return { subject, text, html };
}

export async function sendPortalUpdateEmail(to: string, p: MailPortal, o: { test?: boolean } = {}) {
  if (!smtpReady()) return { sent: false, reason: "smtp_not_configured" as const };
  const m = portalUpdateEmail(p, o);
  await transport().sendMail({
    from: process.env.SMTP_FROM || `Isola SiteLine <${process.env.SMTP_USER}>`,
    replyTo: process.env.SMTP_USER,
    to,
    subject: m.subject,
    text: m.text,
    html: m.html,
  });
  return { sent: true as const };
}
