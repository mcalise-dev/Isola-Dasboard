import Image from "next/image";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 bg-black">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo.png" alt="Isola Excavation & Design" width={88} height={88} className="rounded-full ring-1 ring-neutral-700" priority />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-white">Isola On The Go</h1>
          <p className="text-sm text-neutral-400">Sign in to continue</p>
        </div>
        <form action={login} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="mb-4">
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" defaultValue="mcalise@isola-ri.com" className="w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          </div>
          <div className="mb-5">
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="w-full rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          </div>
          {error ? <p className="mb-4 text-sm text-red-400">Wrong email or password — try again.</p> : null}
          <button type="submit" className="w-full bg-white text-neutral-900 font-semibold rounded-lg py-2.5 text-sm hover:bg-neutral-200 transition-colors">Sign In</button>
        </form>
        <p className="mt-6 text-center text-xs text-neutral-600">Isola Excavation &amp; Design · Providence, RI</p>
      </div>
    </div>
  );
}
