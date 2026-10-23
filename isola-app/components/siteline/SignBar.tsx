/* Yellow bar pinned to the bottom of the screen while something is waiting on the client's signature. */
import { Y } from "@/components/siteline/ui";

export function SignBar({ href, count, label }: { href: string; count?: number; label?: string }) {
  return (
    <>
      <div aria-hidden className="h-24" />
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3"
        style={{ background: "linear-gradient(to top, rgba(241,241,241,1) 60%, rgba(241,241,241,0))" }}>
        <a href={href} className="mx-auto flex h-14 max-w-[496px] items-center justify-between gap-3 px-5 text-[#111] shadow-[0_8px_24px_rgba(0,0,0,0.18)]" style={{ background: Y }}>
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#111]" />
            <span className="text-[13px] font-extrabold uppercase tracking-[0.08em]">{label ?? (count && count > 1 ? `${count} to sign · Start now` : "Review & sign")}</span>
          </span>
          <span aria-hidden className="text-[22px] font-black leading-none">→</span>
        </a>
      </div>
    </>
  );
}
