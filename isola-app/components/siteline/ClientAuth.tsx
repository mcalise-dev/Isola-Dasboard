"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Shell, Label, YellowButton, PHONE, TEL, HEAD } from "@/components/siteline/ui";

/* v91 (11/20/26): SiteLine client accounts. Email + password on Supabase Auth.
   - /siteline            sign in (email + password)
   - /siteline/register   create an account; only emails Mike put on a client portal are accepted
                          (client_signup_gate in the database), and the email must be confirmed
   - /siteline/forgot     email a reset link
   - /siteline/reset      set a new password after the reset link
   - /siteline/account    signed in: go to the client's portal (client_portal_token)
   Private links (/portal/<token>, /site/<token>) keep working with no login. */

const input =
  "h-12 w-full border border-[#D2D9DE] bg-white px-3.5 text-[16px] text-[#111] placeholder:text-[#AAA] focus:border-[#111] focus:outline-none";
const okEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());
const Note = ({ children }: { children: React.ReactNode }) => <p className="mt-2 text-[13px] text-[#9A5B00]">{children}</p>;
const Help = () => (
  <p className="mt-6 text-center text-[13px] text-[#666]">
    Trouble? Call Mike at <a href={`tel:${TEL}`} className="font-bold text-[#111]">{PHONE}</a>
  </p>
);
const origin = () => (typeof window === "undefined" ? "" : window.location.origin);

function Field({ id, label, ...rest }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="mt-4 first:mt-0">
      <label htmlFor={id}><Label className="mb-2">{label}</Label></label>
      <input id={id} className={input} {...rest} />
    </div>
  );
}

export function ClientSignIn() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!okEmail(email)) return setErr("That email doesn't look right.");
    if (!pw) return setErr("Enter your password.");
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) {
      setBusy(false);
      return setErr(/confirm/i.test(error.message) ? "Confirm your email first: open the link we sent when you signed up." : "That email and password don't match. Try again or reset your password.");
    }
    const role = data.user?.app_metadata?.role;
    window.location.href = role === "client" ? "/siteline/account" : role === "crew" ? "/field" : "/home";
  }

  return (
    <Shell>
      <Label className="!text-[9px]">Client login</Label>
      <h1 className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[#111]" style={HEAD}>Your projects</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[#555]">Sign in with the email you use with Isola.</p>
      <form onSubmit={submit} className="mt-6">
        <Field id="sl-email" label="Email" type="email" inputMode="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        <Field id="sl-pw" label="Password" type="password" autoComplete="current-password" value={pw}
          onChange={(e) => setPw(e.target.value)} />
        {err ? <Note>{err}</Note> : null}
        <div className="mt-5"><YellowButton type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in ↗"}</YellowButton></div>
      </form>
      <div className="mt-5 flex justify-between text-[13px] font-bold text-[#111]">
        <a href="/siteline/forgot" className="underline underline-offset-4">Forgot password?</a>
        <a href="/siteline/register" className="underline underline-offset-4">First time? Create account</a>
      </div>
      <Help />
    </Shell>
  );
}

export function ClientRegister() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!okEmail(email)) return setErr("That email doesn't look right.");
    if (pw.length < 8) return setErr("Use at least 8 characters for your password.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password: pw,
      options: { emailRedirectTo: `${origin()}/siteline/confirm?next=/siteline/account` },
    });
    setBusy(false);
    if (error) {
      // the database refuses emails that aren't on a client portal (client_signup_gate)
      return setErr(/database|not_a_client/i.test(error.message)
        ? `We don't have that email on a client account yet. Use the email Isola has on file, or call ${PHONE}.`
        : /registered|exists/i.test(error.message) ? "That email already has an account. Sign in, or reset your password."
        : "Something went wrong. Try again in a minute.");
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Shell>
        <Label className="!text-[9px]">Almost done</Label>
        <h1 className="mt-4 text-[24px] font-extrabold text-[#111]" style={HEAD}>Check your email</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#555]">We sent a link to {email.trim()}. Open it to confirm your email, and you&apos;re in.</p>
        <Help />
      </Shell>
    );
  }
  return (
    <Shell>
      <Label className="!text-[9px]">Client login</Label>
      <h1 className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[#111]" style={HEAD}>Create your account</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[#555]">Use the email Isola has on file for you, and pick a password.</p>
      <form onSubmit={submit} className="mt-6">
        <Field id="rg-email" label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        <Field id="rg-pw" label="Password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
        <Field id="rg-pw2" label="Password again" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {err ? <Note>{err}</Note> : null}
        <div className="mt-5"><YellowButton type="submit" disabled={busy}>{busy ? "Creating…" : "Create account ↗"}</YellowButton></div>
      </form>
      <p className="mt-5 text-center text-[13px] text-[#555]">Already have an account? <a href="/siteline" className="font-bold text-[#111] underline underline-offset-4">Sign in</a></p>
      <Help />
    </Shell>
  );
}

export function ClientForgot() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!okEmail(email)) return setErr("That email doesn't look right.");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin()}/siteline/confirm?next=/siteline/reset` });
    setBusy(false);
    if (error && /rate|seconds/i.test(error.message)) return setErr("Too many tries. Wait a minute and try again.");
    setSent(true); // same answer whether or not the email has an account
  }

  return (
    <Shell>
      <Label className="!text-[9px]">Client login</Label>
      <h1 className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[#111]" style={HEAD}>Reset your password</h1>
      {sent ? (
        <p className="mt-2 text-[14px] leading-relaxed text-[#555]">If {email.trim()} has an account, a reset link is on its way. Open it on this phone or computer to set a new password.</p>
      ) : (
        <form onSubmit={submit} className="mt-6">
          <Field id="fg-email" label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          {err ? <Note>{err}</Note> : null}
          <div className="mt-5"><YellowButton type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a reset link"}</YellowButton></div>
        </form>
      )}
      <p className="mt-5 text-center text-[13px]"><a href="/siteline" className="font-bold text-[#111] underline underline-offset-4">Back to sign in</a></p>
      <Help />
    </Shell>
  );
}

export function ClientReset() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setReady(!!data.user)); }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (pw.length < 8) return setErr("Use at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(/same|different/i.test(error.message) ? "Pick a password you haven't used here before." : "Couldn't save it. Ask for a new reset link and try again.");
    window.location.href = "/siteline/account";
  }

  if (ready === null) return <Shell><div className="h-40 animate-pulse bg-[#F3F3F3]" aria-busy="true" /></Shell>;
  if (!ready) {
    return (
      <Shell>
        <h1 className="text-[22px] font-extrabold text-[#111]" style={HEAD}>This reset link has expired</h1>
        <p className="mt-2 text-[14px] text-[#555]">Reset links work once and for a short time. Ask for a new one.</p>
        <div className="mt-5"><YellowButton href="/siteline/forgot">Send a new link</YellowButton></div>
        <Help />
      </Shell>
    );
  }
  return (
    <Shell>
      <Label className="!text-[9px]">Client login</Label>
      <h1 className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[#111]" style={HEAD}>Set a new password</h1>
      <form onSubmit={submit} className="mt-6">
        <Field id="rs-pw" label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
        <Field id="rs-pw2" label="New password again" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {err ? <Note>{err}</Note> : null}
        <div className="mt-5"><YellowButton type="submit" disabled={busy}>{busy ? "Saving…" : "Save and sign in"}</YellowButton></div>
      </form>
      <Help />
    </Shell>
  );
}

export function ClientAccount() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<"loading" | "no_portal" | "unconfirmed" | "error">("loading");
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { window.location.href = "/siteline"; return; }
      const { data, error } = await supabase.rpc("client_portal_token");
      if (data?.ok && data.token) { window.location.replace(`/portal/${data.token}`); return; }
      setState(error ? "error" : data?.error === "unconfirmed" ? "unconfirmed" : data?.error === "no_portal" ? "no_portal" : "error");
    })();
  }, [supabase]);

  async function signOut() { await supabase.auth.signOut(); window.location.href = "/siteline"; }

  if (state === "loading") return <Shell><div className="h-40 animate-pulse bg-[#F3F3F3]" aria-busy="true" /></Shell>;
  return (
    <Shell>
      <h1 className="text-[22px] font-extrabold text-[#111]" style={HEAD}>
        {state === "no_portal" ? "You're signed in" : state === "unconfirmed" ? "Confirm your email" : "Couldn't open your projects"}
      </h1>
      <p className="mt-2 text-[14px] text-[#555]">
        {state === "no_portal" ? "Your projects aren't linked to this email yet. Mike will set them up, or call him to get it done now."
          : state === "unconfirmed" ? "Open the link we emailed you when you signed up, then come back."
          : "Try again in a minute."}
      </p>
      <div className="mt-5"><YellowButton href={`tel:${TEL}`}>Call Mike · {PHONE}</YellowButton></div>
      <button type="button" onClick={signOut} className="mt-4 block w-full text-center text-[13px] font-bold text-[#555] underline underline-offset-4">Sign out</button>
    </Shell>
  );
}
