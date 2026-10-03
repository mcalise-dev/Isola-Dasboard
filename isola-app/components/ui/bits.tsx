import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-5", className)} aria-hidden />;
}

export function Kbd({ className, ...p }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-white/15 bg-white/[0.04] px-1 font-sans text-[11px] font-medium text-neutral-400", className)} {...p} />;
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

// Page title row: breadcrumb, title, actions on the right.
export function PageHeader({ title, sub, crumb, actions, className }: { title: React.ReactNode; sub?: React.ReactNode; crumb?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end", className)}>
      <div className="min-w-0 sm:flex-1">
        {crumb ? <div className="mb-1 text-[13px] text-neutral-500">{crumb}</div> : null}
        <h1 className="text-2xl font-semibold text-white leading-tight">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-neutral-400">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// Section heading inside a page
export function SectionTitle({ children, right, className }: { children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2.5 flex items-center gap-2", className)}>
      <h2 className="text-[17px] font-semibold text-white">{children}</h2>
      {right ? <div className="ml-auto flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

// One strong number (Vercel style)
export function Stat({ label, value, hint, tone, onClick, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "ok" | "warn" | "bad"; onClick?: () => void; className?: string }) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={cn("rounded-xl border border-border bg-card px-4 py-3 text-left", onClick && "hover:border-white/20 transition-colors", className)}>
      <div className="text-[13px] font-medium text-neutral-400">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight text-white", tone === "ok" && "text-emerald-300", tone === "warn" && "text-amber-300", tone === "bad" && "text-red-300")}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-neutral-500">{hint}</div> : null}
    </Comp>
  );
}

// Empty state with the action to take
export function Empty({ icon, title, body, action, className }: { icon?: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-dashed border-white/10 px-6 py-10 text-center", className)}>
      {icon ? <div className="mx-auto mb-2 flex justify-center text-neutral-500">{icon}</div> : null}
      <p className="text-base font-semibold text-white">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-400">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

// key / value row for the record side rail
export function KV({ k, children, className }: { k: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 border-b border-white/[0.05] py-2 text-sm last:border-0", className)}>
      <span className="shrink-0 text-neutral-400">{k}</span>
      <span className="min-w-0 text-right font-medium text-neutral-100 break-words">{children}</span>
    </div>
  );
}

export function Progress({ value, tone, className }: { value: number; tone?: "ok" | "warn" | "bad" | "plain"; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-white/[0.08]", className)}>
      <div className={cn("h-full rounded-full", tone === "ok" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : tone === "bad" ? "bg-red-400" : "bg-white")} style={{ width: v + "%" }} />
    </div>
  );
}

// Horizontal stage stepper (job record, pipeline accounts)
export function Stepper({ steps, current, done, onPick, className }: { steps: { key: string; label: string }[]; current: number; done?: (i: number) => boolean; onPick?: (key: string) => void; className?: string }) {
  return (
    <ol className={cn("flex overflow-x-auto no-scrollbar rounded-xl border border-border bg-card px-2 py-3", className)}>
      {steps.map((s, i) => {
        const isDone = done ? done(i) : i < current;
        const isNow = i === current;
        return (
          <li key={s.key} className="relative min-w-[84px] flex-1 text-center">
            {i > 0 ? <span className={cn("absolute left-[-50%] right-[50%] top-[9px] h-0.5", isDone || isNow ? "bg-white" : "bg-white/10")} /> : null}
            <button type="button" disabled={!onPick} onClick={() => onPick?.(s.key)} className="relative z-[1] flex w-full flex-col items-center gap-1.5 disabled:cursor-default">
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                isDone ? "border-white bg-white text-neutral-900" : isNow ? "border-white bg-neutral-950 ring-4 ring-white/15" : "border-white/20 bg-neutral-950")}>
                {isDone ? "✓" : ""}
              </span>
              <span className={cn("text-xs leading-tight", isNow ? "font-semibold text-white" : isDone ? "text-neutral-300" : "text-neutral-500")}>{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
