"use client";
// TEMPORARY one-off loader for proposal photos (11/24/26). Removed before go-live; the
// stage_proposal_photo RPC it calls is key-checked and dropped right after use.
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Page() {
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => setLog((l) => [...l, s]);
  async function onFile(f: File | undefined) {
    if (!f) return;
    const key = typeof window !== "undefined" ? window.location.hash.replace(/^#k=/, "") : "";
    const items = JSON.parse(await f.text()) as { proposal: string; sort: number; caption: string; src: string }[];
    add(`file read: ${items.length} photos`);
    const sb = createClient();
    let ok = 0;
    for (const it of items) {
      const { error } = await sb.rpc("stage_proposal_photo", { p_key: key, p_proposal: it.proposal, p_sort: it.sort, p_caption: it.caption, p_src: it.src });
      if (error) add(`FAIL ${it.sort} ${it.caption}: ${error.message}`); else { ok++; add(`ok ${it.sort} ${it.caption}`); }
    }
    add(`DONE ${ok} of ${items.length}`);
  }
  return (
    <main style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Photo stage</h1>
      <input type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files?.[0])} />
      <pre id="log">{log.join("\n")}</pre>
    </main>
  );
}
