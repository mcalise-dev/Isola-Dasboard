/* Shared look for every client-facing SiteLine screen (v7.5, 10/23/26).
   Matches the SiteLine example screen on isola-ri.com: white card on light gray, Manrope
   headings, DM Sans text, black / white / gray / Isola yellow only. */
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";

export const PHONE = "508-933-2661";
export const TEL = PHONE.replace(/-/g, "");
export const Y = "#F2C500";      // Isola yellow (website)
export const YD = "#B08D00";     // darker yellow for small text on white
export const HEAD = { fontFamily: "Manrope, var(--font-geist-sans), Arial, sans-serif" } as const;
const BODY = { fontFamily: '"DM Sans", var(--font-geist-sans), Arial, sans-serif' } as const;

export function Shell({ children, tag }: { children: React.ReactNode; tag?: string }) {
  return (
    <div className="min-h-screen bg-[#F1F1F1] text-[#171717] antialiased" style={{ ...BODY, colorScheme: "light" }}>
      <div className="mx-auto max-w-[520px] px-3 py-4 sm:py-8">
        <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_18px_40px_rgba(0,0,0,0.08)]">
          <header className="flex items-center justify-between gap-3 px-5 pb-1 pt-5">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="h-8 w-8 rounded-full bg-black object-cover" />
              <div className="text-[20px] font-extrabold tracking-[0.04em] text-[#111]" style={HEAD}>
                ISOLA <span className="ml-0.5 text-[18px] tracking-[-0.03em]">Site<span style={{ color: YD }}>Line</span></span>
              </div>
            </div>
            {tag ? <span className="px-2 py-1.5 text-[10px] font-black tracking-[0.08em] text-[#111]" style={{ background: Y }}>{tag}</span> : null}
          </header>
          <main className="px-5 pb-6 pt-3">{children}</main>
        </div>
        <footer className="px-2 pb-4 pt-5 text-center text-[12px] text-[#777]">
          Done once. Done right. · Isola · <a href={`tel:${TEL}`} className="text-[#555]">{PHONE}</a>
        </footer>
      </div>
    </div>
  );
}

export const Label = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#777] ${className}`}>{children}</div>
);

export function Pill({ children, tone = "yellow" }: { children: React.ReactNode; tone?: "yellow" | "done" | "gray" }) {
  const s = tone === "done" ? "bg-[#111] text-white" : tone === "gray" ? "bg-[#E2E2E2] text-[#555]" : "text-[#111]";
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.07em] ${s}`} style={tone === "yellow" ? { background: Y } : undefined}>
      {children}
    </span>
  );
}

/** the website's numbered step track */
export function PhaseTrack({ steps, current, complete }: { steps: string[]; current: number; complete?: boolean }) {
  return (
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }} aria-label="Where your project stands">
      {steps.map((s, i) => {
        const done = i < current || (complete && i === current);
        const now = i === current && !complete;
        const lit = done || now;
        return (
          <li key={s} className="relative flex min-w-0 flex-col items-center gap-2 text-center">
            <span aria-hidden className="absolute top-[13px] h-[3px]"
              style={{ left: i === 0 ? "50%" : 0, right: i === steps.length - 1 ? "50%" : 0, background: lit ? Y : "#D6D6D6" }} />
            <span className={`relative z-[1] grid h-[29px] w-[29px] place-items-center rounded-full text-[12px] font-black ${lit ? "text-[#111]" : "bg-[#E2E2E2] text-[#666]"}`}
              style={lit ? { background: Y } : undefined}>
              {done ? "✓" : i + 1}
            </span>
            <small className={`text-[11px] leading-tight ${now ? "font-black text-[#111]" : "font-bold text-[#777]"}`}>{s}</small>
          </li>
        );
      })}
    </ol>
  );
}

/** gray card with the yellow left edge */
export function DataCard({ icon, label, value, note, children }: { icon?: string; label: string; value?: React.ReactNode; note?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-2.5 bg-[#F5F5F5] px-4 py-3.5" style={{ borderLeft: `3px solid ${Y}` }}>
      <Label className="mb-1.5">{icon ? <span className="mr-2">{icon}</span> : null}{label}</Label>
      {value != null ? <div className="text-[16px] font-bold leading-snug text-[#111]">{value}</div> : null}
      {note ? <div className="mt-1 text-[13px] leading-normal text-[#686868]">{note}</div> : null}
      {children}
    </div>
  );
}

export function YellowButton({ href, children, onClick, type, disabled }: { href?: string; children: React.ReactNode; onClick?: () => void; type?: "submit"; disabled?: boolean }) {
  const cls = "flex h-[52px] w-full items-center justify-center rounded-[2px] text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#111] transition-opacity hover:opacity-90 disabled:opacity-60";
  return href
    ? <a href={href} className={cls} style={{ background: Y }}>{children}</a>
    : <button type={type ?? "button"} onClick={onClick} disabled={disabled} className={cls} style={{ background: Y }}>{children}</button>;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t-2 border-[#171717] pt-4">
      <Label className="mb-3 !text-[11px] !text-[#111]">{title}</Label>
      {children}
    </section>
  );
}

export const parse = (iso: string) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
export const dayDate = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
export const midDate = (iso: any) => (!iso ? "" : parse(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: parse(iso).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }));
export const isToday = (iso: any) => {
  const n = new Date();
  return String(iso).slice(0, 10) === `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
export const money = (n: any) => {
  if (n == null || n === "") return null;
  const v = Number(n), cents = Math.round(v * 100) % 100 !== 0;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
};
