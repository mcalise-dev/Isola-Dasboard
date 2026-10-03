"use client";
import * as React from "react";
import { Command as C } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Command = React.forwardRef<React.ElementRef<typeof C>, React.ComponentPropsWithoutRef<typeof C>>(
  ({ className, ...p }, ref) => <C ref={ref} className={cn("flex h-full w-full flex-col overflow-hidden bg-neutral-950 text-neutral-100", className)} {...p} />
);
Command.displayName = "Command";

export function CommandInput({ className, ...p }: React.ComponentPropsWithoutRef<typeof C.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4" cmdk-input-wrapper="">
      <Search size={18} className="shrink-0 text-neutral-500" />
      <C.Input className={cn("flex h-14 w-full bg-transparent text-base text-white placeholder:text-neutral-500 focus:outline-none focus-visible:outline-none", className)} {...p} />
    </div>
  );
}
export function CommandList({ className, ...p }: React.ComponentPropsWithoutRef<typeof C.List>) {
  return <C.List className={cn("max-h-[60vh] overflow-y-auto overflow-x-hidden scroll-thin p-1.5", className)} {...p} />;
}
export function CommandEmpty(p: React.ComponentPropsWithoutRef<typeof C.Empty>) {
  return <C.Empty className="py-8 text-center text-sm text-neutral-500" {...p} />;
}
export function CommandGroup({ className, ...p }: React.ComponentPropsWithoutRef<typeof C.Group>) {
  return <C.Group className={cn("overflow-hidden [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-neutral-500", className)} {...p} />;
}
export function CommandItem({ className, ...p }: React.ComponentPropsWithoutRef<typeof C.Item>) {
  return <C.Item className={cn("relative flex min-h-[44px] cursor-pointer select-none items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-white [&_svg]:text-neutral-400", className)} {...p} />;
}
export function CommandSeparator({ className, ...p }: React.ComponentPropsWithoutRef<typeof C.Separator>) {
  return <C.Separator className={cn("-mx-1.5 my-1 h-px bg-border", className)} {...p} />;
}
