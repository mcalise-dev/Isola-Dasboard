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
