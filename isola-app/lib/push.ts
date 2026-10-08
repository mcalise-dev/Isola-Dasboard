// Web push for the owner's devices. Contract used by the Settings screen:
//   pushSupported()  -> browser can do web push at all (iOS: only when installed to home screen)
//   pushStatus()     -> "unsupported" | "denied" | "off" | "on"   (for THIS device)
//   enablePush()     -> asks permission, subscribes, saves the subscription
//   disablePush()    -> unsubscribes this device and removes it
//   sendTestPush()   -> queues a test alert and delivers it
// The service worker (/sw.js) is registered by components/OfflineCache.tsx; it shows the alerts.
import { createClient } from "@/lib/supabase/client";

export type PushStatus = "unsupported" | "denied" | "off" | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const IPHONE_MSG =
  "On iPhone, add Isola to your Home Screen first (Share → Add to Home Screen), then turn alerts on from the installed app.";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export function pushSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toB64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// navigator.serviceWorker.ready never settles if the worker failed to register — don't hang the UI.
async function swReady(ms = 8000): Promise<ServiceWorkerRegistration> {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
  if (!reg) throw new Error("The app's background service isn't running yet. Reload the page and try again.");
  return reg;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh || toB64Url(sub.getKey("p256dh"));
  const auth = json.keys?.auth || toB64Url(sub.getKey("auth"));
  if (!p256dh || !auth) throw new Error("This browser returned an incomplete subscription. Try again.");
  const { error } = await createClient()
    .from("push_subscriptions")
    .upsert(
      { endpoint: sub.endpoint, p256dh, auth, user_agent: navigator.userAgent.slice(0, 300) },
      { onConflict: "endpoint" },
    );
  if (error) throw new Error(dbMissing(error) ? DB_NOT_READY : "Couldn't save this device for alerts: " + error.message);
}

// The alerts tables come from migration v49 (supabase/migrations/v49_push_alerts.sql).
// Until it's applied, say so plainly instead of showing a database error.
const DB_NOT_READY = "Alerts aren't switched on in the database yet — one setup step is still waiting for approval.";
function dbMissing(e: { code?: string; message?: string }): boolean {
  return e.code === "42P01" || e.code === "PGRST205" || /push_subscriptions|notifications|does not exist|schema cache/i.test(e.message || "");
}

export async function pushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const sub = await currentSubscription();
    if (!sub || Notification.permission !== "granted") return "off";
    // Keep the server copy in step (e.g. if it was dropped as dead) — quiet, best effort.
    saveSubscription(sub).catch(() => {});
    return "on";
  } catch {
    return "off";
  }
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    if (isIOS() && !isStandalone()) throw new Error(IPHONE_MSG);
    if (!VAPID_PUBLIC_KEY) throw new Error("Alerts aren't set up on the server yet.");
    throw new Error("This browser can't receive alerts. Try Chrome or Safari, or the installed app.");
  }
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm === "denied") {
    throw new Error(
      isIOS()
        ? "Notifications are blocked. Turn them on in iPhone Settings → Notifications → Isola, then try again."
        : "Notifications are blocked for this site. Allow them in your browser's site settings, then try again.",
    );
  }
  if (perm !== "granted") throw new Error("Alerts weren't allowed. Tap the button again and choose Allow.");

  const reg = await swReady();
  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with a different server key can't receive our alerts — replace it.
  if (sub) {
    const existing = sub.options?.applicationServerKey;
    if (existing && toB64Url(existing as ArrayBuffer) !== toB64Url(key.buffer)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    } catch (e: any) {
      if (isIOS() && !isStandalone()) throw new Error(IPHONE_MSG);
      throw new Error("Couldn't turn on alerts for this device" + (e?.message ? ": " + e.message : "."));
    }
  }
  await saveSubscription(sub);
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  const { error } = await createClient().from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw new Error("Alerts are off on this device, but the server copy couldn't be removed: " + error.message);
}

export async function sendTestPush(): Promise<void> {
  const { error } = await createClient().from("notifications").insert({
    kind: "test",
    title: "Test alert",
    body: "Alerts are working on this device.",
    url: "/settings",
    dedupe_key: "test:" + Date.now(),
  });
  if (error) throw new Error(dbMissing(error) ? DB_NOT_READY : "Couldn't queue a test alert: " + error.message);
  let res: Response;
  try {
    res = await fetch("/api/push/flush", { method: "POST" });
  } catch {
    throw new Error("No response from the server — check your signal.");
  }
  if (!res.ok) throw new Error("The server couldn't send the alert. Try again in a minute.");
  const r = (await res.json().catch(() => ({}))) as { sent?: number; skipped?: string };
  if (r.skipped === "not configured") throw new Error("Alerts aren't set up on the server yet.");
  if (!r.sent) throw new Error("Nothing was delivered. Turn alerts off and on again on this device, then retry.");
}
