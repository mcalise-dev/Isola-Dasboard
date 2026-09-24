import Image from "next/image";
import { login } from "./actions";

// v4.5: branded sign-in — same black & white look as the proposals.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const input = "w-full rounded-xl border border-white/10 bg-white/[0.04] text-white px-3.5 min-h-[48px] text-base placeholder:text-neutral-500 focus:outline-none focus:border-white/40";
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-12 bg-black">
      <div className="w-full max-w-sm anim-pop">
        <div className="flex flex-col items-center mb-10">
          <Image src="/logo.png" alt="Isola" width={112} height={112} className="rounded-full ring-1 ring-white/15" priority />
          <div className="mt-6 text-3xl font-bold tracking-[0.3em] pl-[0.3em] text-white">ISOLA</div>
          <div className="mt-2 text-xs font-medium tracking-[0.25em] text-neutral-400">CONCRETE · MASONRY · SITEWORK</div>
        </div>
        <form action={login} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-1.5">Email or crew name</label>
            <input id="email" name="email" type="text" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="you@email.com or tony" className={input} />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-1.5">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className={input} />
          </div>
          {error ? <p className="text-sm text-red-400">Wrong name, email or password — try again.</p> : null}
          <button type="submit" className="w-full bg-white text-neutral-900 font-semibold rounded-xl min-h-[50px] text-base hover:bg-neutral-200 transition-colors">Sign in</button>
        </form>
        <p className="mt-10 text-center text-xs text-neutral-500">Isola LLC · Providence, RI</p>
      </div>
    </div>
  );
}
