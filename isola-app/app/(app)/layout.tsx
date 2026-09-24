import Image from "next/image";
import TabBar from "@/components/TabBar";
import SideNav from "@/components/SideNav";
import HubTabs from "@/components/HubTabs";
import MainFrame from "@/components/MainFrame";
import QuickAdd from "@/components/QuickAdd";
import SearchPalette, { SearchButton } from "@/components/SearchPalette";
import Toaster from "@/components/Toaster";
import OfflineCache from "@/components/OfflineCache";
import { logout } from "@/app/login/actions";

// v4.3 (9/23/26): five hubs, search in the header, ＋ opens forms in place,
// no logo watermark behind the content.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-30 bg-black/90 backdrop-blur-md border-b border-white/[0.08] pt-[env(safe-area-inset-top)]">
        <div className="h-[60px] flex items-center gap-3 px-4">
          <a href="/home" className="flex items-center gap-2.5 shrink-0">
            <Image src="/logo.png" alt="Isola" width={36} height={36} className="rounded-full ring-1 ring-white/15" />
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-bold tracking-[0.22em] text-white">ISOLA</span>
              <span className="mt-1 text-[11px] font-medium tracking-wide text-neutral-400">On The Go</span>
            </span>
          </a>
          <div className="flex-1 flex justify-end md:justify-center"><SearchButton /></div>
          <form action={logout} className="shrink-0">
            <button className="text-sm text-neutral-400 hover:text-white min-h-[40px] px-1">Sign out</button>
          </form>
        </div>
      </header>
      <SideNav />
      <div className="md:pl-56 flex-1 flex flex-col">
        <MainFrame>
          <HubTabs />
          {children}
        </MainFrame>
      </div>
      <div className="md:hidden">
        <TabBar />
      </div>
      <QuickAdd />
      <SearchPalette />
      <Toaster />
      <OfflineCache />
    </div>
  );
}
