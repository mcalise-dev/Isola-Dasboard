// media-sync — copies job photos and cost receipts out of the database (base64 text)
// into private Storage, plus a small thumbnail for lists. Rows keep their base64 for now,
// so every older screen and RPC keeps working; lists read the thumbnail instead.
//
// Safe to call any time, from anyone signed in: it only processes rows that are missing a
// thumbnail, and it never returns file contents. Crew logins are refused.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const THUMB = 360;            // px on the long edge
const BUDGET_MS = 25_000;     // stop well inside the function time limit
const MAX_ITEMS = 4;          // image decoding is memory-heavy; small batches, call again for more
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function decode(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;,]+)?(;base64)?,/.exec(dataUrl);
  const mime = m?.[1] || "image/jpeg";
  const raw = m ? dataUrl.slice(m[0].length) : dataUrl;
  // tolerate older rows saved without padding or with stray characters
  let clean = raw.replace(/[^A-Za-z0-9+/]/g, "");
  clean = clean.slice(0, clean.length - (clean.length % 4 === 1 ? 1 : 0));
  while (clean.length % 4) clean += "=";
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

const ext = (mime: string) => (mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("pdf") ? "pdf" : "jpg");

async function thumbOf(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  if (!mime.startsWith("image/")) return null;
  try {
    const img = await Image.decode(bytes);
    const scale = THUMB / Math.max(img.width, img.height);
    if (scale < 1) img.resize(Math.round(img.width * scale), Math.round(img.height * scale));
    return await img.encodeJPEG(70);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Who is calling? Signed-in office users, or a server job holding the sync secret. Crew never.
  // The secret lives in the database vault (service role only) so a database job can call this.
  const given = req.headers.get("x-sync-secret");
  let bySecret = false;
  if (given) {
    const { data: secret } = await admin.rpc("media_sync_secret");
    bySecret = !!secret && given === secret;
  }
  const auth = req.headers.get("Authorization") ?? "";
  const { data: who } = bySecret ? { data: null } : await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!bySecret && (!who?.user || who.user.app_metadata?.role === "crew")) {
    return new Response(JSON.stringify({ error: "not allowed" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const started = Date.now();
  const done = { photos: 0, receipts: 0, failed: 0 };
  const left = () => Date.now() - started < BUDGET_MS && done.photos + done.receipts + done.failed < MAX_ITEMS;

  // ---- job photos
  while (left()) {
    const { data: rows, error } = await admin.from("job_photos")
      .select("id,job_id,photo_b64").is("thumb_path", null).not("photo_b64", "is", null)
      .order("created_at").limit(1);
    if (error || !rows?.length) break;
    for (const r of rows) {
      try {
        const { bytes, mime } = decode(r.photo_b64);
        const base = `${r.job_id ?? "no-job"}/${r.id}`;
        const full = `${base}.${ext(mime)}`;
        const up = await admin.storage.from("job-photos").upload(full, bytes, { contentType: mime, upsert: true });
        if (up.error) throw up.error;
        const t = await thumbOf(bytes, mime);
        const thumb = t ? `${base}_t.jpg` : full;
        if (t) {
          const ut = await admin.storage.from("job-photos").upload(thumb, t, { contentType: "image/jpeg", upsert: true });
          if (ut.error) throw ut.error;
        }
        const { error: ue } = await admin.from("job_photos").update({ photo_path: full, thumb_path: thumb }).eq("id", r.id);
        if (ue) throw ue;
        done.photos++;
      } catch (e) {
        console.error("photo", r.id, e);
        // mark so one bad image can't block the queue; it still shows from base64
        await admin.from("job_photos").update({ thumb_path: "unreadable" }).eq("id", r.id);
        done.failed++;
      }
    }
  }

  // ---- receipts
  while (left()) {
    const { data: rows, error } = await admin.from("job_costs")
      .select("id,job_id,receipt_b64").is("receipt_thumb_path", null).not("receipt_b64", "is", null)
      .order("created_at").limit(1);
    if (error || !rows?.length) break;
    for (const r of rows) {
      try {
        const { bytes, mime } = decode(r.receipt_b64);
        const base = `${r.job_id ?? "overhead"}/${r.id}`;
        const full = `${base}.${ext(mime)}`;
        const up = await admin.storage.from("receipts").upload(full, bytes, { contentType: mime, upsert: true });
        if (up.error) throw up.error;
        const t = await thumbOf(bytes, mime);
        const thumb = t ? `${base}_t.jpg` : full;
        if (t) {
          const ut = await admin.storage.from("receipts").upload(thumb, t, { contentType: "image/jpeg", upsert: true });
          if (ut.error) throw ut.error;
        }
        const { error: ue } = await admin.from("job_costs").update({ receipt_path: full, receipt_thumb_path: thumb }).eq("id", r.id);
        if (ue) throw ue;
        done.receipts++;
      } catch (e) {
        console.error("receipt", r.id, e);
        await admin.from("job_costs").update({ receipt_thumb_path: "unreadable" }).eq("id", r.id);
        done.failed++;
      }
    }
  }

  const { count: photosLeft } = await admin.from("job_photos").select("id", { count: "exact", head: true }).is("thumb_path", null);
  const { count: receiptsLeft } = await admin.from("job_costs").select("id", { count: "exact", head: true }).is("receipt_thumb_path", null).not("receipt_b64", "is", null);
  return new Response(JSON.stringify({ ...done, photosLeft, receiptsLeft }), { headers: { ...cors, "Content-Type": "application/json" } });
});
