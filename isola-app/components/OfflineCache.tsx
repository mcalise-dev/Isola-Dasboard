"use client";
import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import "@/lib/supabase/client"; // sets up the offline write queue and its replay triggers
import { pendingCount, startOfflineQueue } from "@/lib/offlineQueue";

// Registers the service worker (public/sw.js) that keeps the last copy of every screen
// and every list the app has loaded, so a job site with one bar still shows something.
// v4.9: changes made with no signal are queued (lib/offlineQueue.ts) and replayed when the
// signal comes back. The banner shows how many are waiting, then "Syncing N…" until drained.
export default function OfflineCache() {
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    startOfflineQueue();
    const upd = () => setOffline(!navigator.onLine);
    const onQueue = (e: Event) => setPending((e as CustomEvent).detail?.pending ?? 0);
    upd();
    pendingCount().then(setPending);
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    window.addEventListener("isola:offline-queue", onQueue);
    return () => {
      window.removeEventListener("online", upd);
      window.removeEventListener("offline", upd);
      window.removeEventListener("isola:offline-queue", onQueue);
    };
  }, []);
  if (!offline && pending === 0) return null;
  const n = `${pending} change${pending === 1 ? "" : "s"}`;
  return (
    <div className="fixed top-[calc(env(safe-area-inset-top)+64px)] inset-x-0 z-[55] flex justify-center px-4 pointer-events-none">
      {offline ? (
        <div role="status" className="flex items-center gap-2 rounded-full bg-amber-300 text-neutral-900 px-3.5 py-1.5 text-sm font-semibold shadow-lg">
          <WifiOff size={16} className="shrink-0" />
          {pending > 0 ? `Offline — ${n} waiting to sync` : "Offline — showing saved data"}
        </div>
      ) : (
        <div role="status" className="flex items-center gap-2 rounded-full bg-white text-neutral-900 px-3.5 py-1.5 text-sm font-semibold shadow-lg">
          <RefreshCw size={16} className="shrink-0 animate-spin" /> Syncing {pending}…
        </div>
      )}
    </div>
  );
}
