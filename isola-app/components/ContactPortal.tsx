"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SiteLineJobBody from "@/components/siteline/JobBody";
import { Shell, Label, Pill, YellowButton, PHONE, TEL, Y, HEAD, midDate, isToday } from "@/components/siteline/ui";

/* /portal/<token> — one private page per contact (v89, 11/18/26).
   Mike's ask: Paulina sees every Hennessy job he does; Mike Nolette sees only Courtyard at
   Metacom. The list comes from public_contact_portal(token) (siteline_contact_portals picks
   the jobs). Tapping a job opens it right here with exactly what its /site page shows
   (public_siteline), and a row of tabs to hop between jobs. ?job=<share token> keeps the
   open job in the address bar so the phone's back button returns to the list. */

type J = { token: string; job_name: string; location?: string; property?: string; phase: string; start_date?: string;
  completed_date?: string; next_day?: string; needs_signature?: boolean; last_update?: string; pending?: boolean };

const short = (j: J) => {
  const p = (j.property ?? "").trim();
  const n = j.job_name.trim();
  if (p && n.toLowerCase().startsWith(p.toLowerCase())) {
    const rest = n.slice(p.length).replace(/^[\s\-–—:·]+/, "").trim();
    if (rest) return rest;
  }
  return n;
};

function line(j: J) {
  if (j.needs_signature) return "Waiting on your signature";
  if (j.pending) return "Pending";
  if (j.phase === "Complete") return j.completed_date ? `Finished ${midDate(j.completed_date)}` : "Finished";
  if (j.phase === "In progress") return j.next_day ? `Next on site: ${isToday(j.next_day) ? "today" : midDate(j.next_day)}` : "Work underway";
  if (j.phase === "Scheduled") return j.start_date ? `Starts ${midDate(j.start_date)}` : "Start date coming soon";
  if (j.phase === "Awaiting approval") return "Proposal sent";
  return "In planning";
}

const readJob = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("job"));

export default function ContactPortal({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, any>>({});
  const [detailErr, setDetailErr] = useState<string | null>(null);

  async function load() {
    setFailed(false);
    setLoading(true);
    const { data, error } = await supabase.rpc("public_contact_portal", { p_token: token });
    if (error) setFailed(true);
    setD(data);
    setLoading(false);
  }
  useEffect(() => { load(); setOpen(readJob()); /* eslint-disable-next-line */ }, [token]);
  useEffect(() => {
    const onPop = () => setOpen(readJob());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const jobs: J[] = d?.jobs ?? [];
  const current = open ? jobs.find((j) => j.token === open) ?? null : null;

  const loadDetail = useCallback(async (t: string) => {
    setDetailErr(null);
    const { data, error } = await supabase.rpc("public_siteline", { p_token: t });
    if (error || !data?.ok) { setDetailErr(error ? "Couldn't load this project. Check your connection and try again." : "This project isn't available right now."); return; }
    setDetails((m) => ({ ...m, [t]: data }));
  }, [supabase]);
  useEffect(() => { if (current && !details[current.token]) loadDetail(current.token); }, [current, details, loadDetail]);

  function go(t: string | null) {
    const url = new URL(window.location.href);
    if (t) url.searchParams.set("job", t); else url.searchParams.delete("job");
    window.history.pushState({}, "", url.toString());
    setOpen(t);
    setDetailErr(null);
    window.scrollTo({ top: 0 });
  }

  if (loading) {
    return (
      <Shell>
        <div className="space-y-3" aria-busy="true">
          <div className="h-7 w-2/3 animate-pulse bg-[#EEE]" />
          <div className="h-20 animate-pulse bg-[#F3F3F3]" />
          <div className="h-20 animate-pulse bg-[#F3F3F3]" />
        </div>
      </Shell>
    );
  }
  if (failed || !d?.ok) {
    return (
      <Shell>
        <h1 className="text-[22px] font-extrabold text-[#111]" style={HEAD}>{failed ? "Couldn't load your projects" : "This link isn't active"}</h1>
        <p className="mt-2 text-[14px] text-[#555]">{failed ? "Check your connection and try again." : `Call Isola at ${PHONE} for a current link.`}</p>
        <div className="mt-5">{failed ? <YellowButton onClick={load}>Try again</YellowButton> : <YellowButton href={`tel:${TEL}`}>Call Isola ↗</YellowButton>}</div>
      </Shell>
    );
  }

  /* one job open: tabs across the top, then that job's SiteLine */
  if (current) {
    const jd = details[current.token];
    return (
      <Shell>
        <button type="button" onClick={() => go(null)} className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#111]">
          ← All projects
        </button>
        {jobs.length > 1 ? (
          <nav aria-label="Your projects" className="-mx-5 mt-3 overflow-x-auto px-5 pb-1">
            <div className="flex w-max gap-2">
              {jobs.map((j) => {
                const on = j.token === current.token;
                return (
                  <button key={j.token} type="button" onClick={() => go(j.token)} aria-current={on ? "page" : undefined}
                    className={`max-w-[220px] truncate whitespace-nowrap px-3 py-2 text-[12px] font-bold ${on ? "bg-[#111] text-white" : "bg-[#F1F1F1] text-[#333]"}`}>
                    {short(j)}
                  </button>
                );
              })}
            </div>
          </nav>
        ) : null}
        <div className="mt-4">
          {jd ? (
            <SiteLineJobBody key={current.token} d={jd} embedded token={current.token} />
          ) : detailErr ? (
            <div>
              <p className="text-[14px] text-[#555]">{detailErr}</p>
              <div className="mt-4"><YellowButton onClick={() => loadDetail(current.token)}>Try again</YellowButton></div>
            </div>
          ) : (
            <div className="space-y-3" aria-busy="true">
              <div className="h-7 w-3/4 animate-pulse bg-[#EEE]" />
              <div className="h-20 animate-pulse bg-[#F3F3F3]" />
              <div className="h-16 animate-pulse bg-[#F3F3F3]" />
            </div>
          )}
        </div>
      </Shell>
    );
  }

  /* the list, grouped by property */
  const groups: { name: string; items: J[] }[] = [];
  for (const j of jobs) {
    const name = (j.property ?? "").trim() || "Other projects";
    let g = groups.find((x) => x.name === name);
    if (!g) { g = { name, items: [] }; groups.push(g); }
    g.items.push(j);
  }
  const grouped = groups.length > 1 || (groups[0] && groups[0].name !== "Other projects");

  return (
    <Shell>
      <Label className="!text-[9px]">Private client page</Label>
      {d.welcome_name ? <div className="mt-4 text-[14px] text-[#666]">Hi {d.welcome_name},</div> : null}
      <h1 className={`${d.welcome_name ? "mt-0.5" : "mt-4"} text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[#111]`} style={HEAD}>{d.title}</h1>
      <p className="mt-1 text-[13px] text-[#666]">Tap a project to see updates, the price and what&apos;s next.</p>

      {jobs.length === 0 ? (
        <p className="mt-4 text-[14px] text-[#555]">No projects to show right now. Call Mike at {PHONE} with any questions.</p>
      ) : null}

      {groups.map((g) => (
        <section key={g.name} className="mt-5">
          {grouped ? <Label className="mb-3 !text-[10px] !text-[#111]">{g.name}</Label> : null}
          {g.items.map((j) => {
            const done = j.phase === "Complete";
            return (
              <button key={j.token} type="button" onClick={() => go(j.token)}
                className="mb-2.5 block w-full px-4 py-3.5 text-left transition-colors hover:bg-[#EEE]"
                style={{ background: j.needs_signature ? "#FFF8D6" : "#F5F5F5", borderLeft: `3px solid ${done ? "#CFCFCF" : Y}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold leading-snug text-[#111]">{grouped ? short(j) : j.job_name}</div>
                    {j.location ? <div className="mt-0.5 truncate text-[13px] text-[#686868]">{j.location}</div> : null}
                  </div>
                  <Pill tone={done || j.pending ? "gray" : "yellow"}>{j.needs_signature ? "Sign" : j.pending ? "Pending" : j.phase}</Pill>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
                  <span className={j.needs_signature ? "font-bold text-[#111]" : "text-[#555]"}>
                    {line(j)}{j.last_update ? <span className="text-[#888]"> · Updated {isToday(j.last_update) ? "today" : midDate(j.last_update)}</span> : null}
                  </span>
                  <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#111]">Open →</span>
                </div>
              </button>
            );
          })}
        </section>
      ))}

      <div className="mt-7">
        <YellowButton href={`tel:${TEL}`}>Contact project lead ↗</YellowButton>
        <a href={`sms:${TEL}`} className="mt-3 block text-center text-[12px] font-bold text-[#555] underline decoration-[#CCC] underline-offset-4">or send a text</a>
      </div>
    </Shell>
  );
}
