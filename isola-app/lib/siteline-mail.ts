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
