"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = T.Provider;
export function Tip({ label, children, side = "bottom" }: { label: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className={cn("z-[90] rounded-md border border-border bg-neutral-900 px-2 py-1 text-xs text-neutral-200 shadow-lg anim-fade")}>
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
