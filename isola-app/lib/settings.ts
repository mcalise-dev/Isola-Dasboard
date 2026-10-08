// App-wide settings, stored one row per key in public.app_settings (key, value text, updated_at).
// Owner-only RLS. Structured values are JSON.stringify'd into `value` — use getJSON/setJSON.
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/load";

export type SettingKey =
  | "company"
  | "proposal_valid_days"
  | "payment_terms"
  | "google_review_url"
  | "push_prefs"
  | (string & {});

export type CompanyInfo = {
  name: string;
  phone: string;
  email: string;
  address: string;
  ri_reg: string;
  ma_reg: string;
};

export type PushPrefs = {
  proposal_signed: boolean;
  punch_client: boolean;
  punch_signoff: boolean;
  vendor_upload: boolean;
  coi_expiring: boolean;
};

export const DEFAULT_COMPANY: CompanyInfo = {
  name: "Isola LLC",
  phone: "508-933-2661",
  email: "mcalise@isola-ri.com",
  address: "77 Stella Street, Providence, RI 02909",
  ri_reg: "",
  ma_reg: "",
};
export const DEFAULT_VALID_DAYS = 30;
export const DEFAULT_PAYMENT_TERMS = "33% deposit / 33% midpoint / balance on completion";
export const DEFAULT_PUSH_PREFS: PushPrefs = {
  proposal_signed: true,
  punch_client: true,
  punch_signoff: true,
  vendor_upload: true,
  coi_expiring: true,
};

let _sb: ReturnType<typeof createClient> | null = null;
const sb = () => (_sb ??= createClient());

/** One setting's raw text value, or null when not set. Throws on a query error. */
export async function getSetting(key: SettingKey): Promise<string | null> {
  const { data, error } = await sb().from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as string | null | undefined) ?? null;
}

/** Several settings at once → { key: value|null } (every requested key present). */
export async function getSettings(keys: SettingKey[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = null;
  if (!keys.length) return out;
  const { data, error } = await sb().from("app_settings").select("key,value").in("key", keys as string[]);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as { key: string; value: string | null }[]) out[r.key] = r.value ?? null;
  return out;
}

/** Upsert one setting (on key), stamping updated_at. Throws on error. */
export async function setSetting(key: SettingKey, value: string | null): Promise<void> {
  const { error } = await sb()
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

/** Upsert several settings in one call. */
export async function setSettings(values: Record<string, string | null>): Promise<void> {
  const now = new Date().toISOString();
  const rows = Object.entries(values).map(([key, value]) => ({ key, value, updated_at: now }));
  if (!rows.length) return;
  const { error } = await sb().from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

/** Parse a stored JSON value; returns `fallback` when missing or unparseable. Objects merge over the fallback. */
export function parseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    const v = JSON.parse(raw);
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback) && v && typeof v === "object" && !Array.isArray(v)) {
      return { ...fallback, ...v } as T;
    }
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export async function getJSON<T>(key: SettingKey, fallback: T): Promise<T> {
  return parseJSON(await getSetting(key), fallback);
}

export async function setJSON(key: SettingKey, value: unknown): Promise<void> {
  await setSetting(key, JSON.stringify(value));
}

/** Proposal validity in days (setting "proposal_valid_days"), falling back to 30 on any problem. */
export async function getProposalValidDays(): Promise<number> {
  try {
    const n = Math.round(Number(await withTimeout(getSetting("proposal_valid_days"), 8000)));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_VALID_DAYS;
  } catch {
    return DEFAULT_VALID_DAYS;
  }
}

/** Default payment terms text (setting "payment_terms"), falling back to the standard 33/33/balance. */
export async function getPaymentTerms(): Promise<string> {
  try {
    const v = await withTimeout(getSetting("payment_terms"), 8000);
    return v?.trim() || DEFAULT_PAYMENT_TERMS;
  } catch {
    return DEFAULT_PAYMENT_TERMS;
  }
}

/** ISO date (yyyy-mm-dd) `days` from today. */
export function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Load a set of keys. `values` is null while loading; `error` holds a readable message
 * ("No response — check your signal." on timeout). `reload` refetches; `set` saves one key
 * and updates local state.
 */
export function useSettings(keys: SettingKey[]) {
  const sig = keys.join("|");
  const [values, setValues] = useState<Record<string, string | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const v = await withTimeout(getSettings(sig ? sig.split("|") : []));
      if (live.current) setValues(v);
    } catch (e: any) {
      if (live.current) setError(e?.message === "timeout" ? "No response — check your signal." : e?.message ?? String(e));
    }
  }, [sig]);

  useEffect(() => {
    live.current = true;
    reload();
    return () => { live.current = false; };
  }, [reload]);

  const set = useCallback(async (key: SettingKey, value: string | null) => {
    await setSetting(key, value);
    if (live.current) setValues((s) => ({ ...(s ?? {}), [key]: value }));
  }, []);

  const setMany = useCallback(async (v: Record<string, string | null>) => {
    await setSettings(v);
    if (live.current) setValues((s) => ({ ...(s ?? {}), ...v }));
  }, []);

  return { values, error, loading: values === null && !error, reload, set, setMany };
}
