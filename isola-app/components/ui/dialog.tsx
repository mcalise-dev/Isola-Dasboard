"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

// Bottom sheet on a phone, centered dialog on desktop.
export function DialogContent({ className, children, wide, ...p }: React.ComponentPropsWithoutRef<typeof D.Content> & { wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-[70] bg-black/75 anim-fade" />
      <D.Content
        className={cn(
          "fixed z-[71] inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto scroll-thin rounded-t-2xl border border-border bg-neutral-950 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] anim-sheet focus:outline-none",
          "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[calc(100%-2rem)] sm:rounded-2xl sm:pb-5",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
          className
        )}
        {...p}
      >
        {children}
        <D.Close className="absolute right-3 top-3 rounded-md p-2 text-neutral-400 hover:text-white hover:bg-accent" aria-label="Close">
          <X size={18} />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
export function DialogHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 pr-8", className)} {...p} />;
}
export function DialogTitle({ className, ...p }: React.ComponentPropsWithoutRef<typeof D.Title>) {
  return <D.Title className={cn("text-lg font-semibold text-white", className)} {...p} />;
}
export function DialogDescription({ className, ...p }: React.ComponentPropsWithoutRef<typeof D.Description>) {
  return <D.Description className={cn("mt-1 text-sm text-muted-foreground", className)} {...p} />;
}
export function DialogFooter({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...p} />;
}
