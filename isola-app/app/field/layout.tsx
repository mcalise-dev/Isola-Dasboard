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
      <header className="sticky top-0 z-30 bg-neutral-950 border-b border-neutral-800 pt-[env(safe-area-inset-top)]">
        <div className="h-[60px] flex items-center gap-3 px-4 max-w-2xl mx-auto">
          <Image src="/logo.png" alt="Isola" width={34} height={34} className="rounded-full ring-1 ring-neutral-700" />
          <div className="min-w-0">
            <div className="font-bold tracking-tight text-white leading-tight">Isola Crew</div>
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
