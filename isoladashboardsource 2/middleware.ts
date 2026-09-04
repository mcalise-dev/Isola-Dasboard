import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_KEY } from "./lib/supabase/client";

// Routes that must work with NO login: the client hub and the crew time clock.
const PUBLIC_PREFIXES = ["/p/", "/clock"];
const isPublic = (path: string) =>
  PUBLIC_PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p));

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (isPublic(path)) return NextResponse.next({ request });

  const isLogin = path.startsWith("/login");

  // Is there a Supabase session cookie at all? Reading cookies is free —
  // calling auth.getUser() is a network round-trip to Supabase on every
  // request, which was the single most-called endpoint in the app.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  // No cookie: we already know they're signed out. Redirect without asking the network.
  if (!hasSession) {
    if (isLogin) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Next.js prefetches every visible <Link>. Those are cache warm-ups, not real
  // navigations — don't spend an auth round-trip on them. The actual navigation
  // is still verified below, and RLS is the real boundary on the data itself.
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" || request.headers.get("purpose") === "prefetch";
  if (isPrefetch) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    // Skip every static asset and image request — none of them need an auth check.
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|logo.png|icon-192.png|icon-512.png|apple-touch-icon.png|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf)$).*)",
  ],
};
