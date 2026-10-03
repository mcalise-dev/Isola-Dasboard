"use client";
import { useEffect, useMemo, useState } from "react";
import { Phone, Mail, Link2 as Linkedin, Copy, Pencil, Trash2, Footprints, Users, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STAGES, genDrafts } from "@/lib/crm";
import { todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea, Label } from "@/components/ui/input";
import { KV, Skeleton } from "@/components/ui/bits";
import { showToast, undoable } from "@/components/Toaster";
import { cn } from "@/lib/utils";
import {
  MContact, Campaign, Activity, TOUCHES, stepsOf, nextStep, logTouch, rel, shortDate, dueTone, validEmail, linkedinOf, telOf,
  copyText, SeqBar, changed, TierBadge, channelMatch,
} from "./lib";

const DRAFT_LABELS: Record<string, string> = {
  li_conn: "LinkedIn connection note", li_msg: "LinkedIn message", li_fu1: "LinkedIn follow-up", li_fu2: "LinkedIn close-out",
  em1_subj: "Email subject", em1: "Email #1", em2: "Email follow-up", em3: "Final email",
};
const touchIcon: Record<string, any> = { Call: Phone, Email: Mail, LinkedIn: Linkedin, "Drop-by": Footprints, Meeting: Users };

export default function TargetPeek({ contact, campaigns, onPatch, onEdit, onDeleted }: {
  contact: MContact; campaigns: Campaign[];
  onPatch: (id: string, patch: Partial<MContact>) => void; onEdit: () => void; onDeleted: (c: MContact, restore: boolean) => void;
}) {
  const sb = useMemo(() => createClient(), []);
  const c = contact;
  const [acts, setActs] = useState<Activity[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pickCamp, setPickCamp] = useState("");
  const [showAllDrafts, setShowAllDrafts] = useState(false);
  const camp = campaigns.find((x) => x.id === c.campaign_id) ?? null;
  const steps = stepsOf(camp);
  const ns = nextStep(c, steps);

  useEffect(() => {
    let live = true;
    setActs(null);
    sb.from("activities").select("*").eq("contact_id", c.id).order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => { if (live) setActs((data as Activity[]) ?? []); });
    return () => { live = false; };
  }, [c.id, sb]);

  async function save(patch: Partial<MContact>, msg = "Saved") {
    onPatch(c.id, patch);
    const { error } = await sb.from("contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) { alert("Save failed: " + error.message); return; }
    changed();
    showToast(msg);
  }

  async function touch(type: string) {
    setBusy(type);
    try {
      const patch = await logTouch(sb, c, type, note.trim() || null, camp || c.campaign_id ? steps : null);
      onPatch(c.id, patch);
      setActs((a) => [{ id: "tmp-" + Date.now(), contact_id: c.id, type, note: note.trim() || null, occurred_at: todayISO(), created_at: new Date().toISOString() }, ...(a ?? [])]);
      setNote("");
      showToast(patch.seq_step != null ? `${type} logged · sequence step ${patch.seq_step} done` : `${type} logged`);
    } catch (e: any) { alert("Could not log: " + e.message); }
    setBusy(null);
  }

  async function enroll() {
    if (!pickCamp) return;
    await save({ campaign_id: pickCamp, seq_step: 0, seq_started: todayISO() }, "Added to campaign");
    setPickCamp("");
  }

  function remove() {
    undoable({
      text: `Deleted ${c.name}`,
      hide: () => onDeleted(c, false),
      restore: () => onDeleted(c, true),
      commit: async () => { const { error } = await sb.from("contacts").delete().eq("id", c.id); if (error) throw error; changed(); },
    });
  }

  const tel = telOf(c.phone);
  const li = linkedinOf(c);
  const tone = dueTone(c.next_date);
  const drafts = c.drafts && Object.keys(c.drafts).length ? c.drafts : null;
  const gen = showAllDrafts ? genDrafts(c) : null;
  const draftRows = Object.entries(gen ?? drafts ?? {}).filter(([, v]) => !!v);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 pb-4 pt-5 pr-14">
        <div className="flex items-start gap-3">
          <TierBadge tier={c.tier} className="mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight text-white">{c.name}</h2>
            <p className="truncate text-sm text-neutral-400">{[c.title, c.company].filter(Boolean).join(" · ") || "—"}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{[c.sector, c.prospect_type, c.decision_maker ? "Decision maker" : null].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {tel ? <Button asChild variant="outline" size="sm" className="h-10"><a href={tel}><Phone size={15} />Call</a></Button> : <Button variant="outline" size="sm" className="h-10" disabled><Phone size={15} />Call</Button>}
          {validEmail(c.email) ? <Button asChild variant="outline" size="sm" className="h-10"><a href={`mailto:${c.email}`}><Mail size={15} />Email</a></Button> : <Button variant="outline" size="sm" className="h-10" disabled><Mail size={15} />Email</Button>}
          {li ? <Button asChild variant="outline" size="sm" className="h-10"><a href={li.startsWith("http") ? li : `https://${li}`} target="_blank" rel="noreferrer"><Linkedin size={15} />LinkedIn</a></Button> : <Button variant="outline" size="sm" className="h-10" disabled><Linkedin size={15} />LinkedIn</Button>}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto scroll-thin px-5 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Tier</Label>
            <NativeSelect value={c.tier ?? ""} onChange={(e) => save({ tier: e.target.value, lead_score: e.target.value === "A" ? 3 : e.target.value === "B" ? 2 : 1 })}>
              {["A", "B", "C", "Broker", "Client"].map((t) => <option key={t}>{t}</option>)}
            </NativeSelect>
          </div>
          <div><Label>Stage</Label>
            <NativeSelect value={c.stage} onChange={(e) => save({ stage: e.target.value, ...(e.target.value === "Client" ? { tier: "Client" } : {}) })}>
              {[...STAGES, ...(STAGES.includes(c.stage) ? [] : [c.stage])].map((s) => <option key={s}>{s}</option>)}
            </NativeSelect>
          </div>
          <div className="col-span-2"><Label>Next action</Label>
            <Input key={c.id + "na"} defaultValue={c.next_action ?? ""} placeholder="e.g. Send one-pager"
              onBlur={(e) => { if (e.target.value !== (c.next_action ?? "")) save({ next_action: e.target.value || null }); }} />
          </div>
          <div><Label>Due</Label>
            <Input type="date" value={c.next_date ?? ""} className={cn(tone === "bad" && "border-red-500/50", tone === "warn" && "border-amber-500/50")}
              onChange={(e) => save({ next_date: e.target.value || null })} />
          </div>
          <div><Label>Last touch</Label>
            <div className="flex h-10 items-center text-sm text-neutral-300">{c.last_touch ? `${shortDate(c.last_touch)} · ${rel(c.last_touch)}` : "Never"}</div>
          </div>
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">Log a touch</h3>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note (what happened)" className="mb-2" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {TOUCHES.map((t) => {
              const I = touchIcon[t];
              const isNext = ns && channelMatch(t, ns.step.channel);
              return (
                <Button key={t} variant="outline" size="sm" disabled={!!busy} onClick={() => touch(t)} className={cn("h-11 flex-col gap-0.5 text-xs", isNext && "border-white/40")}>
                  <I size={15} />{busy === t ? "…" : t}
                </Button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl bg-white/[0.04] p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Outreach sequence</h3>
            {camp ? <a href={`/marketing/outreach?camp=${camp.id}`} className="text-xs text-neutral-400 hover:text-white">Open campaign</a> : null}
          </div>
          {camp ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm"><span className="font-medium text-neutral-200">{camp.name}</span><span className="tabular-nums text-neutral-400">{Math.min(c.seq_step ?? 0, steps.length)}/{steps.length}</span></div>
              <SeqBar total={steps.length} done={Math.min(c.seq_step ?? 0, steps.length)} />
              <p className="text-xs text-neutral-400">
                {ns ? <>Next: <span className="text-neutral-200">{ns.step.label}</span> ({ns.step.channel}){ns.due ? <> · <span className={cn(dueTone(ns.due) === "bad" && "text-red-300", dueTone(ns.due) === "warn" && "text-amber-300")}>{rel(ns.due)}</span></> : null}</> : "Sequence finished."}
              </p>
              <button className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline" onClick={() => save({ campaign_id: null, seq_step: 0, seq_started: null }, "Removed from campaign")}>Remove from campaign</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <NativeSelect value={pickCamp} onChange={(e) => setPickCamp(e.target.value)} className="flex-1">
                <option value="">Add to campaign…</option>
                {campaigns.filter((x) => x.status !== "archived").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </NativeSelect>
              <Button variant="outline" disabled={!pickCamp} onClick={enroll}>Add</Button>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold text-white">Contact</h3>
          <div>
            {c.phone ? <KV k="Phone">{tel ? <a href={tel} className="hover:underline">{c.phone}</a> : c.phone}</KV> : null}
            {c.email ? <KV k="Email">{validEmail(c.email) ? <a href={`mailto:${c.email}`} className="break-all hover:underline">{c.email}</a> : <span className="break-all">{c.email}</span>}</KV> : null}
            {li ? <KV k="LinkedIn"><a href={li.startsWith("http") ? li : `https://${li}`} target="_blank" rel="noreferrer" className="break-all hover:underline">Profile</a></KV> : null}
            {c.address ? <KV k="Address">{c.address}</KV> : null}
            {c.buildings ? <KV k="Buildings">{c.buildings}</KV> : null}
            <KV k="LinkedIn status">{c.li_status}</KV>
            <KV k="Email status">{c.em_status}</KV>
            {c.angle ? <KV k="Angle"><span className="font-normal text-neutral-300">{c.angle}</span></KV> : null}
          </div>
        </section>

        <section>
          <Label>Notes</Label>
          <Textarea key={c.id + "notes"} defaultValue={c.notes ?? ""} rows={3} placeholder="Anything worth remembering"
            onBlur={(e) => { if (e.target.value !== (c.notes ?? "")) save({ notes: e.target.value || null }); }} />
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Message drafts</h3>
            <button className="text-xs text-neutral-400 hover:text-white" onClick={() => setShowAllDrafts((v) => !v)}>{showAllDrafts ? "Saved only" : "Generate full set"}</button>
          </div>
          {draftRows.length === 0 ? <p className="text-xs text-neutral-500">No saved drafts. Generate a set built from this contact's company and buildings.</p> : (
            <div className="space-y-2">
              {draftRows.map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border p-2.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-neutral-300">{DRAFT_LABELS[k] ?? k}</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={async () => showToast((await copyText(String(v))) ? "Copied" : "Copy failed")}><Copy size={13} />Copy</Button>
                  </div>
                  <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">{String(v)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">Activity</h3>
          {acts == null ? <div className="space-y-2"><Skeleton /><Skeleton /></div> : acts.length === 0 ? <p className="text-xs text-neutral-500">No touches logged yet.</p> : (
            <ol className="space-y-2.5 border-l border-border pl-4">
              {acts.map((a) => {
                const I = touchIcon[a.type] ?? MessageSquare;
                return (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[23px] top-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-neutral-950 ring-1 ring-white/20"><span className="h-1.5 w-1.5 rounded-full bg-neutral-400" /></span>
                    <div className="flex items-center gap-2 text-sm"><I size={13} className="text-neutral-400" /><span className="font-medium text-neutral-100">{a.type}</span><span className="text-xs text-neutral-500">{shortDate(a.occurred_at)}</span></div>
                    {a.note ? <p className="mt-0.5 text-xs text-neutral-400">{a.note}</p> : null}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={onEdit}><Pencil size={14} />Edit details</Button>
          <Button variant="outline" size="sm" onClick={() => save({ referral_partner: !c.referral_partner }, c.referral_partner ? "Removed as referral partner" : "Marked as referral partner")}>
            {c.referral_partner ? "Referral partner" : "Mark referral partner"}
          </Button>
          {c.referral_partner ? <Badge variant="success" className="self-center">Partner</Badge> : null}
          <Button variant="destructive" size="sm" className="ml-auto" onClick={remove}><Trash2 size={14} />Delete</Button>
        </div>
      </div>
    </div>
  );
}
