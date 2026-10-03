import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn/ui helper: merge Tailwind classes so the last one wins.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
