"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* Photos for one proposal or change order, shown right on the SiteLine / portal page (v94, 11/24/26).
   Loaded on their own from public_proposal_photos(token) so the page itself stays light;
   nothing renders when a document has no photos. Tap a photo to see it full screen with its
   caption, then swipe or use the arrows to go through the rest. */

type P = { src: string; caption: string | null };

export default function DocPhotos({ token, dark = false }: { token: string; dark?: boolean }) {
  const [photos, setPhotos] = useState<P[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    createClient()
      .rpc("public_proposal_photos", { p_token: token })
      .then(({ data }) => { if (live && Array.isArray(data)) setPhotos(data as P[]); });
    return () => { live = false; };
  }, [token]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);

  if (!photos.length) return null;
  const go = (step: number) => setOpen((i) => (i === null ? i : (i + step + photos.length) % photos.length));
  const cur = open === null ? null : photos[open];

  return (
    <div className="mt-4">
      <div className={`mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] ${dark ? "text-[#111]" : "text-[#777]"}`}>
        Photos · {photos.length}
      </div>
      <div className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2">
        {photos.map((p, i) => (
          <button key={i} type="button" onClick={() => setOpen(i)}
            className={`w-[150px] shrink-0 snap-start text-left ${dark ? "bg-white/90" : "bg-white"} border border-[#DDD]`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt={p.caption || "Project photo"} loading="lazy" className="h-[150px] w-[150px] object-cover" />
            {p.caption ? (
              <span className="block px-2 py-1.5 text-[11px] font-semibold leading-snug text-[#333] line-clamp-2">{p.caption}</span>
            ) : null}
          </button>
        ))}
      </div>

      {cur ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX === null) return;
            const dx = e.changedTouches[0].clientX - touchX;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            setTouchX(null);
          }}>
          <div className="flex items-center justify-between px-4 py-3 text-[12px] font-bold">
            <span>{(open ?? 0) + 1} of {photos.length}</span>
            <button type="button" onClick={() => setOpen(null)} className="px-2 py-1 text-[13px] font-extrabold uppercase tracking-[0.08em]">Close ✕</button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={() => setOpen(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cur.src} alt={cur.caption || "Project photo"} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
            {photos.length > 1 ? (
              <>
                <button type="button" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); go(-1); }}
                  className="absolute left-1 top-1/2 -translate-y-1/2 px-3 py-4 text-[28px] leading-none opacity-80">‹</button>
                <button type="button" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); go(1); }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-4 text-[28px] leading-none opacity-80">›</button>
              </>
            ) : null}
          </div>
          {cur.caption ? <div className="px-5 pb-6 pt-3 text-center text-[14px] leading-snug">{cur.caption}</div> : <div className="pb-6" />}
        </div>
      ) : null}
    </div>
  );
}
