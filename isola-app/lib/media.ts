"use client";
// v7.5 media: job photos and cost receipts live in private Storage (buckets "job-photos" and
// "receipts"), copied there by the media-sync edge function. Lists show the small thumbnail
// (thumb_path / receipt_thumb_path); tapping opens the full file (photo_path / receipt_path).
// Every image is shown through a short-lived signed link, never a public URL.
//
// The base64 columns are still written by every upload path (the app, crew RPCs, Claude), so
// nothing upstream changed. A row that hasn't been copied yet (path null, or "unreadable")
// falls back to loading its base64 on its own — one row, only when it's on screen — and the
// sync is nudged so next time it comes from Storage.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Bucket = "job-photos" | "receipts";
const TTL = 60 * 60; // seconds a signed link stays valid
const cache = new Map<string, { url: string; exp: number }>();
const key = (b: Bucket, p: string) => b + "/" + p;

export const isStored = (p?: string | null): p is string => !!p && p !== "unreadable";

/** Signed links for many paths at once (one request), cached until shortly before they expire. */
export async function signedUrls(bucket: Bucket, paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const need: string[] = [];
  for (const p of new Set(paths.filter(isStored))) {
    const hit = cache.get(key(bucket, p));
    if (hit && hit.exp > now) out[p] = hit.url;
    else need.push(p);
  }
  if (need.length) {
    const { data } = await createClient().storage.from(bucket).createSignedUrls(need, TTL);
    for (const d of data ?? []) {
      if (d.signedUrl && d.path) {
        out[d.path] = d.signedUrl;
        cache.set(key(bucket, d.path), { url: d.signedUrl, exp: now + (TTL - 120) * 1000 });
      }
    }
  }
  return out;
}

export async function signedUrl(bucket: Bucket, path: string | null | undefined): Promise<string | null> {
  if (!isStored(path)) return null;
  return (await signedUrls(bucket, [path]))[path] ?? null;
}

/** Hook: signed links for the given paths; re-signs when the set of paths changes. */
export function useSignedUrls(bucket: Bucket, paths: (string | null | undefined)[]) {
  const sig = useMemo(() => paths.filter(isStored).sort().join("|"), [paths]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    if (!sig) { setUrls({}); return; }
    signedUrls(bucket, sig.split("|")).then((u) => { if (live) setUrls(u); }).catch(() => {});
    return () => { live = false; };
  }, [bucket, sig]);
  return urls;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
/** Ask the server to copy any new photos/receipts into Storage. Debounced, fire-and-forget. */
export function kickMediaSync(delayMs = 1500) {
  if (typeof window === "undefined") return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    if (syncing) return;
    syncing = true;
    try {
      // a few rounds: the function copies a handful per call
      for (let i = 0; i < 6; i++) {
        const { data, error } = await createClient().functions.invoke("media-sync", { body: {} });
        if (error || !data) break;
        if (data.photos || data.receipts) window.dispatchEvent(new Event("isola:media-synced"));
        if (!data.photosLeft && !data.receiptsLeft) break;
      }
    } catch { /* offline or not allowed — the next save tries again */ }
    syncing = false;
  }, delayMs);
}

/** Full-size image for one row: Storage when copied, otherwise its base64 straight from the table. */
export async function fullImage(opts: {
  bucket: Bucket; path?: string | null; table: "job_photos" | "job_costs"; id: string; b64Col: "photo_b64" | "receipt_b64";
}): Promise<string | null> {
  const u = await signedUrl(opts.bucket, opts.path);
  if (u) return u;
  const { data } = await createClient().from(opts.table).select(opts.b64Col).eq("id", opts.id).maybeSingle();
  const b64 = (data as any)?.[opts.b64Col] as string | null | undefined;
  if (!b64) return null;
  if (!isStored(opts.path)) kickMediaSync();
  return b64.startsWith("data:") ? b64 : "data:image/jpeg;base64," + b64;
}

/** For rows not yet in Storage: load each one's base64 (only those rows) so the list still shows them. */
export function useFallbackImages(
  rows: { id: string; thumb?: string | null }[] | null,
  table: "job_photos" | "job_costs",
  b64Col: "photo_b64" | "receipt_b64",
) {
  const missing = useMemo(() => (rows ?? []).filter((r) => !isStored(r.thumb)).map((r) => r.id).sort().join(","), [rows]);
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!missing) return;
    let live = true;
    const ids = missing.split(",");
    createClient().from(table).select("id," + b64Col).in("id", ids).then(({ data }) => {
      if (!live) return;
      const m: Record<string, string> = {};
      for (const r of (data ?? []) as any[]) {
        const v = r[b64Col] as string | null;
        if (v) m[r.id] = v.startsWith("data:") ? v : "data:image/jpeg;base64," + v;
      }
      setMap((cur) => ({ ...cur, ...m }));
    });
    kickMediaSync();
    return () => { live = false; };
  }, [missing, table, b64Col]);
  return map;
}
