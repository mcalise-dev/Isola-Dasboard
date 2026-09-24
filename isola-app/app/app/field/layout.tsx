import Image from "next/image";
import { logout } from "@/app/login/actions";
import FieldTabBar from "@/components/field/FieldTabBar";
import FieldName from "@/components/field/FieldName";
import Toaster from "@/components/Toaster";

// v4.4: the crew app. Crew logins land here and can't leave it (middleware).
// Everything on these screens comes from the crew_* database functions — no prices,
// no money, no pay rates, no customer list.
export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-30 bg-black/90 backdrop-blur-md border-b border-white/[0.08] pt-[env(safe-area-inset-top)]">
        <div className="h-[60px] flex items-center gap-3 px-4 max-w-2xl mx-auto">
          <Image src="/logo.png" alt="Isola" width={36} height={36} className="rounded-full ring-1 ring-white/15" />
          <div className="min-w-0">
            <div className="text-[15px] font-bold tracking-[0.22em] text-white leading-tight">ISOLA <span className="tracking-normal font-medium text-neutral-400 text-[13px]">Crew</span></div>
            <FieldName />
          </div>
          <form action={logout} className="ml-auto">
            <button className="text-sm text-neutral-400 hover:text-white min-h-[40px] px-1">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">{children}</main>
      <FieldTabBar />
      <Toaster />
    </div>
  );
}
