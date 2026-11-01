"use client";
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
      <div className={cn("h-full rounded-full", tone === "ok" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : tone === "bad" ? "bg-red-400" : "bg-brand")} style={{ width: v + "%" }} />
    </div>
  );
}

// Horizontal stage stepper (job record, pipeline accounts)
// v8.4: on a phone it collapses to "where it is · what's next" with a progress line; "All stages"
// opens the full row (still tappable to move a job). Desktop always shows the full row.
export function Stepper({ steps, current, done, onPick, className }: { steps: { key: string; label: string }[]; current: number; done?: (i: number) => boolean; onPick?: (key: string) => void; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const now = steps[Math.max(0, current)];
  const next = steps[current + 1];
  const pct = steps.length > 1 ? Math.max(0, current) / (steps.length - 1) : 1;
  return (
    <div className={className}>
      <div className={cn("rounded-xl border border-border bg-card px-3.5 py-3 md:hidden", open && "hidden")}>
        <div className="flex items-center gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-white bg-neutral-950 ring-4 ring-white/15" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-white">{now?.label}</div>
            <div className="truncate text-xs text-neutral-400">{next ? <>Next: {next.label}</> : "Last stage"} · {Math.max(0, current) + 1} of {steps.length}</div>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="min-h-[36px] shrink-0 rounded-lg px-2.5 text-xs font-semibold text-neutral-300 hover:bg-white/[0.06] hover:text-white">All stages</button>
        </div>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand" style={{ width: `${pct * 100}%` }} /></div>
      </div>
      <div className={cn(!open && "hidden md:block")}>
        {open ? <button type="button" onClick={() => setOpen(false)} className="mb-1.5 text-xs font-semibold text-neutral-400 hover:text-white md:hidden">Hide stages</button> : null}
        <StepperRow steps={steps} current={current} done={done} onPick={onPick} />
      </div>
    </div>
  );
}

function StepperRow({ steps, current, done, onPick }: { steps: { key: string; label: string }[]; current: number; done?: (i: number) => boolean; onPick?: (key: string) => void }) {
  return (
    <ol className="flex overflow-x-auto no-scrollbar rounded-xl border border-border bg-card px-2 py-3">
      {steps.map((s, i) => {
        const isDone = done ? done(i) : i < current;
        const isNow = i === current;
        return (
          <li key={s.key} className="relative min-w-[84px] flex-1 text-center">
            {i > 0 ? <span className={cn("absolute left-[-50%] right-[50%] top-[9px] h-0.5", isDone || isNow ? "bg-brand" : "bg-white/10")} /> : null}
            <button type="button" disabled={!onPick} onClick={() => onPick?.(s.key)} className="relative z-[1] flex w-full flex-col items-center gap-1.5 disabled:cursor-default">
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                isDone ? "border-brand bg-brand text-neutral-950" : isNow ? "border-white bg-neutral-950 ring-4 ring-white/15" : "border-white/20 bg-neutral-950")}>
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

// v4.8: shown instead of endless skeletons when a screen's data didn't load
// (expired login, no signal on site). Pair with withTimeout() from lib/load.
export function LoadError({ onRetry, message, className }: { onRetry?: () => void; message?: string; className?: string }) {
  // Connection failures read as gibberish ("TypeError: Failed to fetch") — say it plainly.
  const network = !message || /failed to fetch|networkerror|load failed|timeout|no response/i.test(message);
  message = network ? undefined : message;
  return (
    <div role="alert" className={cn("rounded-xl border border-red-500/30 bg-red-500/[0.06] px-6 py-8 text-center", className)}>
      <p className="text-base font-semibold text-white">Couldn't load this</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-400">{message || "Check your signal, then try again. If it keeps happening, sign out and back in."}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-4 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-neutral-950 hover:bg-brand-dark">Try again</button>
      ) : null}
    </div>
  );
}

// Standard loading placeholder for a list screen.
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
    </div>
  );
}
