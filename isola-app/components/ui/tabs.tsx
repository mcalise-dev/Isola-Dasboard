"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

// Underline tabs (Linear style)
export const Tabs = T.Root;
export function TabsList({ className, ...p }: React.ComponentPropsWithoutRef<typeof T.List>) {
  return <T.List className={cn("flex items-center gap-5 overflow-x-auto no-scrollbar border-b border-border", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentPropsWithoutRef<typeof T.Trigger>) {
  return <T.Trigger className={cn("-mb-px shrink-0 border-b-2 border-transparent pb-2.5 pt-1 text-sm font-semibold text-neutral-400 hover:text-neutral-200 data-[state=active]:border-white data-[state=active]:text-white", className)} {...p} />;
}
export function TabsContent({ className, ...p }: React.ComponentPropsWithoutRef<typeof T.Content>) {
  return <T.Content className={cn("pt-4 focus:outline-none", className)} {...p} />;
}

// Segmented control (table / board toggles)
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[]; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-lg border border-border bg-neutral-950 p-0.5", className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-[13px] font-semibold", value === o.value ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-white")}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
