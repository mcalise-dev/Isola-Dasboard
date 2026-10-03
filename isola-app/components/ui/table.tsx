import * as React from "react";
import { cn } from "@/lib/utils";

export function TableWrap({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-x-auto scroll-thin rounded-xl border border-border bg-card", className)} {...p} />;
}
export function Table({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full caption-bottom text-sm", className)} {...p} />;
}
export function THead({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 z-[1] bg-neutral-950 [&_tr]:border-b [&_tr]:border-border", className)} {...p} />;
}
export function TBody({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />;
}
export function TR({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border transition-colors data-[state=selected]:bg-white/[0.06]", className)} {...p} />;
}
export function TH({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold text-neutral-400", className)} {...p} />;
}
export function TD({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle", className)} {...p} />;
}
