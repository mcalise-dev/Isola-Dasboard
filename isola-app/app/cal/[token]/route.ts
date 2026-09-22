import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/client";

// Private calendar feed (v4.2, 9/22/26). Subscribe to
//   webcal://isola-dashboard.vercel.app/cal/<token>.ics
// from iPhone (Settings → Calendar → Accounts → Add Subscribed Calendar) or
// Google Calendar (Other calendars → From URL, with https://). Read-only.
// Scheduled days are all-day events; open tasks with a due date are all-day
// "✅" events (overdue ones sit on today). Token is checked in the database
// by public_calendar_feed(); a bad or revoked token gets a 404.
export const dynamic = "force-dynamic";

const APP = "https://isola-dashboard.vercel.app";
const esc = (s: unknown) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
const nextDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
};
// RFC 5545: fold lines longer than 75 octets
const fold = (line: string) => {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) { out.push(cur); cur = " " + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
};

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_calendar_feed`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token }),
    cache: "no-store",
  });
  const data = r.ok ? await r.json() : null;
  if (!data) return new Response("Not found", { status: 404 });

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Isola LLC//Isola On The Go//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Isola Jobs", "X-WR-TIMEZONE:America/New_York",
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M", "X-PUBLISHED-TTL:PT30M",
  ];

  for (const e of data.entries ?? []) {
    const who = e.assignee ? ` · ${e.assignee}` : "";
    const desc = [
      e.customer && e.customer !== e.title ? e.customer : null,
      e.work,
      e.contact || e.phone ? `Contact: ${[e.contact, e.phone].filter(Boolean).join(" ")}` : null,
      e.notes,
      e.job_id ? `${APP}/?job=${e.job_id}` : `${APP}/schedule`,
    ].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:sched-${e.id}@isola`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${esc((e.job_id ? "🔨 " : "") + e.title + who)}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      `DESCRIPTION:${esc(desc)}`, "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  for (const t of data.tasks ?? []) {
    const desc = [t.job, t.late ? "Overdue" : null, t.job_id ? `${APP}/?job=${t.job_id}` : `${APP}/tasks`].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:task-${t.id}@isola`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(t.date)}`, `DTEND;VALUE=DATE:${nextDay(t.date)}`,
      `SUMMARY:${esc(`✅ ${t.late ? "LATE: " : ""}${t.title}${t.job ? " — " + t.job : ""}`)}`,
      ...(t.location ? [`LOCATION:${esc(t.location)}`] : []),
      `DESCRIPTION:${esc(desc)}`, "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="isola-jobs.ics"',
      "Cache-Control": "no-store",
    },
  });
}
