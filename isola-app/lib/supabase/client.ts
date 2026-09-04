import { createBrowserClient } from "@supabase/ssr";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xkgfekvgftithakacldr.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_hqX-MF3doDbFAXHKLMU_TQ_EvLsxz33";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
