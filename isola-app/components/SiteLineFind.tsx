"use client";
import { useState } from "react";
import "@fontsource/barlow-condensed/700.css";

/* /siteline — "Find my projects". The client types their email; if we know it, they get one
   link to all of their projects. Same answer either way, so it never reveals who's a client. */

const PHONE = "508-933-2661";
const DISPLAY = { fontFamily: '"Barlow Condensed", var(--font-geist-sans), sans-serif' } as const;

export function SiteLineHeader() {
  return (
    <header className="border-b border-white/[0.06]">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2.5 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Isola" className="h-8 w-8 rounded-full ring-1 ring-white/15" />
        <div className="text-[18px] font-bold tracking-[0.08em] text-white" style={DISPLAY}>ISOLA <span className="text-brand">SITELINE</span></div>
      </div>
    </header>
  );
}

export default function SiteLineFind() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "slow" | "bad">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setState("bad"); return; }
    setState("busy");
    try {
      const r = await fetch("/api/siteline/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }),
      });
      setState(r.status === 429 ? "slow" : "sent");
    } catch {
      setState("sent");
    }
  }

  return (
    <div className="min-h-screen bg-[#050607] text-neutral-100 antialiased">
      <SiteLineHeader />
      <main className="mx-auto max-w-xl px-4 pb-10 pt-8">
        <h1 className="text-[38px] font-bold leading-[1] text-white" style={DISPLAY}>Your projects</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-neutral-300">
          Enter the email you use with Isola. We&apos;ll send you one link to every project you have with us. No password needed.
        </p>

        {state === "sent" ? (
          <div className="mt-6 rounded-2xl border border-brand/40 bg-brand/[0.07] p-5">
            <div className="text-[17px] font-semibold text-white">Check your email</div>
            <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-300">
              If we have projects under <span className="text-white">{email.trim()}</span>, a link is on its way. It can take a minute. Check spam too.
            </p>
            <button onClick={() => { setState("idle"); }} className="mt-4 text-[14px] font-semibold text-brand">Use a different email</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0C0F12] p-5">
            <label htmlFor="sl-email" className="text-[13px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Email</label>
            <input id="sl-email" type="email" inputMode="email" autoComplete="email" value={email}
              onChange={(e) => { setEmail(e.target.value); if (state === "bad" || state === "slow") setState("idle"); }}
              placeholder="you@company.com"
              className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-[16px] text-white placeholder:text-neutral-600 focus:border-brand focus:outline-none" />
            {state === "bad" ? <p className="mt-2 text-sm text-amber-300">That email doesn&apos;t look right.</p> : null}
            {state === "slow" ? <p className="mt-2 text-sm text-amber-300">Too many tries. Please wait a bit, or call {PHONE}.</p> : null}
            <button type="submit" disabled={state === "busy"}
              className="mt-4 h-12 w-full rounded-xl bg-brand text-[15px] font-semibold text-neutral-950 hover:bg-[#E2AE14] disabled:opacity-60">
              {state === "busy" ? "Sending…" : "Email me my link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[14px] text-neutral-400">
          Trouble? Call Mike at <a href={`tel:${PHONE.replace(/-/g, "")}`} className="font-semibold text-white">{PHONE}</a>
        </p>
        <footer className="pt-8 text-center text-[12px] text-neutral-600">Done once. Done right. · Isola</footer>
      </main>
    </div>
  );
}
