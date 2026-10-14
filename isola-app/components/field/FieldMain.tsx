"use client";
import { usePathname } from "next/navigation";

// Crew screens are phone-width. A THM job file (/field/thm/<id>) is the full owner job screen,
// which lays out in two columns on wider screens — give it the room so nothing gets cut off.
export default function FieldMain({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const wide = /^\/field\/thm\/[^/]+/.test(path);
  return (
    <main className={`mx-auto w-full flex-1 px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] ${wide ? "max-w-6xl" : "max-w-2xl"}`}>
      {children}
    </main>
  );
}
