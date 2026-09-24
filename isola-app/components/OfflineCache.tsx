"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// Registers the service worker (public/sw.js) that keeps the last copy of every screen
// and every list the app has loaded, so a job site with one bar still shows something.
// Shows a small banner while the phone is offline.
export default function OfflineCache() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const upd = () => setOffline(!navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);
  if (!offline) return null;
  return (
    <div className="fixed top-[calc(env(safe-area-inset-top)+64px)] inset-x-0 z-[55] flex justify-center px-4 pointer-events-none">
      <div className="flex items-center gap-2 rounded-full bg-amber-300 text-neutral-900 px-3.5 py-1.5 text-sm font-semibold shadow-lg">
        <WifiOff size={16} /> No signal — showing the last saved copy. Changes won't save until you're back online.
      </div>
    </div>
  );
}
