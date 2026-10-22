"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, todayISO } from "@/lib/format";
import { compressImage, openImage } from "@/lib/image";
import { withTimeout, firstError } from "@/lib/load";
import { showError, showToast, undoable } from "@/components/Toaster";
import { ask, copyText } from "@/components/Dialogs";
import Dictate from "@/components/Dictate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Empty, ListSkeleton, LoadError, SectionTitle } from "@/components/ui/bits";
import { Copy, ExternalLink, ImagePlus, Link2, Radio, RefreshCw, Trash2, X } from "lucide-react";
import { stampSafe } from "@/lib/stamp";

/* Isola SiteLine for one job. Mike makes a no-login link (/site/<token>) for the
   property manager and posts plain-language updates. The client page shows the
   proposal/change orders to sign, address, scope, contract price, start date, upcoming
   site days and these updates (v7.0) — never costs, crew pay
   or internal notes. Updates written in the Daily Log's "for the property manager"
   box land here too (marked "From daily log"). */

type Share = { token: string; created_at: string; viewed_at: string | null; last_viewed_at: string | null; view_count: number };
type Update = { id: string; update_date: string; body: string; photo_b64: string | null; daily_log_id: string | null; created_at: string };

const errMsg = (e: any) => (e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
const ago = (iso: string | null) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
};

export default function SiteLinePanel({ jobId }: { jobId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [share, setShare] = useState<Share | null>(null);
  const [rows, setRows] = useState<Update[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ date: todayISO(), body: "", photo: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    try {
      const [s, u] = await withTimeout(Promise.all([
        sb.from("siteline_shares").select("token,created_at,viewed_at,last_viewed_at,view_count").eq("job_id", jobId).maybeSingle(),
        sb.from("siteline_updates").select("id,update_date,body,photo_b64,daily_log_id,created_at").eq("job_id", jobId)
          .order("update_date", { ascending: false }).order("created_at", { ascending: false }),
      ]));
      const e = firstError(s, u);
      if (e) throw new Error(e);
      setShare((s.data as Share) ?? null);
      setRows((u.data as Update[]) ?? []);
    } catch (e: any) { setErr(errMsg(e)); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);

  const url = share && typeof window !== "undefined" ? `${window.location.origin}/site/${share.token}` : "";

  async function makeLink() {
    setBusy(true);
    const { data, error } = await sb.from("siteline_shares").insert({ job_id: jobId })
      .select("token,created_at,viewed_at,last_viewed_at,view_count").single();
    setBusy(false);
    if (error) return showError("Couldn't make the link: " + error.message);
    setShare(data as Share);
    await copyText(`${window.location.origin}/site/${(data as Share).token}`, "SiteLine link copied — send it to the property manager");
  }

  async function newLink() {
    if (!(await ask({ title: "Replace the SiteLine link?", body: "The old link stops working. Anyone who should still see this job needs the new one.", confirm: "Replace link", danger: true }))) return;
    setBusy(true);
    const del = await sb.from("siteline_shares").delete().eq("job_id", jobId);
    if (del.error) { setBusy(false); return showError("Couldn't replace the link: " + del.error.message); }
    setShare(null);
    setBusy(false);
    await makeLink();
  }

  async function turnOff() {
    if (!(await ask({ title: "Turn off SiteLine for this job?", body: "The link stops working. Your updates stay saved, and you can make a new link later.", confirm: "Turn off", danger: true }))) return;
    const { error } = await sb.from("siteline_shares").delete().eq("job_id", jobId);
    if (error) return showError("Couldn't turn it off: " + error.message);
    setShare(null);
    showToast("SiteLine link turned off");
  }

  async function post() {
    if (!form.body.trim()) return showError("Write what got done today.");
    setBusy(true);
    const { error } = await sb.from("siteline_updates").insert({
      job_id: jobId, update_date: form.date || todayISO(), body: form.body.trim(), photo_b64: form.photo || null,
    });
    setBusy(false);
    if (error) return showError("Couldn't post: " + error.message);
    setForm({ date: todayISO(), body: "", photo: "" });
    showToast(share ? "Posted to SiteLine" : "Saved — make a link to share it");
    load();
  }

  function remove(u: Update) {
    const before = rows ?? [];
    undoable({
      text: `Removed the ${fmtDate(u.update_date)} update`,
      hide: () => setRows(before.filter((x) => x.id !== u.id)),
      restore: () => setRows(before),
      commit: () => sb.from("siteline_updates").delete().eq("id", u.id),
    });
  }

  if (err) return <LoadError message={err} onRetry={load} />;
  if (!rows) return <ListSkeleton />;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="space-y-4">
        <SectionTitle>Client link</SectionTitle>
        <Card className="space-y-3 p-4">
          <p className="text-sm text-neutral-400">
            The client sees the proposal to sign, the address, scope, contract price, estimated start, where the job stands, site days and your updates. Never your costs, crew pay or internal notes.
          </p>
          {share ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="success"><Radio size={12} className="mr-1" />Live</Badge>
                {share.view_count ? <Badge>Opened {share.view_count}× · last {ago(share.last_viewed_at)}</Badge> : <Badge variant="muted">Not opened yet</Badge>}
              </div>
              <div className="truncate rounded-lg border border-border bg-neutral-950 px-3 py-2 text-xs text-neutral-300">{url}</div>
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-10" onClick={() => copyText(url, "SiteLine link copied")}><Copy size={14} /> Copy link</Button>
                <Button variant="outline" className="h-10" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Preview</a></Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-9" onClick={newLink} disabled={busy}><RefreshCw size={14} /> New link</Button>
                <Button variant="ghost" size="sm" className="h-9 text-red-300" onClick={turnOff}><X size={14} /> Turn off</Button>
              </div>
            </>
          ) : (
            <Button className="h-11 w-full" onClick={makeLink} disabled={busy}><Link2 size={16} /> Create SiteLine link</Button>
          )}
        </Card>

        <SectionTitle>Post an update</SectionTitle>
        <Card className="space-y-3 p-4">
          <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></Field>
          <Field label="What got done (the client reads this)">
            <div className="space-y-2">
              <Textarea rows={4} placeholder="Chipped out loose mortar along the north side and repointed about 20 feet. Back Thursday to finish." value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
              <Dictate hasText={!!form.body} onText={(t) => setForm((f) => ({ ...f, body: f.body + t }))} />
            </div>
          </Field>
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-neutral-300">
            <ImagePlus size={16} /> {form.photo ? "Photo attached — tap to change" : "Add a photo (optional)"}
            <input type="file" accept="image/*" className="hidden"
              onChange={async (e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) { const p = await stampSafe(await compressImage(f)); setForm((x) => ({ ...x, photo: p })); } }} />
          </label>
          <p className="text-xs text-neutral-500">Dollar amounts are stripped out before the client sees an update.</p>
          <Button className="h-11 w-full" onClick={post} disabled={busy}>{busy ? "Posting…" : "Post update"}</Button>
        </Card>
      </section>

      <section>
        <SectionTitle>Updates ({rows.length})</SectionTitle>
        {rows.length === 0 ? (
          <Empty icon={<Radio size={24} />} title="No updates yet" body="Post what got done each day, or fill in the client line on the Daily Log." />
        ) : (
          <div className="space-y-2">
            {rows.map((u) => (
              <Card key={u.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-white">{fmtDate(u.update_date)}</span>
                      {u.daily_log_id ? <Badge variant="muted">From daily log</Badge> : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{u.body}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Remove update" onClick={() => remove(u)}><Trash2 size={15} /></Button>
                </div>
                {u.photo_b64 ? (
                  <button type="button" className="mt-2" onClick={() => openImage(u.photo_b64!)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.photo_b64} alt="" className="h-20 w-20 rounded-md border border-border object-cover" />
                  </button>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
