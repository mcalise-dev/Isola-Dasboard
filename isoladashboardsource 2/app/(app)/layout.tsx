import Image from "next/image";
import TabBar from "@/components/TabBar";
import SideNav from "@/components/SideNav";
import { logout } from "@/app/login/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div aria-hidden className="fixed inset-0 z-0 md:pl-56 flex items-center justify-center pointer-events-none select-none overflow-hidden">
        <img src="/logo.png" alt="" className="w-[24rem] max-w-[82vw] opacity-[0.14]" />
      </div>
      <header className="sticky top-0 z-30 bg-neutral-950/95 backdrop-blur border-b border-neutral-800">
        <div className="mx-auto max-w-2xl md:max-w-none md:px-4 flex items-center justify-between px-4 py-3">
          <a href="/home" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Isola" width={34} height={34} className="rounded-full ring-1 ring-neutral-700" />
            <span className="font-bold tracking-tight text-white">Isola On The Go</span>
          </a>
          <form action={logout}>
            <button className="text-xs text-neutral-500 hover:text-neutral-300">Sign out</button>
          </form>
        </div>
      </header>
      <SideNav />
      <div className="md:pl-56 flex-1 flex flex-col">
        <main className="relative z-10 mx-auto w-full max-w-2xl md:max-w-3xl flex-1 px-4 pt-4 pb-28 md:pb-10">{children}</main>
      </div>
      <div className="md:hidden">
        <TabBar />
      </div>
    </div>
  );
}
