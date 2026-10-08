"use client";
import { usePathname } from "next/navigation";

// v4.6: wide screens (tables, boards, records) use the full width.
// v4.8: every other screen gets a 5xl column (was 3xl, which left laptops half empty);
// only screens listed in NARROW keep the reading column.
const WIDE_PREFIX = ["/home", "/jobs", "/dispatch", "/schedule", "/customers", "/marketing"];
const NARROW = new Set(["/marketing/tasks"]);

export default function MainFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const wide = !NARROW.has(path) && (path === "/" || WIDE_PREFIX.some((p) => path === p || path.startsWith(p + "/")));
  return (
    <main className={`relative z-10 mx-auto w-full flex-1 px-4 pt-4 pb-[calc(9rem+env(safe-area-inset-bottom))] md:px-8 md:pt-6 md:pb-12 ${wide ? "max-w-[1440px]" : NARROW.has(path) ? "max-w-3xl" : "max-w-5xl"}`}>
      {children}
    </main>
  );
}
