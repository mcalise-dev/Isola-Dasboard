"use client";
// v8.8 crew job screen: places that matter for this job (site, dump, material/asphalt pickup).
// Each one: tap Directions to open Google Maps navigation; tap Call if a phone is on file. Supplier numbers only.
import { Navigation, Phone, MapPin, Trash2, Truck, Package, ParkingSquare } from "lucide-react";

export type Place = { id: string; kind: string; label?: string | null; name?: string | null; address: string; phone?: string | null; notes?: string | null };

export const directionsUrl = (a: string) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(a);
export const placeIcon = (k: string) => (k === "site" ? MapPin : k === "disposal" ? Trash2 : k === "parking" ? ParkingSquare : k === "pickup" ? Truck : Package);

export default function PlacesCard({ places }: { places: Place[] }) {
  if (!places?.length) return null;
  return (
    <div className="mt-3 rounded-2xl border border-white/[0.08] bg-neutral-950 p-3.5">
      <div className="mb-2 px-0.5 text-[12px] font-bold uppercase tracking-wide text-neutral-400">Places for this job</div>
      <div className="space-y-2">
        {places.map((p) => {
          const Icon = placeIcon(p.kind);
          return (
            <div key={p.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white"><Icon size={18} /></div>
                <div className="min-w-0 flex-1">
                  {p.label ? <div className="text-[12px] font-bold uppercase tracking-wide text-brand">{p.label}</div> : null}
                  <div className="text-[16px] font-semibold leading-snug text-white">{p.name || p.address}</div>
                  {p.name ? <div className="text-[14px] text-neutral-300">{p.address}</div> : null}
                  {p.notes ? <div className="mt-1 text-[13px] leading-snug text-amber-100/90">{p.notes}</div> : null}
                </div>
              </div>
              <div className="mt-2.5 flex gap-2">
                <a href={directionsUrl(p.address)} target="_blank" rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-neutral-950 min-h-[46px] font-bold"><Navigation size={17} /> Directions</a>
                {p.phone ? (
                  <a href={"tel:" + p.phone.replace(/[^\d+]/g, "")}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.12] px-4 min-h-[46px] font-semibold text-white"><Phone size={16} /> Call</a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
