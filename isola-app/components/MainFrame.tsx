"use client";
import { usePathname } from "next/navigation";

// Page width: the Jobs screen gets the full desktop width (list + job file side by side);
// everything else stays a comfortable reading column.
const WIDE = new Set(["/", "/schedule"]);

export default function MainFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const wide = WIDE.has(path);
  return (
    <main className={`relative z-10 mx-auto w-full flex-1 px-4 pt-4 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-10 ${wide ? "max-w-2xl md:max-w-none md:px-6" : "max-w-2xl md:max-w-3xl"}`}>
      {children}
    </main>
  );
}
