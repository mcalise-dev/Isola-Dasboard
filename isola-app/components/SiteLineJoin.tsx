"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Shell, Label, YellowButton, HEAD, PHONE, TEL } from "@/components/siteline/ui";

/* /siteline/join/<invite token> — v8.0 (11/18/26).
   A property manager or on-site contact opens the invite Mike sent, enters name/email/phone once,
   and lands on their portal. What they can see (whole customer, one property, or one job) was set
   when Mike made the invite. Invites are single-use and expire after 7 days. After signing up,
   the person gets back in any time at /siteline with the same email. */

const MSG: Record<string, string> = {
  used: "This invite has already been used. If that was you, sign in with your email below.",
  expired: "This invite has expired. Ask Mike for a new one, or sign in below if you've already joined.",
  not_found: "This invite isn't active. Ask Mike for a new one.",
};

export default function SiteLineJoin({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [inv, setInv] = useState<any>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("public_portal_invite_get", { p_token: token });
      setInv(data ?? { ok: false, error: "not_found" });
      if (data?.invite_name) setName(data.invite_name);
    })();
  }, [supabase, token]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (name.trim().length < 2) return setErr("Please enter your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr("Please enter a valid email.");
    setBusy(true);
    const { data, error } = await supabase.rpc("public_portal_invite_claim", {
      p_token: token, p_name: name.trim(), p_email: email.trim(), p_phone: phone.trim() || null,
    });
    if (error || !data?.ok) {
      setBusy(false);
      return setErr(MSG[data?.error] ?? "Something went wrong. Call Mike at " + PHONE + ".");
    }
    window.location.href = `/siteline/${data.token}`;
  }

  if (!inv) {
    return <Shell><div className="h-40 animate-pulse bg-[#F3F3F3]" aria-busy="true" /></Shell>;
  }
  if (!inv.ok) {
    return (
      <Shell>
        <h1 className="text-[22px] font-extrabold text-[#111]" style={HEAD}>Invite not available</h1>
        <p className="mt-2 text-[14px] text-[#555]">{MSG[inv.error] ?? MSG.not_found}</p>
        <div className="mt-5"><YellowButton href="/siteline">Sign in with my email ↗</YellowButton></div>
        <a href={`tel:${TEL}`} className="mt-3 block text-center text-[12px] font-bold text-[#555] underline underline-offset-4">Call Mike · {PHONE}</a>
      </Shell>
    );
  }

  const input = "mt-1 block h-12 w-full border border-[#D6D6D6] bg-white px-3 text-[16px] text-[#111] outline-none focus:border-[#111]";
  return (
    <Shell tag="INVITE">
      <Label className="!text-[9px]">Private client page</Label>
      <h1 className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[#111]" style={HEAD}>Set up your SiteLine</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[#555]">
        Mike Calise invited you to follow your Isola projects: where each one stands, when the crew is next on site,
        and anything waiting on your signature.
      </p>
      <div className="mt-4 bg-[#F5F5F5] px-4 py-3" style={{ borderLeft: "3px solid #F2C500" }}>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#777]">You'll see</div>
        <div className="mt-0.5 text-[15px] font-bold text-[#111]">{inv.scope}</div>
        <div className="text-[13px] text-[#686868]">{inv.customer}</div>
      </div>
      <form onSubmit={join} className="mt-5 space-y-3.5">
        <label className="block text-[13px] font-bold text-[#111]">Your name
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label className="block text-[13px] font-bold text-[#111]">Email
          <input className={input} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <span className="mt-1 block text-[12px] font-normal text-[#777]">You'll use this email to get back in any time.</span>
        </label>
        <label className="block text-[13px] font-bold text-[#111]">Cell phone <span className="font-normal text-[#777]">(optional)</span>
          <input className={input} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </label>
        {err ? <p className="text-[13px] font-bold text-[#B42318]">{err}</p> : null}
        <button disabled={busy} className="flex h-14 w-full items-center justify-center bg-[#111] text-[13px] font-extrabold uppercase tracking-[0.1em] text-white disabled:opacity-60">
          {busy ? "Setting up…" : "Open my projects →"}
        </button>
      </form>
      <p className="mt-4 text-[12px] leading-relaxed text-[#777]">
        Bookmark the next page or save it to your home screen. Lost it? Go to isola-dashboard.vercel.app/siteline and enter the same email.
      </p>
    </Shell>
  );
}
