"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuGroup = M.Group;

export function DropdownMenuContent({ className, sideOffset = 6, ...p }: React.ComponentPropsWithoutRef<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={sideOffset}
        className={cn("z-[80] min-w-[220px] overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_16px_40px_rgba(0,0,0,.6)] anim-pop", className)} {...p} />
    </M.Portal>
  );
}
export function DropdownMenuItem({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Item>) {
  return <M.Item className={cn("relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutral-200 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-white data-[disabled]:opacity-50 [&_svg]:text-neutral-400", className)} {...p} />;
}
export function DropdownMenuLabel({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Label>) {
  return <M.Label className={cn("px-2.5 pt-1.5 pb-1 text-xs font-semibold text-neutral-500", className)} {...p} />;
}
export function DropdownMenuSeparator({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Separator>) {
  return <M.Separator className={cn("my-1 h-px bg-border", className)} {...p} />;
}
export function DropdownMenuShortcut({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("ml-auto text-xs text-neutral-500", className)} {...p} />;
}
