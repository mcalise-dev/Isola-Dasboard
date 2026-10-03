"use client";
import * as React from "react";
import * as P from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;
export function PopoverContent({ className, align = "end", sideOffset = 6, ...p }: React.ComponentPropsWithoutRef<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={sideOffset}
        className={cn("z-[80] w-80 rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_16px_40px_rgba(0,0,0,.6)] anim-pop focus:outline-none", className)} {...p} />
    </P.Portal>
  );
}
