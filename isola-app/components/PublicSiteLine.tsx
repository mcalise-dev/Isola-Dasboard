"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* Isola SiteLine — the property manager's no-login view of a job (/site/<token>).
   Where the job stands, when the crew is on site next, and plain-language daily
   updates. Everything comes from public_siteline(token), which never returns
   prices, costs, crew pay or internal notes. */

const PHONE = "508-933-2661";
const EMAIL = "mcalise@isola-ri.com";

const parse = (iso: string) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const longDate = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
const shortDate = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
const isToday = (iso: any) => {
  const n = new Date();
  const t = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  return String(iso).slice(0, 10) === t;
};

const PHASES = ["Scheduled", "In progress", "Complete"];

function Photo({ src }: { src: string }) {
  const [big, setBig] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setBig(true)} className="mt-3 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Site photo" className="max-h-56 w-auto rounded-lg border border-neutral-200 object-cover" />
      </button>
      {big ? (
        <div onClick={() => setBig(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Site photo" className="max-h-full max-w-full" />
        </div>
      ) : null}
    </>
  );
}

export default function PublicSiteLine({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  async function load() {
    setFailed(false);
    const { data, error } = await supabase.rpc("public_siteline", { p_token: token });
    if (error) setFailed(true);
    setD(data);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  const updates: any[] = d?.updates ?? [];
  const next: string[] = d?.next_days ?? [];
  const phaseIdx = PHASES.indexOf(d?.phase);

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <div className="bg-neutral-950 px-5 py-5 border-b-4 border-brand">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Isola" className="h-10 w-auto" />
          <div>
            <div className="text-sm font-bold tracking-wide text-white">ISOLA <span className="text-brand">SITELINE</span></div>
            <div className="text-xs text-neutral-400">Project updates from Isola Excavation &amp; Design</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {loading ? <div className="text-sm text-neutral-500">Loading…</div> : failed ? (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="text-lg font-bold">Couldn&apos;t load this project.</div>
            <p className="mt-2 text-sm text-neutral-600">Check your connection and try again.</p>
            <button onClick={load} className="mt-4 rounded-lg bg-neutral-950 px-4 py-2.5 text-sm font-bold text-white">Try again</button>
          </div>
        ) : !d?.ok ? (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="text-lg font-bold">This link isn&apos;t active.</div>
            <p className="mt-2 text-sm text-neutral-600">Ask Isola for a new one at {PHONE}.</p>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="text-lg font-bold">{d.job_name}</div>
              {d.location && d.location !== d.job_name ? <div className="text-sm text-neutral-600">{d.location}</div> : null}
              {d.work_type ? <div className="mt-0.5 text-sm text-neutral-500">{d.work_type}</div> : null}

              {phaseIdx >= 0 ? (
                <div className="mt-5 grid grid-cols-3 gap-1.5">
                  {PHASES.map((p, i) => (
                    <div key={p}>
                      <div className={`h-1.5 rounded-full ${i <= phaseIdx ? "bg-brand" : "bg-neutral-200"}`} />
                      <div className={`mt-1.5 text-xs ${i === phaseIdx ? "font-bold text-neutral-950" : "text-neutral-500"}`}>{p}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{d.phase}</div>
              )}

              <div className="mt-5 grid gap-3 border-t border-neutral-200 pt-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{d.phase === "Complete" ? "Completed" : "Start date"}</div>
                  <div className="mt-0.5 text-[15px] font-semibold">
                    {d.phase === "Complete" && d.completed_date ? longDate(d.completed_date) : d.start_date ? longDate(d.start_date) : "To be scheduled"}
                  </div>
                </div>
                {d.phase !== "Complete" ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Crew on site next</div>
                    <div className="mt-0.5 text-[15px] font-semibold">
                      {next.length ? (isToday(next[0]) ? "Today" : longDate(next[0])) : "Not scheduled yet"}
                    </div>
                    {next.length > 1 ? <div className="text-xs text-neutral-500">Then {next.slice(1).map(shortDate).join(", ")}</div> : null}
                  </div>
                ) : null}
                {d.last_on_site && d.phase !== "Complete" ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Last on site</div>
                    <div className="mt-0.5 text-[15px] font-semibold">{longDate(d.last_on_site)}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="text-sm font-bold">Your project lead</div>
              <div className="mt-1 text-[15px]">Mike Calise, Isola Excavation &amp; Design</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <a href={`tel:${PHONE.replace(/-/g, "")}`} className="rounded-lg bg-brand px-3 py-3 text-center text-sm font-bold text-neutral-950">Call</a>
                <a href={`sms:${PHONE.replace(/-/g, "")}`} className="rounded-lg border border-neutral-300 px-3 py-3 text-center text-sm font-bold">Text</a>
                <a href={`mailto:${EMAIL}?subject=${encodeURIComponent(d.job_name)}`} className="rounded-lg border border-neutral-300 px-3 py-3 text-center text-sm font-bold">Email</a>
              </div>
            </div>

            <div>
              <div className="mb-2 px-1 text-sm font-bold">Daily updates</div>
              {updates.length === 0 ? (
                <div className="rounded-xl bg-white p-5 text-sm text-neutral-600 shadow-sm">Updates will show here once work is underway.</div>
              ) : (
                <div className="space-y-2">
                  {updates.map((u) => (
                    <div key={u.id} className="rounded-xl bg-white p-4 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{longDate(u.date)}</div>
                      <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{u.body}</p>
                      {u.photo ? <Photo src={u.photo} /> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        <div className="pt-2 text-center text-xs text-neutral-500">Done once. Done right. · Isola Excavation &amp; Design · {PHONE}</div>
      </div>
    </div>
  );
}
