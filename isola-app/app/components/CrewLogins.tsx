"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/components/Toaster";
import { KeyRound, UserPlus, Power, Eye } from "lucide-react";

// v4.4: crew app logins, managed from Crew & time. Creating / resetting / turning off a
// login goes through the crew-accounts edge function (owner-only). Crew sign in with just
// the login name, and see only: schedule + job details (no prices), punch list + tasks
// Mike marks for crew, and their own hours.
export default function CrewLogins({ workers }: { workers: any[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [logins, setLogins] = useState<any[]>([]);
  const [status, setStatus] = useState<Record<string, { banned: boolean; last?: string | null }>>({});
  const [form, setForm] = useState<{ mode: "create" | "reset"; worker: any; login?: any } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ username: string; password: string } | null>(null);

  async function call(body: any) {
    const { data, error } = await supabase.functions.invoke("crew-accounts", { body });
    if (error) {
      let msg = error.message;
      try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    return data;
  }

  async function load() {
    const { data } = await supabase.from("app_users").select("user_id,role,worker_id,username,active").eq("role", "crew");
    setLogins(data ?? []);
    const st: Record<string, any> = {};
    await Promise.all((data ?? []).map(async (l: any) => {
      try { const r = await call({ action: "status", user_id: l.user_id }); st[l.user_id] = { banned: r.banned || !l.active, last: r.last_sign_in_at }; } catch {}
    }));
    setStatus(st);
  }
  useEffect(() => { load(); }, []);

  function suggest() {
    const words = ["stone", "brick", "slab", "rebar", "grout", "mortar", "gravel", "trowel", "level", "footing"];
    const w = () => words[Math.floor(Math.random() * words.length)];
    return `${w()}-${w()}-${Math.floor(10 + Math.random() * 89)}`;
  }

  function open(mode: "create" | "reset", worker: any, login?: any) {
    setForm({ mode, worker, login });
    setUsername(login?.username ?? String(worker.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""));
    setPassword(suggest());
    setDone(null);
  }

  async function submit() {
    if (!form) return;
    setBusy(true);
    try {
      if (form.mode === "create") await call({ action: "create", worker_id: form.worker.id, username, password });
      else await call({ action: "reset", user_id: form.login.user_id, password });
      setDone({ username: form.mode === "create" ? username : form.login.username, password });
      load();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  }

  async function toggle(login: any, on: boolean) {
    if (!on && !confirm(`Turn off ${login.username}'s login? They're signed out and can't get back in until you turn it on.`)) return;
    try { await call({ action: on ? "on" : "off", user_id: login.user_id }); showToast(on ? "Login turned on" : "Login turned off"); load(); }
    catch (e: any) { alert(e.message); }
  }

  const crew = workers.filter((w) => !w.is_owner && w.active);
  const inp = "w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 min-h-[44px] text-base focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-neutral-600 px-3 min-h-[36px] text-sm font-semibold text-white";

  return (
    <div className="rounded-xl border border-white/[0.07] bg-neutral-900 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-neutral-300">Crew app logins</div>
        <a href="/field" className="inline-flex items-center gap-1 text-sm text-neutral-300 hover:text-white"><Eye size={15} /> See what crew see</a>
      </div>
      <p className="mt-1 text-sm text-neutral-400">Crew see the schedule, job addresses, scope, photos, the punch list, tasks you mark for crew, and their own hours. They never see prices, money, customers or pay rates.</p>
      <div className="mt-2.5 divide-y divide-neutral-800">
        {crew.map((w) => {
          const l = logins.find((x) => x.worker_id === w.id);
          const st = l ? status[l.user_id] : undefined;
          const off = !!st?.banned || (l && !l.active);
          return (
            <div key={w.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">{w.name}</div>
                <div className="text-xs text-neutral-400">
                  {l ? <>Login: <span className="text-neutral-200 font-semibold">{l.username}</span>{off ? <span className="text-red-300"> · turned off</span> : st?.last ? ` · last in ${new Date(st.last).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : " · never signed in"}</> : "No app login"}
                </div>
              </div>
              {l ? (
                <>
                  <button onClick={() => open("reset", w, l)} className={btn}><KeyRound size={15} /> New password</button>
                  <button onClick={() => toggle(l, !!off)} aria-label={off ? "Turn on" : "Turn off"} className={`${btn} ${off ? "" : "text-red-300 border-red-900"}`}><Power size={15} /> {off ? "On" : "Off"}</button>
                </>
              ) : (
                <button onClick={() => open("create", w)} className={btn}><UserPlus size={15} /> Give login</button>
              )}
            </div>
          );
        })}
      </div>

      {form ? (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-end md:items-center justify-center anim-fade" onClick={() => setForm(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-t-2xl md:rounded-2xl border border-neutral-700 bg-neutral-950 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] anim-sheet">
            {done ? (
              <div className="space-y-3">
                <div className="text-lg font-bold text-white">Send {form.worker.name} this</div>
                <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-200 space-y-1 select-all">
                  <div>Go to: <b>{typeof window !== "undefined" ? window.location.origin : ""}</b></div>
                  <div>Name: <b>{done.username}</b></div>
                  <div>Password: <b>{done.password}</b></div>
                </div>
                <p className="text-sm text-neutral-400">This is the only time the password shows. They sign in with just the name — no email.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={async () => { const t = `Isola crew app: ${window.location.origin}\nName: ${done.username}\nPassword: ${done.password}`; try { await navigator.clipboard.writeText(t); showToast("Copied"); } catch { window.prompt("Copy this:", t); } }} className="rounded-lg bg-white text-neutral-900 min-h-[44px] font-bold">Copy</button>
                  <button onClick={() => setForm(null)} className="rounded-lg border border-neutral-600 min-h-[44px] font-semibold text-white">Done</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-lg font-bold text-white">{form.mode === "create" ? `App login for ${form.worker.name}` : `New password for ${form.worker.name}`}</div>
                <div>
                  <span className="block text-sm font-semibold text-neutral-400 mb-1">Login name</span>
                  <input className={inp} value={username} disabled={form.mode === "reset"} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))} autoCapitalize="none" />
                </div>
                <div>
                  <span className="block text-sm font-semibold text-neutral-400 mb-1">Password</span>
                  <div className="flex gap-2">
                    <input className={inp} value={password} onChange={(e) => setPassword(e.target.value)} autoCapitalize="none" />
                    <button onClick={() => setPassword(suggest())} className="shrink-0 rounded-lg border border-neutral-600 px-3 text-sm font-semibold text-white">New</button>
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">At least 8 characters.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setForm(null)} className="rounded-lg border border-neutral-600 min-h-[44px] font-semibold text-white">Cancel</button>
                  <button onClick={submit} disabled={busy || password.length < 8 || username.length < 2} className="rounded-lg bg-white text-neutral-900 min-h-[44px] font-bold disabled:opacity-50">{busy ? "Saving…" : form.mode === "create" ? "Create login" : "Save password"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
