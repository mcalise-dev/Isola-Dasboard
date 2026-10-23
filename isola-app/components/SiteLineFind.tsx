"use client";
import { useState } from "react";
import { Shell, Label, YellowButton, PHONE, TEL, HEAD } from "@/components/siteline/ui";

/* /siteline — Client Login. v7.6 (10/23/26): the client types their email and, if we know it,
   goes straight to their permanent projects page. No email step, no password (Mike's choice). */

export default function SiteLineFind() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "none" | "slow" | "bad" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setState("bad"); return; }
    setState("busy");
    try {
      const r = await fetch("/api/siteline/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }),
      });
      if (r.status === 429) { setState("slow"); return; }
      const j = await r.json().catch(() => ({}));
      if (j?.url) { window.location.href = j.url; return; }
      setState(j?.ok ? "none" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <Shell>
      <Label className="!text-[9px]">Client login</Label>
      <h1 className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[#111]" style={HEAD}>Your projects</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[#555]">
        Enter the email you use with Isola to see every project you have with us. No password needed.
      </p>

      <form onSubmit={submit} className="mt-6">
        <label htmlFor="sl-email"><Label className="mb-2">Email</Label></label>
        <input id="sl-email" type="email" inputMode="email" autoComplete="email" value={email}
          onChange={(e) => { setEmail(e.target.value); if (state !== "busy") setState("idle"); }}
          placeholder="you@company.com"
          className="h-12 w-full border border-[#D2D9DE] bg-white px-3.5 text-[16px] text-[#111] placeholder:text-[#AAA] focus:border-[#111] focus:outline-none" />
        {state === "bad" ? <p className="mt-2 text-[13px] text-[#9A5B00]">That email doesn&apos;t look right.</p> : null}
        {state === "none" ? <p className="mt-2 text-[13px] text-[#9A5B00]">We couldn&apos;t find projects under that email. Try the email we have on file, or call {PHONE}.</p> : null}
        {state === "slow" ? <p className="mt-2 text-[13px] text-[#9A5B00]">Too many tries. Please wait a bit, or call {PHONE}.</p> : null}
        {state === "error" ? <p className="mt-2 text-[13px] text-[#9A5B00]">Something went wrong. Try again, or call {PHONE}.</p> : null}
        <div className="mt-4">
          <YellowButton type="submit" disabled={state === "busy"}>{state === "busy" ? "Opening…" : "See my projects ↗"}</YellowButton>
        </div>
      </form>

      <p className="mt-6 text-center text-[13px] text-[#666]">
        Trouble? Call Mike at <a href={`tel:${TEL}`} className="font-bold text-[#111]">{PHONE}</a>
      </p>
    </Shell>
  );
}
