"use client";
import * as React from "react";
import { Drawer as V } from "vaul";
import { cn } from "@/lib/utils";

// Phone bottom sheet you can drag down to close (vaul).
export const Drawer = V.Root;
export const DrawerTrigger = V.Trigger;
export const DrawerClose = V.Close;

export function DrawerContent({ className, children, title, ...p }: React.ComponentPropsWithoutRef<typeof V.Content> & { title?: string }) {
  return (
    <V.Portal>
      <V.Overlay className="fixed inset-0 z-[70] bg-black/70" />
      <V.Content
        className={cn("fixed inset-x-0 bottom-0 z-[71] flex max-h-[88vh] flex-col rounded-t-2xl border border-border bg-neutral-950 pb-[env(safe-area-inset-bottom)] focus:outline-none", className)}
        {...p}
      >
        <V.Title className="sr-only">{title ?? "Menu"}</V.Title>
        <div className="mx-auto mt-2.5 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-neutral-700" />
        {children}
      </V.Content>
    </V.Portal>
  );
}
