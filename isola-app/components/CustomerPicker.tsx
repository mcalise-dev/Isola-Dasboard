"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TYPES } from "@/components/customers/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { showError, showToast } from "@/components/Toaster";
import { cn } from "@/lib/utils";
import { Check, Plus, X } from "lucide-react";

/* v7.0 (10/22/26) — pick a customer OR type a new one, right where you are.
   Type to search the list. If nothing matches, "Add as new customer" creates it
   on the spot (with a client type, which drives pricing tier).
   Spelling rule still holds: an exact match (ignoring case, spaces and punctuation,
   archived customers included) always picks the existing record — no new variants. */

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export default function CustomerPicker({
  customers, value, onPick, onCreated, placeholder = "Type a customer name…", autoFocus,
}: {
  customers: any[];
  value: { id: string | null; name: string | null };
  onPick: (c: any | null) => void;
  onCreated?: (c: any) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState(value.name ?? "");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState("property_mgmt");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { setQ(value.name ?? ""); }, [value.id, value.name]);
  useEffect(() => {
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); setAdding(false); } };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, []);

  const term = norm(q);
  const matches = term ? customers.filter((c) => norm(c.name).includes(term)).slice(0, 8) : customers.slice(0, 8);
  const exact = customers.find((c) => norm(c.name) === term);
  const picked = value.id && value.name && q === value.name;

  function pick(c: any) { onPick(c); setQ(c.name); setOpen(false); setAdding(false); }

  async function create() {
    const name = q.trim().replace(/\s+/g, " ");
    if (!name) return;
    setBusy(true);
    // catch archived records and spelling twins the active list doesn't hold
    const { data: all } = await supabase.from("customers").select("id,name,client_type,archived,contact_name,phone,email,payment_terms");
    const twin = (all ?? []).find((c: any) => norm(c.name) === norm(name));
    if (twin) {
      if (twin.archived) await supabase.from("customers").update({ archived: false }).eq("id", twin.id);
      setBusy(false);
      showToast(`Using existing customer "${twin.name}"`);
      onCreated?.(twin); pick(twin);
      return;
    }
    const { data, error } = await supabase.from("customers").insert({ name, client_type: type }).select("id,name,client_type,contact_name,phone,email,payment_terms").single();
    setBusy(false);
    if (error) return showError("Couldn't add the customer: " + error.message);
    showToast(`Added ${name}`);
    onCreated?.(data); pick(data);
  }

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Input value={q} autoFocus={autoFocus} placeholder={placeholder}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setAdding(false); if (value.id) onPick(null); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); if (exact) pick(exact); else if (matches.length === 1) pick(matches[0]); else if (q.trim()) { setOpen(true); setAdding(true); } }
            if (e.key === "Escape") setOpen(false);
          }}
          className={cn("pr-9", picked && "border-emerald-500/50")} />
        {picked ? <Check size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400" />
          : q ? <button type="button" aria-label="Clear" onClick={() => { setQ(""); onPick(null); setOpen(true); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-white"><X size={15} /></button> : null}
      </div>

      {open && !picked ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-neutral-950 shadow-xl">
          {!adding ? (
            <>
              {matches.map((c) => (
                <button type="button" key={c.id} onClick={() => pick(c)}
                  className="flex min-h-[42px] w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-white/[0.06]">
                  <span className="truncate text-neutral-100">{c.name}</span>
                  <span className="shrink-0 text-xs text-neutral-500">{TYPES[c.client_type]?.label ?? ""}</span>
                </button>
              ))}
              {q.trim() && !exact ? (
                <button type="button" onClick={() => setAdding(true)}
                  className="flex min-h-[44px] w-full items-center gap-2 border-t border-border px-3 text-left text-sm font-semibold text-white hover:bg-white/[0.06]">
                  <Plus size={15} /> Add &ldquo;{q.trim()}&rdquo; as a new customer
                </button>
              ) : null}
              {!matches.length && !q.trim() ? <div className="px-3 py-3 text-sm text-neutral-500">Start typing a name.</div> : null}
            </>
          ) : (
            <div className="space-y-2.5 p-3">
              <div className="text-sm text-neutral-300">New customer: <b className="text-white">{q.trim()}</b></div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(TYPES).map(([k, v]) => (
                  <button type="button" key={k} onClick={() => setType(k)}
                    className={cn("h-9 rounded-md border px-2.5 text-xs font-semibold", type === k ? "border-white bg-white text-neutral-950" : "border-border text-neutral-400 hover:text-white")}>
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-500">{TYPES[type]?.hint} Add contact info later on the Customers tab.</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setAdding(false)}>Back</Button>
                <Button type="button" className="flex-1" disabled={busy} onClick={create}>{busy ? "Adding…" : "Add customer"}</Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
