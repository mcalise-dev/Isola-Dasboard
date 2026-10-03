"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Plus, Briefcase, UserPlus, Camera, ListChecks, Target, LogOut, CircleDot } from "lucide-react";
import { SearchButton, openNew } from "@/components/SearchPalette";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/bits";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from "@/components/ui/popover";
import { useAttention } from "@/lib/attention";
import { logout } from "@/app/login/actions";
import { cn } from "@/lib/utils";

const DOT = { high: "bg-red-400", mid: "bg-amber-400", low: "bg-neutral-500" } as const;

export default function TopBar() {
  const a = useAttention();
  const router = useRouter();
  const n = a ? a.items.filter((i) => i.level !== "low").length : 0;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-black/85 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-3 px-3 md:px-4">
        <Link href="/home" className="flex shrink-0 items-center gap-2.5 md:w-[212px]">
          <Image src="/logo.png" alt="Isola" width={32} height={32} className="rounded-full ring-1 ring-white/15" />
          <span className="flex flex-col leading-none">
            <span className="text-[14px] font-bold tracking-[0.22em] text-white">ISOLA</span>
            <span className="mt-0.5 text-[11px] font-medium text-neutral-500">On The Go</span>
          </span>
        </Link>
        <div className="flex min-w-0 flex-1 justify-end md:justify-start"><SearchButton /></div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="hidden md:inline-flex"><Plus size={16} strokeWidth={2.6} /> New</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openNew("job")}><Briefcase size={16} /> Job <DropdownMenuShortcut><Kbd>N</Kbd></DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openNew("lead")}><UserPlus size={16} /> Lead</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openNew("receipt")}><Camera size={16} /> Receipt</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openNew("task")}><ListChecks size={16} /> Task</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openNew("target")}><Target size={16} /> Marketing target</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event("isola:quickadd"))}><CircleDot size={16} /> More…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover>
          <PopoverTrigger asChild>
            <button aria-label={`Alerts${n ? ` (${n})` : ""}`} className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-accent hover:text-white">
              <Bell size={19} />
              {n ? <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[11px] font-bold leading-[18px] text-white">{n > 99 ? "99+" : n}</span> : null}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] max-w-[calc(100vw-1.5rem)] p-0">
            <div className="flex items-center border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-white">Needs attention</span>
              <PopoverClose asChild><Link href="/home" className="ml-auto text-xs font-semibold text-neutral-400 hover:text-white">Open Home</Link></PopoverClose>
            </div>
            <div className="max-h-[420px] overflow-y-auto scroll-thin py-1">
              {!a ? <div className="space-y-2 p-3"><div className="skeleton h-10" /><div className="skeleton h-10" /></div> : null}
              {a && !a.items.length ? <p className="px-4 py-8 text-center text-sm text-neutral-500">All clear. Nothing needs you right now.</p> : null}
              {a?.items.slice(0, 12).map((i) => (
                <PopoverClose asChild key={i.id}>
                  <button onClick={() => router.push(i.href)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-accent">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[i.level])} />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-neutral-500">{i.kind}</span>
                      <span className="block truncate text-sm font-medium text-white">{i.title}</span>
                      <span className="block truncate text-xs text-neutral-400">{i.sub}</span>
                    </span>
                  </button>
                </PopoverClose>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="Account" className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-neutral-900 md:flex">MC</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Mike Calise · Isola LLC</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/crew")}>Crew logins</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/docs")}>Documents & insurance</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { const f = document.getElementById("logout-form") as HTMLFormElement | null; f?.requestSubmit(); }}><LogOut size={16} /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <form id="logout-form" action={logout} className="hidden" />
      </div>
    </header>
  );
}
