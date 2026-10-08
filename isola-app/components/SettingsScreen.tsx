"use client";
// Settings — company details, defaults for new proposals, push alerts, menu pins, app/account.
// Values live in public.app_settings (lib/settings.ts). Menu pins/collapsed groups are per-device localStorage.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logout } from "@/app/login/actions";
import {
  useSettings, parseJSON, DEFAULT_COMPANY, DEFAULT_VALID_DAYS, DEFAULT_PAYMENT_TERMS, DEFAULT_PUSH_PREFS,
  type CompanyInfo, type PushPrefs,
} from "@/lib/settings";
import { pushSupported, pushStatus, enablePush, disablePush, sendTestPush, type PushStatus } from "@/lib/push";
import { ALL_ITEMS } from "@/lib/nav";
import { showError, showToast } from "@/components/Toaster";
import { ask } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Field } from "@/components/ui/input";
import { PageHeader, SectionTitle, ListSkeleton, LoadError } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, X, Smartphone, LogOut, HardHat, Download, Bell, BellOff, Send } from "lucide-react";

const APP_VERSION = "4.8";
const PINS_KEY = "isola.nav.pins";
const SHUT_KEY = "isola.nav.shut";

const KEYS = ["company", "proposal_valid_days", "payment_terms", "google_review_url", "push_prefs"];

export default function SettingsScreen() {
  const { values, error, reload, setMany } = useSettings(KEYS);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" sub="Company details, defaults for new proposals, alerts and this phone's menu." />
      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : !values ? (
        <ListSkeleton />
      ) : (
        <>
          <CompanySection raw={values.company} save={setMany} />
          <DefaultsSection values={values} save={setMany} />
          <AlertsSection raw={values.push_prefs} save={setMany} />
        </>
      )}
      <MenuSection />
      <AppSection />
    </div>
  );
}

type SaveFn = (v: Record<string, string | null>) => Promise<void>;

function SaveRow({ dirty, busy, onSave, onReset }: { dirty: boolean; busy: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <Button onClick={onSave} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</Button>
      {dirty && !busy ? <Button variant="ghost" onClick={onReset}>Undo changes</Button> : null}
    </div>
  );
}

function useSaver(save: SaveFn) {
  const [busy, setBusy] = useState(false);
  async function run(v: Record<string, string | null>, done: string) {
    setBusy(true);
    try {
      await save(v);
      showToast(done);
    } catch (e: any) {
      showError("Save failed: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

// ---------------- 1. Company ----------------
function CompanySection({ raw, save }: { raw: string | null; save: SaveFn }) {
  const stored = useMemo(() => parseJSON<CompanyInfo>(raw, DEFAULT_COMPANY), [raw]);
  const [f, setF] = useState<CompanyInfo>(stored);
  useEffect(() => setF(stored), [stored]);
  const { busy, run } = useSaver(save);
  const dirty = JSON.stringify(f) !== JSON.stringify(stored);
  const set = (k: keyof CompanyInfo) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const clean = (): CompanyInfo => ({
    name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), address: f.address.trim(),
    ri_reg: f.ri_reg.trim(), ma_reg: f.ma_reg.trim(),
  });

  return (
    <section>
      <SectionTitle>Company</SectionTitle>
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company name" className="sm:col-span-2"><Input value={f.name} onChange={set("name")} autoComplete="organization" /></Field>
            <Field label="Phone"><Input type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" /></Field>
            <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} autoComplete="email" /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={set("address")} autoComplete="street-address" /></Field>
            <Field label="RI contractor registration #"><Input value={f.ri_reg} onChange={set("ri_reg")} /></Field>
            <Field label="MA registration #"><Input value={f.ma_reg} onChange={set("ma_reg")} /></Field>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Company details for your records, kept in one place. Proposal PDFs, client links and email signatures still use the details built into them — changing these doesn't change those yet.
          </p>
          <SaveRow dirty={dirty} busy={busy} onReset={() => setF(stored)}
            onSave={() => {
              const c = clean();
              if (!c.name) return showError("Company name can't be blank.");
              run({ company: JSON.stringify(c) }, "Company details saved");
            }} />
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------- 2. Defaults ----------------
function DefaultsSection({ values, save }: { values: Record<string, string | null>; save: SaveFn }) {
  const stored = useMemo(() => ({
    days: values.proposal_valid_days?.trim() || String(DEFAULT_VALID_DAYS),
    terms: values.payment_terms ?? DEFAULT_PAYMENT_TERMS,
    review: values.google_review_url ?? "",
  }), [values.proposal_valid_days, values.payment_terms, values.google_review_url]);
  const [f, setF] = useState(stored);
  useEffect(() => setF(stored), [stored]);
  const { busy, run } = useSaver(save);
  const dirty = f.days !== stored.days || f.terms !== stored.terms || f.review !== stored.review;
  const daysN = Number(f.days);
  const daysBad = !Number.isInteger(daysN) || daysN < 1 || daysN > 365;

  return (
    <section>
      <SectionTitle>Defaults</SectionTitle>
      <Card>
        <CardContent className="space-y-3 pt-4">
          <Field label="Proposals valid for (days)">
            <Input type="number" inputMode="numeric" min={1} max={365} value={f.days} onChange={(e) => setF((s) => ({ ...s, days: e.target.value }))} className="max-w-[140px]" />
            {daysBad && f.days !== "" ? <p className="mt-1 text-xs text-red-300">Enter a whole number of days, 1–365.</p> : null}
            <p className="mt-1 text-xs text-neutral-500">Sets the expiry date on new client links — from Build &amp; price and when you create a link on Proposals sent. Links already sent keep their date.</p>
          </Field>
          <Field label="Payment terms">
            <Input value={f.terms} onChange={(e) => setF((s) => ({ ...s, terms: e.target.value }))} />
            <p className="mt-1 text-xs text-neutral-500">Used on new jobs and client links when the customer has no terms of their own on file. Terms saved on a customer always win.</p>
          </Field>
          <Field label="Google review link">
            <Input type="url" inputMode="url" placeholder="https://g.page/r/…/review" value={f.review} onChange={(e) => setF((s) => ({ ...s, review: e.target.value }))} />
            <p className="mt-1 text-xs text-neutral-500">The link sent when you ask a client for a review (Day sheet and Reviews &amp; referrals).</p>
          </Field>
          <SaveRow dirty={dirty} busy={busy} onReset={() => setF(stored)}
            onSave={() => {
              if (daysBad) return showError("Proposal validity must be a whole number of days, 1–365.");
              const review = f.review.trim();
              if (review && !/^https?:\/\//i.test(review)) return showError("The review link should start with https://");
              run({
                proposal_valid_days: String(daysN),
                payment_terms: f.terms.trim() || DEFAULT_PAYMENT_TERMS,
                google_review_url: review || null,
              }, "Defaults saved");
            }} />
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------- 3. Alerts ----------------
const ALERTS: { key: keyof PushPrefs; label: string }[] = [
  { key: "proposal_signed", label: "Client signs a proposal" },
  { key: "punch_client", label: "Property manager adds a punch item" },
  { key: "punch_signoff", label: "Punch list signed off" },
  { key: "vendor_upload", label: "Vendor sends a COI or W-9" },
  { key: "coi_expiring", label: "A COI is expiring (checked each morning)" },
];

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className="flex min-h-[44px] w-full items-center gap-3 py-1.5 text-left">
      <span className="flex-1 text-sm text-neutral-100">{label}</span>
      <span className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-white bg-white" : "border-white/15 bg-neutral-900")}>
        <span className={cn("absolute size-[18px] rounded-full transition-all", checked ? "left-[22px] bg-neutral-900" : "left-[3px] bg-neutral-500")} />
      </span>
    </button>
  );
}

function AlertsSection({ raw, save }: { raw: string | null; save: SaveFn }) {
  const stored = useMemo(() => parseJSON<PushPrefs>(raw, DEFAULT_PUSH_PREFS), [raw]);
  const [prefs, setPrefs] = useState<PushPrefs>(stored);
  useEffect(() => setPrefs(stored), [stored]);
  const { busy, run } = useSaver(save);
  const dirty = ALERTS.some((a) => prefs[a.key] !== stored[a.key]);

  const [status, setStatus] = useState<PushStatus | null>(null);
  const [working, setWorking] = useState<"on" | "off" | "test" | null>(null);
  async function refresh() {
    try { setStatus(pushSupported() ? await pushStatus() : "unsupported"); }
    catch { setStatus("unsupported"); }
  }
  useEffect(() => { refresh(); }, []);

  async function turnOn() {
    setWorking("on");
    try { await enablePush(); showToast("Alerts on for this device"); }
    catch (e: any) { showError(e?.message ?? "Couldn't turn on alerts."); }
    finally { setWorking(null); refresh(); }
  }
  async function turnOff() {
    if (!(await ask({ title: "Turn off alerts on this device?", body: "Your other devices keep getting them.", confirm: "Turn off" }))) return;
    setWorking("off");
    try { await disablePush(); showToast("Alerts off for this device"); }
    catch (e: any) { showError(e?.message ?? "Couldn't turn off alerts."); }
    finally { setWorking(null); refresh(); }
  }
  async function test() {
    setWorking("test");
    try { await sendTestPush(); showToast("Test alert sent — it should arrive in a few seconds"); }
    catch (e: any) { showError(e?.message ?? "Couldn't send a test alert."); }
    finally { setWorking(null); }
  }

  const badge = status === "on" ? <Badge variant="success">On</Badge>
    : status === "off" ? <Badge variant="muted">Off</Badge>
    : status === "denied" ? <Badge variant="danger">Blocked</Badge>
    : status === "unsupported" ? <Badge variant="muted">Not available</Badge>
    : null;

  return (
    <section>
      <SectionTitle>Alerts</SectionTitle>
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">This device</span>
            {badge}
          </div>

          {status === null ? <p className="mt-2 text-sm text-neutral-500">Checking…</p> : null}

          {status === "unsupported" ? (
            <div className="mt-2 space-y-1.5 text-sm text-neutral-400">
              <p>This browser can't get alerts as it's open right now.</p>
              <p><span className="font-semibold text-neutral-200">iPhone:</span> add Isola to your Home Screen (Share → Add to Home Screen), then open it from the Home Screen icon and turn alerts on here.</p>
              <p><span className="font-semibold text-neutral-200">Android or desktop Chrome:</span> alerts work right in the browser.</p>
            </div>
          ) : null}

          {status === "denied" ? (
            <p className="mt-2 text-sm text-neutral-400">Notifications are blocked for Isola. Allow them in this browser's or phone's settings for this site, then come back and turn alerts on.</p>
          ) : null}

          {status === "off" || status === "on" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {status === "off" ? (
                <Button variant="outline" onClick={turnOn} disabled={!!working}><Bell size={16} /> {working === "on" ? "Turning on…" : "Turn on"}</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={turnOff} disabled={!!working}><BellOff size={16} /> {working === "off" ? "Turning off…" : "Turn off"}</Button>
                  <Button variant="outline" onClick={test} disabled={!!working}><Send size={16} /> {working === "test" ? "Sending…" : "Send a test alert"}</Button>
                </>
              )}
            </div>
          ) : null}

          <div className="mt-5 border-t border-border pt-3">
            <p className="mb-1 text-[13px] font-semibold text-neutral-400">Alert me when</p>
            <div className="divide-y divide-white/[0.05]">
              {ALERTS.map((a) => (
                <Switch key={a.key} label={a.label} checked={prefs[a.key]} onChange={(v) => setPrefs((s) => ({ ...s, [a.key]: v }))} />
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500">These choices apply to every device you've turned alerts on for.</p>
            <SaveRow dirty={dirty} busy={busy} onReset={() => setPrefs(stored)}
              onSave={() => run({ push_prefs: JSON.stringify(prefs) }, "Alert choices saved")} />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------- 4. Menu (this device) ----------------
function readLS<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}

function MenuSection() {
  const [pins, setPins] = useState<string[] | null>(null);
  const [shutCount, setShutCount] = useState(0);

  function sync() {
    const p = readLS<unknown>(PINS_KEY, []);
    setPins(Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : []);
    const s = readLS<unknown>(SHUT_KEY, []);
    setShutCount(Array.isArray(s) ? s.length : s && typeof s === "object" ? Object.values(s).filter(Boolean).length : 0);
  }
  useEffect(() => {
    sync();
    window.addEventListener("isola:pins", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("isola:pins", sync); window.removeEventListener("storage", sync); };
  }, []);

  function write(next: string[]) {
    setPins(next);
    try { localStorage.setItem(PINS_KEY, JSON.stringify(next)); } catch { showError("Couldn't save on this device."); return; }
    window.dispatchEvent(new Event("isola:pins"));
  }
  const move = (i: number, d: -1 | 1) => {
    if (!pins) return;
    const j = i + d;
    if (j < 0 || j >= pins.length) return;
    const n = [...pins];
    [n[i], n[j]] = [n[j], n[i]];
    write(n);
  };
  const remove = (href: string) => {
    if (!pins) return;
    write(pins.filter((h) => h !== href));
    showToast("Unpinned");
  };
  function resetShut() {
    try { localStorage.removeItem(SHUT_KEY); } catch { /* ignore */ }
    window.dispatchEvent(new Event("isola:pins"));
    setShutCount(0);
    showToast("Menu sections reset — they open fully next time the app loads");
  }

  const label = (href: string) => ALL_ITEMS.find((x) => x.item.href === href);

  return (
    <section>
      <SectionTitle>Menu</SectionTitle>
      <Card>
        <CardContent className="pt-4">
          <p className="text-[13px] font-semibold text-neutral-400">Pinned screens</p>
          {pins === null ? null : pins.length === 0 ? (
            <p className="mt-1 text-sm text-neutral-500">Nothing pinned. Pin a screen from the menu to keep it at the top.</p>
          ) : (
            <ul className="mt-1 divide-y divide-white/[0.05]">
              {pins.map((href, i) => {
                const hit = label(href);
                const Icon = hit?.item.icon;
                return (
                  <li key={href} className="flex min-h-[48px] items-center gap-2 py-1">
                    {Icon ? <Icon size={16} className="shrink-0 text-neutral-400" /> : null}
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">
                      {hit?.item.label ?? href}
                      {hit?.group ? <span className="ml-1.5 text-xs text-neutral-500">{hit.group.label}</span> : null}
                    </span>
                    <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></Button>
                    <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === pins.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Unpin ${hit?.item.label ?? href}`} onClick={() => remove(href)}><X size={16} /></Button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={resetShut} disabled={shutCount === 0}>Reset collapsed sections</Button>
            <span className="text-xs text-neutral-500">{shutCount ? `${shutCount} section${shutCount === 1 ? "" : "s"} collapsed` : "All sections open"}</span>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Pins and collapsed sections are saved on this device only.</p>
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------- 5. App & account ----------------
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function AppSection() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null), () => setEmail(null));
    try {
      setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);
    } catch { /* ignore */ }
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setInstallEvt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  async function install() {
    if (!installEvt) return;
    try {
      await installEvt.prompt();
      const r = await installEvt.userChoice;
      if (r.outcome === "accepted") showToast("Installing Isola");
    } catch (e: any) {
      showError("Couldn't start the install: " + (e?.message ?? String(e)));
    } finally {
      setInstallEvt(null);
    }
  }

  async function signOut() {
    if (!(await ask({ title: "Sign out?", confirm: "Sign out" }))) return;
    (document.getElementById("settings-logout-form") as HTMLFormElement | null)?.requestSubmit();
  }

  return (
    <section>
      <SectionTitle>App</SectionTitle>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Smartphone size={16} className="text-neutral-400" />
            <span className="text-sm font-semibold text-white">Install on your phone</span>
            {installed ? <Badge variant="success">Installed</Badge> : null}
          </div>
          {installed ? (
            <p className="mt-1 text-sm text-neutral-400">You're using the installed app on this device.</p>
          ) : (
            <div className="mt-2 space-y-1.5 text-sm text-neutral-400">
              <p><span className="font-semibold text-neutral-200">iPhone (Safari):</span> tap Share → Add to Home Screen.</p>
              <p><span className="font-semibold text-neutral-200">Android (Chrome):</span> tap the ⋮ menu → Install app.</p>
              {installEvt ? (
                <Button variant="outline" className="mt-2" onClick={install}><Download size={16} /> Install</Button>
              ) : null}
            </div>
          )}
          <p className="mt-3 text-xs text-neutral-500">Isola On The Go v{APP_VERSION}</p>

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-sm font-semibold text-white">Account</p>
            <p className="mt-1 text-sm text-neutral-400">
              Signed in as <span className="text-neutral-100">{email === undefined ? "…" : email ?? "unknown"}</span>
            </p>
            <p className="mt-3 text-sm text-neutral-400">Labor rates and crew logins live on Crew &amp; time.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/crew"><HardHat size={16} /> Crew &amp; time</Link>
              </Button>
              <Button variant="outline" onClick={signOut}><LogOut size={16} /> Sign out</Button>
            </div>
            <form id="settings-logout-form" action={logout} className="hidden" />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
