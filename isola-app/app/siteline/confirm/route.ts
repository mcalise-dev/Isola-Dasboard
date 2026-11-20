// GET /siteline/confirm — v91 (11/20/26). Where the sign-up and reset emails land.
// Handles both link styles Supabase can send: ?token_hash=…&type=… (the email templates in the
// client-login setup) and ?code=… (the default). Then goes on to ?next (a /siteline path only).
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = req.nextUrl;
  const raw = u.searchParams.get("next") ?? "/siteline/account";
  const next = raw.startsWith("/siteline/") && !raw.startsWith("//") ? raw : "/siteline/account";
  const supabase = await createClient();
  const token_hash = u.searchParams.get("token_hash");
  const type = u.searchParams.get("type") as "signup" | "recovery" | "email" | null;
  const code = u.searchParams.get("code");
  let ok = false;
  if (token_hash && type) ok = !(await supabase.auth.verifyOtp({ token_hash, type })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  const dest = u.clone();
  dest.search = "";
  dest.pathname = ok ? next : next === "/siteline/reset" ? "/siteline/reset" : "/siteline";
  return NextResponse.redirect(dest);
}
