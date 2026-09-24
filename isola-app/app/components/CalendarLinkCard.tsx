"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "Put it on my phone" (v4.2, 9/22/26): the private subscription link for the .ics feed.
// Scheduled days + open tasks with a due date show up in the phone's own calendar and
// update on their own. Link is private — anyone with it can read the schedule.
const HOST = "isola-dashboard.vercel.app";

export default function CalendarLinkCard() {
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    supabase.from("calendar_feeds").select("token").eq("revoked", false).order("created_at").limit(1)
      .then(({ data }: any) => setToken(data?.[0]?.token ?? null));
    try { setOpen(localStorage.getItem("isola.calcard") !== "0"); } catch { setOpen(true); }
  }, [supabase]);
  if (!token) return null;
  const https = `https://${HOST}/cal/${token}.ics`;
  const webcal = `webcal://${HOST}/cal/${token}.ics`;
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const toggle = () => setOpen((o) => { try { localStorage.setItem("isola.calcard", o ? "0" : "1"); } catch {} return !o; });
  async function copy() {
    try { await navigator.clipboard.writeText(https); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { prompt("Copy this link:", https); }
  }
  return (
    <div className="rounded-xl border border-white/[0.07] bg-neutral-900 mb-3 overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left">
        <span className="text-xs text-neutral-500 w-3">{open ? "▾" : "▸"}</span>
        <span className="text-sm font-semibold text-neutral-300">On my phone's calendar</span>
      </button>
      {open ? (
        <div className="px-3.5 pb-3.5 space-y-2">
          <p className="text-xs text-neutral-400">Everything on this calendar, plus tasks with a due date, shows up in your phone's calendar and keeps itself updated. One tap to add:</p>
          <div className="grid grid-cols-2 gap-2">
            <a href={webcal} className="rounded-lg bg-white text-neutral-900 py-2 text-center text-xs font-bold">iPhone calendar</a>
            <a href={google} target="_blank" rel="noreferrer" className="rounded-lg border border-neutral-600 py-2 text-center text-xs font-bold text-white">Google Calendar</a>
          </div>
          <button onClick={copy} className="w-full rounded-lg border border-neutral-700 py-1.5 text-xs font-semibold text-neutral-300">{copied ? "✓ Link copied" : "Copy the link"}</button>
          <p className="text-xs text-neutral-500">iPhone checks for changes about every 15–30 min (Settings → Calendar → Accounts → Isola Jobs → Fetch). Google Calendar only re-checks a few times a day. Keep this link private — anyone with it can see the schedule.</p>
        </div>
      ) : null}
    </div>
  );
}
