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
type Update = { id: string; update_date: string; body: string; photo_b64: string | null; photos: string[] | null; daily_log_id: string | null; created_at: string };
const updPhotos = (u: Update) => (u.photos?.length ? u.photos : u.photo_b64 ? [u.photo_b64] : []);

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
  const [form, setForm] = useState<{ date: string; body: string; photos: string[] }>({ date: todayISO(), body: "", photos: [] });
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    try {
      const [s, u] = await withTimeout(Promise.all([
        sb.from("siteline_shares").select("token,created_at,viewed_at,last_viewed_at,view_count").eq("job_id", jobId).maybeSingle(),
        sb.from("siteline_updates").select("id,update_date,body,photo_b64,photos,daily_log_id,created_at").eq("job_id", jobId)
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
    if (!form.body.trim() && !form.photos.length) return showError("Write what got done today, or add photos.");
    setBusy(true);
    const { error } = await sb.from("siteline_updates").insert({
      job_id: jobId, update_date: form.date || todayISO(), body: form.body.trim(), photo_b64: form.photos[0] ?? null, photos: form.photos,
    });
    setBusy(false);
    if (error) return showError("Couldn't post: " + error.message);
    setForm({ date: todayISO(), body: "", photos: [] });
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

        <WelcomeCard jobId={jobId} />
        <NextPlanCard jobId={jobId} />

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
            <ImagePlus size={16} /> {form.photos.length ? `${form.photos.length} photo${form.photos.length === 1 ? "" : "s"} attached — tap to add more` : "Add photos of the work (optional)"}
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []); e.currentTarget.value = "";
                const ps: string[] = [];
                for (const f of files) ps.push(await stampSafe(await compressImage(f)));
                setForm((x) => ({ ...x, photos: [...x.photos, ...ps].slice(0, 12) }));
              }} />
          </label>
          {form.photos.length ? (
            <div className="flex flex-wrap gap-1.5">
              {form.photos.map((src, i) => (
                <button key={i} type="button" title="Remove photo" onClick={() => setForm((x) => ({ ...x, photos: x.photos.filter((_, k) => k !== i) }))} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
                  <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-neutral-900 text-[10px] text-white">✕</span>
                </button>
              ))}
            </div>
          ) : null}
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
                {updPhotos(u).length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {updPhotos(u).map((src, i) => (
                      <button key={i} type="button" onClick={() => openImage(src)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-20 w-20 rounded-md border border-border object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* v7.1: the top of the client's page — "Welcome, <name>" and an optional photo of the property.
   Kept in siteline_settings so a new or turned-off link never loses them. */
function WelcomeCard({ jobId }: { jobId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [name, setName] = useState("");
  const [fallback, setFallback] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [st, jb] = await Promise.all([
        sb.from("siteline_settings").select("welcome_name,cover_photo_b64").eq("job_id", jobId).maybeSingle(),
        sb.from("jobs").select("contact_name").eq("id", jobId).maybeSingle(),
      ]);
      setName(st.data?.welcome_name ?? "");
      setSaved(st.data?.welcome_name ?? "");
      setPhoto(st.data?.cover_photo_b64 ?? null);
      setFallback(String(jb.data?.contact_name ?? "").trim().split(/\s+/)[0] ?? "");
    })();
  }, [jobId, sb]);

  async function save(patch: Record<string, any>, msg: string) {
    setBusy(true);
    const { error } = await sb.from("siteline_settings").upsert({ job_id: jobId, ...patch, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { showError("Couldn't save: " + error.message); return false; }
    showToast(msg);
    return true;
  }

  async function pick(e: any) {
    const f: File | undefined = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!f) return;
    const p = await compressImage(f, 1400, 0.72);
    if (await save({ cover_photo_b64: p }, "Property photo added")) setPhoto(p);
  }

  const shown = name.trim() || fallback;
  return (
    <>
      <SectionTitle>Welcome &amp; property photo</SectionTitle>
      <Card className="space-y-3 p-4">
        <Field label="Welcome name — the client sees “Welcome, …” at the top">
          <div className="flex gap-2">
            <Input value={name} placeholder={fallback || "e.g. Paulina"} onChange={(e) => setName(e.target.value)} />
            <Button variant="outline" className="h-10 shrink-0" disabled={busy || name.trim() === saved.trim()}
              onClick={async () => { if (await save({ welcome_name: name.trim() || null }, "Welcome name saved")) setSaved(name.trim()); }}>Save</Button>
          </div>
        </Field>
        <p className="text-xs text-neutral-500">{shown ? <>Shows: <span className="text-neutral-300">Welcome, {shown}</span>{!name.trim() ? " (from the job's contact)" : ""}</> : "Leave blank and add a contact name to the job, or type one here."}</p>
        <div>
          <div className="mb-1 text-[13px] font-semibold text-neutral-400">Property photo (optional)</div>
          {photo ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Property" className="h-40 w-full rounded-lg border border-border object-cover" />
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="h-9">
                  <label className="cursor-pointer"><ImagePlus size={14} /> Change<input type="file" accept="image/*" className="hidden" onChange={pick} /></label>
                </Button>
                <Button variant="ghost" size="sm" className="h-9 text-red-300" disabled={busy}
                  onClick={async () => { if (await save({ cover_photo_b64: null }, "Property photo removed")) setPhoto(null); }}><Trash2 size={14} /> Remove</Button>
              </div>
            </div>
          ) : (
            <Button asChild variant="outline" className="h-24 w-full border-dashed">
              <label className="cursor-pointer flex-col"><ImagePlus size={18} /> {busy ? "Saving…" : "Add a photo of the property"}<input type="file" accept="image/*" className="hidden" onChange={pick} /></label>
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}

/* v7.6: "Next plan" — what's coming next, shown at the top of the client's Time & material tab.
   Kept in siteline_settings.next_plan; next_plan_updated_at shows the client how fresh it is. */
function NextPlanCard({ jobId }: { jobId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [plan, setPlan] = useState("");
  const [saved, setSaved] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [tm, setTm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [st, jb] = await Promise.all([
        sb.from("siteline_settings").select("next_plan,next_plan_photos").eq("job_id", jobId).maybeSingle(),
        sb.from("jobs").select("billing_type").eq("id", jobId).maybeSingle(),
      ]);
      setPlan(st.data?.next_plan ?? "");
      setSaved(st.data?.next_plan ?? "");
      setPhotos(Array.isArray(st.data?.next_plan_photos) ? st.data.next_plan_photos : []);
      setTm(jb.data?.billing_type === "tm");
    })();
  }, [jobId, sb]);

  if (!tm) return null;
  async function save(nextPhotos: string[] = photos, msg = "Next plan saved — the client sees it on SiteLine") {
    setBusy(true);
    const v = plan.trim() || null;
    const any = !!v || nextPhotos.length > 0;
    const { error } = await sb.from("siteline_settings").upsert({ job_id: jobId, next_plan: v, next_plan_photos: nextPhotos, next_plan_updated_at: any ? new Date().toISOString() : null, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { showError("Couldn't save: " + error.message); return false; }
    setSaved(plan.trim());
    setPhotos(nextPhotos);
    showToast(msg);
    return true;
  }
  async function addPhotos(e: any) {
    const files: File[] = Array.from(e.target.files ?? []); e.currentTarget.value = "";
    if (!files.length) return;
    const ps: string[] = [];
    for (const f of files) ps.push(await stampSafe(await compressImage(f)));
    await save([...photos, ...ps].slice(0, 8), `${ps.length} photo${ps.length === 1 ? "" : "s"} added to the next plan`);
  }
  return (
    <>
      <SectionTitle>Next plan (time &amp; material)</SectionTitle>
      <Card className="space-y-3 p-4">
        <Field label="What's next — shows on the client's Time & material tab">
          <Textarea rows={3} placeholder="Back Thursday to finish repointing the starter wall, then seal the cap." value={plan} onChange={(e) => setPlan(e.target.value)} />
        </Field>
        <Button variant="outline" className="h-10" disabled={busy || plan.trim() === saved.trim()} onClick={() => save()}>{busy ? "Saving…" : "Save next plan"}</Button>
        <div>
          <div className="mb-1 text-[13px] font-semibold text-neutral-400">Photos of what&apos;s next (optional)</div>
          {photos.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {photos.map((src, i) => (
                <button key={i} type="button" title="Remove photo" disabled={busy} onClick={() => save(photos.filter((_, k) => k !== i), "Photo removed")} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
                  <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-neutral-900 text-[10px] text-white">✕</span>
                </button>
              ))}
            </div>
          ) : null}
          <Button asChild variant="outline" className="h-11 w-full border-dashed">
            <label className="cursor-pointer"><ImagePlus size={16} /> {busy ? "Saving…" : "Add photos of what's next"}<input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} /></label>
          </Button>
        </div>
      </Card>
    </>
  );
}
