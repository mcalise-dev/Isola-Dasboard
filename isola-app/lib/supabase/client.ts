import { createBrowserClient } from "@supabase/ssr";
import { createOfflineFetch, startOfflineQueue } from "@/lib/offlineQueue";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xkgfekvgftithakacldr.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_hqX-MF3doDbFAXHKLMU_TQ_EvLsxz33";

// v4.9: table writes made with no signal are queued in IndexedDB and replayed when back online
// (lib/offlineQueue.ts). On the server this fetch passes straight through.
// The token getter reads the session via auth (GET/auth paths — never queued).
const offlineFetch = createOfflineFetch({
  supabaseUrl: SUPABASE_URL,
  apiKey: SUPABASE_KEY,
  getAccessToken: async () => (await createClient().auth.getSession()).data.session?.access_token ?? null,
});

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: offlineFetch } });
}

if (typeof window !== "undefined") startOfflineQueue();
