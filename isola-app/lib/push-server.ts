// Server-side web push delivery. Pulls queued alerts from the database with the shared
// secret (push_outbox) and sends them to every subscribed device with web-push.
// Runs with the anon key only — the SECURITY DEFINER functions check PUSH_SERVER_SECRET.
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/client";

type Outbox = {
  notifications: { id: string; kind: string; title: string; body: string | null; url: string | null }[];
  subscriptions: { endpoint: string; p256dh: string; auth: string }[];
};
export type FlushResult = { sent: number; dropped: number; notifications: number; skipped?: string };

let warned = false;
let vapidSet = false;

export async function flushPush(): Promise<FlushResult> {
  const secret = process.env.PUSH_SERVER_SECRET;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!secret || !pub || !priv || !subject) {
    if (!warned) {
      warned = true;
      console.warn("[push] not configured: need PUSH_SERVER_SECRET, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT");
    }
    return { sent: 0, dropped: 0, notifications: 0, skipped: "not configured" };
  }
  if (!vapidSet) {
    webpush.setVapidDetails(subject, pub, priv);
    vapidSet = true;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.rpc("push_outbox", { p_secret: secret });
  if (error) {
    console.error("[push] push_outbox failed:", error.message);
    return { sent: 0, dropped: 0, notifications: 0, skipped: "outbox error" };
  }
  const box = (data ?? { notifications: [], subscriptions: [] }) as Outbox;
  const notes = box.notifications ?? [];
  const subs = box.subscriptions ?? [];
  if (!notes.length || !subs.length) return { sent: 0, dropped: 0, notifications: notes.length };

  let sent = 0;
  const dead = new Set<string>();
  await Promise.all(
    subs.map(async (s) => {
      const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      for (const n of notes) {
        if (dead.has(s.endpoint)) return;
        const payload = JSON.stringify({ title: n.title, body: n.body ?? "", url: n.url || "/", tag: n.kind });
        try {
          await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24, urgency: "high" });
          sent++;
        } catch (e: any) {
          const code = e?.statusCode;
          if (code === 404 || code === 410) dead.add(s.endpoint);
          else console.error("[push] send failed:", code ?? "", e?.body ?? e?.message ?? e);
        }
      }
    }),
  );

  for (const endpoint of dead) {
    const { error: dropErr } = await supabase.rpc("push_drop_subscription", { p_secret: secret, p_endpoint: endpoint });
    if (dropErr) console.error("[push] drop failed:", dropErr.message);
  }
  return { sent, dropped: dead.size, notifications: notes.length };
}
