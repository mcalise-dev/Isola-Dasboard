"use client";
// v8.0 (11/18/26) SiteLine portal access for one customer.
// Mike makes an invite (whole customer, one property, or one job), sends the link himself,
// and the person signs up at /siteline/join/<token>. Invites are single-use and last 7 days.
// Once joined, they get back in at /siteline with their email and see only their scope.
import { useEffect, useState } from "react";
import { Copy, MessageSquare, Mail, Plus, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { showToast, showError } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import { fmtDate } from "@/lib/format";

const APP = "https://isola-dashboard.vercel.app";
export const inviteUrl = (t: string) => `${APP}/siteline/join/${t}`;

function scopeLabel(a: any, props: any[], jobs: any[], customer: string) {
  if (a.job_id) { const j = jobs.find((x) => x.id === a.job_id); return j ? (j.job_name || j.location) : "One job"; }
  if (a.property_id) { const p = props.find((x) => x.id === a.property_id); return p ? (p.label || p.address) : "One property"; }
  return `All ${customer} jobs`;
}

function status(a: any): { text: string; tone: "ok" | "wait" | "off" } {
  if (!a.active) return { text: "Off", tone: "off" };
  if (a.claimed_at) return { text: "Joined", tone: "ok" };
  if (new Date(a.invite_expires_at) < new Date()) return { text: "Invite expired", tone: "off" };
  return { text: "Invite sent", tone: "wait" };
}

export function inviteMessage(a: { invite_name?: string | null; invite_token: string }, scope: string) {
  const hi = a.invite_name ? `Hi ${a.invite_name.split(" ")[0]},` : "Hi,";
  return `${hi} this is Mike Calise with Isola. Here's your private SiteLine page for ${scope}: where each job stands, when we're next on site, and anything waiting on your signature. Tap to set it up (takes a minute, link good for 7 days): ${inviteUrl(a.invite_token)}`;
}

export async function emailInvite(a: any, email: string): Promise<boolean> {
  const to = email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { showError("Enter a valid email."); return false; }
  const ok = await ask({ title: `Email the invite to ${to}?`, body: "Sends the standard SiteLine invite email (with the how-it-works picture) from mcalise@isola-ri.com.", confirm: "Send" });
  if (!ok) return false;
  const r = await fetch("/api/siteline/invite-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: a.id, email: to }) });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) { showError(d.error === "invite_not_open" ? "That invite is used or expired. Make a new link." : "Email didn't send. Copy the link and send it yourself."); return false; }
  showToast(`Invite emailed to ${to}`);
  return true;
}

async function copy(t: string) {
  try { await navigator.clipboard.writeText(t); showToast("Copied"); } catch { showError("Couldn't copy — long-press the link instead."); }
}

export default function PortalAccessCard({ supabase, customer, props, jobs }: { supabase: any; customer: any; props: any[]; jobs: any[] }) {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<any | null>(null);

  async function load() {
    const { data } = await supabase.from("portal_access").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false });
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, [customer.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(a: any) {
    const { error } = await supabase.from("portal_access").update({ active: !a.active }).eq("id", a.id);
    if (error) return showError(error.message);
    showToast(a.active ? "Access turned off" : "Access turned back on");
    load();
  }
  async function renew(a: any) {
    const { data, error } = await supabase.from("portal_access")
      .update({ invite_token: crypto.randomUUID().replace(/-/g, ""), invite_expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), active: true })
      .eq("id", a.id).select().single();
    if (error) return showError(error.message);
    load(); setMade(data);
  }

  const visible = rows.filter((a) => a.active || a.claimed_at);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-[15px]">SiteLine portal</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Invite</Button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {customer.email ? (
          <div className="rounded-lg border border-white/[0.07] px-3 py-2 text-sm">
            <div className="font-semibold text-white">{customer.contact_name || "Main contact"}</div>
            <div className="text-xs text-neutral-400">{customer.email} · All jobs · signs in with this email</div>
          </div>
        ) : null}
        {visible.map((a) => {
          const s = status(a);
          const scope = scopeLabel(a, props, jobs, customer.name);
          return (
            <div key={a.id} className="rounded-lg border border-white/[0.07] px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{a.name || a.invite_name || "Invite"}</div>
                  <div className="truncate text-xs text-neutral-400">{scope}{a.email ? ` · ${a.email}` : ""}</div>
                  <div className="text-xs text-neutral-500">
                    {a.claimed_at ? `Joined ${fmtDate(a.claimed_at.slice(0, 10))}${a.last_login_at ? ` · last in ${fmtDate(a.last_login_at.slice(0, 10))}` : ""}`
                      : `${a.emailed_at ? `Emailed to ${a.invite_email}` : `Made ${fmtDate(a.created_at.slice(0, 10))}`} · good until ${fmtDate(a.invite_expires_at.slice(0, 10))}`}
                  </div>
                </div>
                <Badge variant={s.tone === "ok" ? "success" : s.tone === "wait" ? "warning" : "muted"} className="shrink-0">{s.text}</Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {!a.claimed_at && s.tone === "wait" ? <Button size="sm" variant="outline" onClick={() => setMade(a)}><Link2 size={13} /> Send link</Button> : null}
                {!a.claimed_at && s.tone === "off" ? <Button size="sm" variant="outline" onClick={() => renew(a)}>New link</Button> : null}
                <Button size="sm" variant="ghost" onClick={() => toggle(a)}>{a.active ? "Turn off" : "Turn on"}</Button>
              </div>
            </div>
          );
        })}
        {!customer.email && !visible.length ? <p className="py-2 text-sm text-neutral-500">No one has portal access yet.</p> : null}
      </CardContent>

      <InviteDialog open={open} onOpenChange={setOpen} supabase={supabase} customer={customer} props={props} jobs={jobs}
        onMade={(a) => { setOpen(false); load(); setMade(a); }} />
      <SendDialog a={made} onClose={() => setMade(null)} scope={made ? scopeLabel(made, props, jobs, customer.name) : ""} />
    </Card>
  );
}

function InviteDialog({ open, onOpenChange, supabase, customer, props, jobs, onMade }: {
  open: boolean; onOpenChange: (o: boolean) => void; supabase: any; customer: any; props: any[]; jobs: any[]; onMade: (a: any | null) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [scope, setScope] = useState("all");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(""); setRole(""); setScope("all"); setEmail(""); } }, [open]);
  const liveJobs = jobs.filter((j) => !["lost", "lead"].includes(j.status));
  async function make(send: boolean) {
    if (send && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return showError("Enter their email to send it, or tap Link only.");
    setBusy(true);
    const [kind, id] = scope.split(":");
    const row: any = { customer_id: customer.id, invite_name: name.trim() || null, role: role.trim() || null };
    if (kind === "p") row.property_id = id;
    if (kind === "j") row.job_id = id;
    const { data, error } = await supabase.from("portal_access").insert(row).select().single();
    setBusy(false);
    if (error) return showError("Couldn't make the invite: " + error.message);
    if (send && await emailInvite(data, email)) { onMade(null); return; }
    onMade(data);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite to SiteLine</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Who (optional)"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mike Nolette" /></Field>
            <Field label="Role (optional)"><Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="HOA president" /></Field>
          </div>
          <Field label="Their email (to send it now — optional)"><Input inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></Field>
          <Field label="What they can see">
            <NativeSelect value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">All {customer.name} jobs (incl. future ones)</option>
              {props.length ? <optgroup label="One property (all its jobs, incl. future)">
                {props.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.label || p.address}</option>)}
              </optgroup> : null}
              {liveJobs.length ? <optgroup label="One job only">
                {liveJobs.map((j) => <option key={j.id} value={`j:${j.id}`}>{j.job_name || j.location}</option>)}
              </optgroup> : null}
            </NativeSelect>
          </Field>
          <p className="text-xs text-neutral-500">They'll see status, schedule and anything to sign — never costs or your notes. "Email it" sends the standard invite email with the picture after you confirm; "Link only" gives you the link to text.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => make(false)} disabled={busy}>Link only</Button>
          <Button onClick={() => make(true)} disabled={busy || !email.trim()}>{busy ? "Working…" : "Email it"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendDialog({ a, onClose, scope }: { a: any | null; onClose: () => void; scope: string }) {
  const [email, setEmail] = useState("");
  useEffect(() => { setEmail(a?.invite_email ?? ""); }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return null;
  const url = inviteUrl(a.invite_token);
  const msg = inviteMessage(a, scope);
  return (
    <Dialog open={!!a} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Send {a.invite_name ? `${a.invite_name}'s` : "the"} invite</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="break-all rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-xs text-neutral-300">{url}</div>
          <p className="text-xs text-neutral-500">Opens: {scope}. Works once, good for 7 days.</p>
          <div className="flex gap-2">
            <Input inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" />
            <Button onClick={async () => { if (await emailInvite(a, email)) onClose(); }} disabled={!email.trim()}><Mail size={14} /> Email it</Button>
          </div>
          {a.emailed_at ? <p className="text-xs text-neutral-500">Emailed to {a.invite_email} on {fmtDate(a.emailed_at.slice(0, 10))}</p> : null}
          <p className="text-xs text-neutral-500">Or send it yourself:</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => copy(msg)}><Copy size={14} /> Copy</Button>
            <Button variant="outline" asChild><a href={`sms:?&body=${encodeURIComponent(msg)}`}><MessageSquare size={14} /> Text</a></Button>
            <Button variant="outline" asChild><a href={`mailto:?subject=${encodeURIComponent("Your Isola SiteLine project page")}&body=${encodeURIComponent(msg)}`}><Mail size={14} /> Email</a></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
