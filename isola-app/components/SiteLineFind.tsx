"use client";
import { useState } from "react";
import { Shell, Label, YellowButton, PHONE, TEL, HEAD } from "@/components/siteline/ui";

/* /siteline — "Find my projects". The client types their email; if we know it, they get one
   link to all of their projects. Same answer either way, so it never reveals who's a client.
   v7.5: website SiteLine look. */

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
    <Shell>
      <Label className="!text-[9px]">Client login</Label>
      <h1 className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[#111]" style={HEAD}>Your projects</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[#555]">
        Enter the email you use with Isola. We&apos;ll send you one link to every project you have with us. No password needed.
      </p>

      {state === "sent" ? (
        <div className="mt-6 bg-[#F5F5F5] px-4 py-4" style={{ borderLeft: "3px solid #F2C500" }}>
          <Label className="mb-1.5">✉ Check your email</Label>
          <div className="text-[15px] leading-relaxed text-[#222]">
            If we have projects under <strong>{email.trim()}</strong>, a link is on its way. It can take a minute. Check spam too.
          </div>
          <button onClick={() => setState("idle")} className="mt-3 text-[12px] font-bold text-[#555] underline decoration-[#CCC] underline-offset-4">Use a different email</button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6">
          <label htmlFor="sl-email"><Label className="mb-2">Email</Label></label>
          <input id="sl-email" type="email" inputMode="email" autoComplete="email" value={email}
            onChange={(e) => { setEmail(e.target.value); if (state === "bad" || state === "slow") setState("idle"); }}
            placeholder="you@company.com"
            className="h-12 w-full border border-[#D2D9DE] bg-white px-3.5 text-[16px] text-[#111] placeholder:text-[#AAA] focus:border-[#111] focus:outline-none" />
          {state === "bad" ? <p className="mt-2 text-[13px] text-[#9A5B00]">That email doesn&apos;t look right.</p> : null}
          {state === "slow" ? <p className="mt-2 text-[13px] text-[#9A5B00]">Too many tries. Please wait a bit, or call {PHONE}.</p> : null}
          <div className="mt-4">
            <YellowButton type="submit" disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Email me my link ↗"}</YellowButton>
          </div>
        </form>
      )}

      <p className="mt-6 text-center text-[13px] text-[#666]">
        Trouble? Call Mike at <a href={`tel:${TEL}`} className="font-bold text-[#111]">{PHONE}</a>
      </p>
    </Shell>
  );
}
