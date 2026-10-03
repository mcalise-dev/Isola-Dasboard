"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Side panel (Linear / Attio "peek"): slides in from the right on desktop,
// full-height sheet from the bottom on a phone.
export const Sheet = D.Root;
export const SheetClose = D.Close;

export function SheetContent({ className, children, title, ...p }: React.ComponentPropsWithoutRef<typeof D.Content> & { title?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-[70] bg-black/60 anim-fade md:bg-black/40" />
      <D.Content
        className={cn(
          "fixed z-[71] inset-x-0 bottom-0 top-[6vh] flex flex-col rounded-t-2xl border border-border bg-neutral-950 anim-sheet focus:outline-none",
          "md:inset-y-0 md:left-auto md:right-0 md:top-0 md:w-[520px] md:max-w-[92vw] md:rounded-none md:border-y-0 md:border-r-0 md:anim-slide",
          className
        )}
        {...p}
      >
        <D.Title className="sr-only">{title ?? "Details"}</D.Title>
        {children}
        <D.Close className="absolute right-3 top-3 z-10 rounded-md p-2 text-neutral-400 hover:text-white hover:bg-accent" aria-label="Close panel">
          <X size={18} />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
