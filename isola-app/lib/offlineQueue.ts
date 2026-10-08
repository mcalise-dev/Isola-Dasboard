// Offline write queue for Supabase table writes (v4.9).
//
// lib/supabase/client.ts hands createBrowserClient a custom fetch made by createOfflineFetch().
// PostgREST table writes (POST/PATCH/DELETE to /rest/v1/<table>) made with no signal are stored
// in IndexedDB and answered with a synthetic success Response, then replayed in order once the
// phone is back online. Everything else (reads, /rest/v1/rpc/*, auth, storage, functions) passes
// straight through. On the server the fetch is a plain pass-through.
//
// The top half of this file is pure (no window/IndexedDB) so it can be unit-tested in Node.

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

// Tables whose primary key is a single uuid `id` column (from information_schema, 2026-10-08).
// A queued insert into one of these gets its id generated client-side so the replayed insert
// creates the same row the UI is already holding. Anything not listed never gets an id added
// (app_settings, punch_shares, jobbooks, money_snapshot, … key on other columns).
export const UUID_ID_TABLES = new Set<string>([
  "activities", "callbacks", "campaigns", "change_orders", "communications", "contacts",
  "customer_contacts", "customers", "daily_logs", "documents", "email_drafts", "email_highlights",
  "equipment", "estimate_lines", "estimate_photos", "estimates", "follow_ups", "game_plan_items",
  "game_plans", "job_checklist", "job_costs", "job_photos", "jobs", "mkt_action_proposals",
  "mkt_suppression", "mkt_tasks", "payments", "price_items", "properties", "proposal_links",
  "prospects", "punch_list", "recurring_contracts", "schedule_entries", "scope_templates",
  "service_events", "site_visits", "tasks", "thm_ledger", "time_clock", "vendor_documents",
  "vendors", "workers",
]);

const WRITE_METHODS = new Set(["POST", "PATCH", "DELETE"]);

/** Table name if this is a queueable PostgREST table write, else null. */
export function queueableTable(url: string, method: string, supabaseUrl: string): string | null {
  if (!WRITE_METHODS.has((method || "GET").toUpperCase())) return null;
  const base = supabaseUrl.replace(/\/+$/, "") + "/rest/v1/";
  if (!url.startsWith(base)) return null;
  const rest = url.slice(base.length);
  const m = /^([^/?#]+)(?:[?#]|$)/.exec(rest);
  if (!m) return null;
  const table = decodeURIComponent(m[1]);
  if (table === "rpc" || !table) return null;
  return table;
}

function lowerHeaders(h: Record<string, string>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of Object.keys(h)) o[k.toLowerCase()] = h[k];
  return o;
}

export type Prepared = { url: string; body: string; injectedId: boolean; rows: any };

/**
 * For POST inserts/upserts into uuid-id tables, add `id: crypto.randomUUID()` to rows that
 * have none. Upserts that resolve conflicts on another column (on_conflict=job_id etc.) are left
 * alone — adding an id there would overwrite the existing row's primary key on merge.
 * If supabase-js set a `columns=` list (array inserts), "id" is added to it so PostgREST keeps it.
 */
export function prepareWrite(
  url: string, method: string, table: string, body: string | null | undefined,
  headers: Record<string, string>, uuid: () => string,
): Prepared {
  const text = body ?? "";
  let rows: any = null;
  try { rows = text ? JSON.parse(text) : null; } catch { rows = null; }
  if (method.toUpperCase() !== "POST" || !UUID_ID_TABLES.has(table) || rows === null || typeof rows !== "object") {
    return { url, body: text, injectedId: false, rows };
  }
  const u = new URL(url);
  const onConflict = u.searchParams.get("on_conflict");
  const prefer = (lowerHeaders(headers)["prefer"] ?? "").toLowerCase();
  const isUpsert = prefer.includes("resolution=merge-duplicates") || prefer.includes("resolution=ignore-duplicates");
  if (isUpsert && onConflict && onConflict.replace(/"/g, "").trim() !== "id") {
    return { url, body: text, injectedId: false, rows };
  }
  let injected = false;
  const add = (r: any) => {
    if (r && typeof r === "object" && !Array.isArray(r) && (r.id === undefined || r.id === null)) {
      injected = true;
      return { id: uuid(), ...r };
    }
    return r;
  };
  const out = Array.isArray(rows) ? rows.map(add) : add(rows);
  if (!injected) return { url, body: text, injectedId: false, rows };
  const cols = u.searchParams.get("columns");
  if (cols !== null && !cols.split(",").map((c) => c.replace(/"/g, "").trim()).includes("id")) {
    u.searchParams.set("columns", cols ? `${cols},"id"` : `"id"`);
  }
  return { url: cols !== null ? u.toString() : url, body: JSON.stringify(out), injectedId: true, rows: out };
}

export type SyntheticSpec = { status: number; body: string | null; headers: Record<string, string> };

/** What a successful PostgREST response would have looked like, built from what was sent. */
export function syntheticResponseSpec(method: string, headers: Record<string, string>, rows: any): SyntheticSpec {
  const h = lowerHeaders(headers);
  const m = method.toUpperCase();
  const wantsRep = (h["prefer"] ?? "").toLowerCase().includes("return=representation");
  const wantsObject = (h["accept"] ?? "").toLowerCase().startsWith("application/vnd.pgrst.object+json");
  if (!wantsRep) return { status: m === "POST" ? 201 : 204, body: null, headers: {} };
  let data: any;
  if (m === "DELETE") data = wantsObject ? null : [];
  else {
    const arr = rows == null ? [] : Array.isArray(rows) ? rows : [rows];
    data = wantsObject ? (arr[0] ?? null) : arr;
  }
  return {
    status: m === "POST" ? 201 : 200,
    body: JSON.stringify(data),
    headers: { "content-type": "application/json; charset=utf-8" },
  };
}

/** Headers to store with a queued write — no credentials (fresh ones are added at replay). */
export function storableHeaders(headers: Record<string, string>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const l = k.toLowerCase();
    if (l === "authorization" || l === "apikey") continue;
    o[l] = v;
  }
  return o;
}

/** A thrown fetch error that means "no network" (not an abort, not a code bug elsewhere). */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError;
}

// ---------------------------------------------------------------------------------------------
// Browser side: IndexedDB queue, custom fetch, replay
// ---------------------------------------------------------------------------------------------

export type QueuedWrite = {
  id?: number; url: string; method: string; headers: Record<string, string>; body: string;
  queuedAt: string; table: string; injectedId?: boolean;
};

const DB_NAME = "isola-offline";
const STORE = "writes";
const FAILED = "failed";
const isBrowser = () => typeof window !== "undefined" && typeof indexedDB !== "undefined";

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        if (!d.objectStoreNames.contains(FAILED)) d.createObjectStore(FAILED, { keyPath: "id", autoIncrement: true });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export async function pendingCount(): Promise<number> {
  if (!isBrowser()) return 0;
  try { return await tx<number>(STORE, "readonly", (s) => s.count()); } catch { return 0; }
}

async function firstEntry(): Promise<QueuedWrite | null> {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, "readonly");
    const r = t.objectStore(STORE).openCursor();
    r.onsuccess = () => res(r.result ? (r.result.value as QueuedWrite) : null);
    r.onerror = () => rej(r.error);
  });
}

async function notifyCount() {
  const pending = await pendingCount();
  window.dispatchEvent(new CustomEvent("isola:offline-queue", { detail: { pending } }));
  return pending;
}

async function toast(kind: "ok" | "error", text: string) {
  try {
    const m = await import("@/components/Toaster");
    if (kind === "ok") m.showToast(text); else m.showError(text);
  } catch { /* no toaster available */ }
}

type Config = { supabaseUrl: string; apiKey: string; getAccessToken: () => Promise<string | null | undefined> };
let cfg: Config | null = null;
// the real fetch, captured before anything else can wrap it
const nativeFetch: typeof fetch | null =
  typeof globalThis !== "undefined" && typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;

function headersToRecord(h: HeadersInit | undefined): Record<string, string> {
  const o: Record<string, string> = {};
  if (!h) return o;
  new Headers(h).forEach((v, k) => { o[k] = v; });
  return o;
}

/** fetch for createBrowserClient's `global.fetch`. */
export function createOfflineFetch(c: Config): typeof fetch {
  cfg = c;
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isBrowser()) return fetch(input, init); // server: untouched (Next's own fetch)
    const real = nativeFetch ?? fetch;
    const isReq = typeof Request !== "undefined" && input instanceof Request;
    const url = isReq ? (input as Request).url : String(input);
    const method = (init?.method ?? (isReq ? (input as Request).method : "GET")).toUpperCase();
    const table = queueableTable(url, method, c.supabaseUrl);
    // only plain string bodies (what supabase-js sends) are queueable
    const body = init?.body;
    if (!table || isReq || (body != null && typeof body !== "string")) return real(input, init);

    const headers = headersToRecord(init?.headers);
    const queue = async (): Promise<Response> => {
      const p = prepareWrite(url, method, table, body as string | undefined, headers,
        () => crypto.randomUUID());
      await tx(STORE, "readwrite", (s) => s.add({
        url: p.url, method, headers: storableHeaders(headers), body: p.body,
        queuedAt: new Date().toISOString(), table, injectedId: p.injectedId,
      } as QueuedWrite));
      void notifyCount();
      void toast("ok", "Saved offline — will sync when you have signal");
      const spec = syntheticResponseSpec(method, headers, p.rows);
      return new Response(spec.body, { status: spec.status, headers: spec.headers });
    };

    // Earlier writes still waiting → this one goes behind them so order is kept
    // (e.g. an edit to a row that was itself added offline).
    let mustQueue = navigator.onLine === false;
    if (!mustQueue) {
      try { mustQueue = (await pendingCount()) > 0; } catch { mustQueue = false; }
      if (mustQueue) setTimeout(() => void replayQueue(), 0);
    }
    if (mustQueue) {
      try { return await queue(); } catch { /* IndexedDB unavailable: fall through to a real try */ }
      if (navigator.onLine === false) throw new TypeError("Failed to fetch (offline, and the offline queue is unavailable)");
    }
    try {
      return await real(input, init);
    } catch (e) {
      if (!isNetworkError(e) || init?.signal?.aborted) throw e;
      try { return await queue(); } catch { throw e; }
    }
  };
}

async function recordFailure(w: QueuedWrite, status: number, message: string) {
  try {
    await tx(FAILED, "readwrite", (s) => s.add({ ...w, id: undefined, origId: w.id, status, message, failedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

let draining: Promise<void> | null = null;

/** Replay queued writes in order. Safe to call any time; concurrent calls share one run. */
export function replayQueue(): Promise<void> {
  if (!isBrowser() || !cfg) return Promise.resolve();
  if (draining) return draining;
  const run = async () => {
    const locks = (navigator as any).locks;
    if (locks?.request) await locks.request("isola-offline-replay", { ifAvailable: true }, async (lock: unknown) => { if (lock) await drain(); });
    else await drain();
  };
  draining = run().catch(() => {}).finally(() => { draining = null; });
  return draining;
}

async function drain() {
  const c = cfg!;
  const real = nativeFetch ?? fetch;
  let ok = 0;
  const errors: string[] = [];
  let stalled = false;
  while (navigator.onLine !== false) {
    let w: QueuedWrite | null;
    try { w = await firstEntry(); } catch { stalled = true; break; }
    if (!w) break;
    let token: string | null | undefined = null;
    try { token = await c.getAccessToken(); } catch { token = null; }
    const headers = new Headers(w.headers);
    headers.set("apikey", c.apiKey);
    headers.set("Authorization", `Bearer ${token || c.apiKey}`);
    let res: Response;
    try {
      res = await real(w.url, { method: w.method, headers, body: w.method === "DELETE" && !w.body ? undefined : w.body });
    } catch {
      stalled = true; // still no network — try again later
      break;
    }
    if (res.ok) {
      ok++;
    } else {
      let msg = `HTTP ${res.status}`;
      let code = "";
      try {
        const t = await res.text();
        try { const j = JSON.parse(t); msg = j?.message || msg; code = j?.code || ""; } catch { if (t) msg = t.slice(0, 200); }
      } catch { /* ignore */ }
      // An insert whose id we generated already exists → the first attempt reached the server
      // even though the response was lost. It is saved; not an error.
      if (res.status === 409 && w.injectedId && (code === "23505" || !code)) ok++;
      else if (res.status === 401 && !token) {
        // signed out (or session not restored yet) — keep it and retry later
        stalled = true;
        break;
      } else {
        await recordFailure(w, res.status, msg);
        errors.push(`An offline change couldn't be saved (${w.table}): ${msg}`);
      }
    }
    try { await tx(STORE, "readwrite", (s) => s.delete(w!.id!)); } catch { stalled = true; break; }
    void notifyCount();
  }
  await notifyCount();
  // screens reload; if the run stalled part-way, they still pick up what did land
  if (ok + errors.length > 0) window.dispatchEvent(new Event("isola:changed"));
  if (ok > 0) await toast("ok", `Synced ${ok} offline change${ok > 1 ? "s" : ""}`);
  if (errors.length) await toast("error", errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} more)` : ""));
}

let started = false;
/** Start replay triggers: now (app load), on "online", and every 60s while items are waiting. */
export function startOfflineQueue() {
  if (!isBrowser() || started) return;
  started = true;
  const kick = () => { if (navigator.onLine !== false) void replayQueue(); };
  window.addEventListener("online", kick);
  setInterval(async () => {
    if (navigator.onLine !== false && (await pendingCount()) > 0) void replayQueue();
  }, 60_000);
  setTimeout(() => { void notifyCount(); kick(); }, 0);
}
