"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileText } from "lucide-react";
import { openDoc, docDate } from "@/lib/docfile";

// v6.6: owner view of crew documents (W-9s) on Crew & time. Lists metadata only;
// the file body is pulled when Mike taps a row.
export default function CrewDocs({ workers }: { workers: any[] }) {
  const sb = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState<any[] | null>(null);

  useEffect(() => {
    sb.from("crew_documents").select("id,worker_id,kind,file_name,uploaded_at").order("uploaded_at", { ascending: false })
      .then(({ data }) => setDocs(data ?? []));
  }, [sb]);

  const crew = workers.filter((w) => !w.is_owner && w.active);

  return (
    <div className="rounded-xl border border-white/[0.07] bg-neutral-900 px-3.5 py-3">
      <div className="text-sm font-semibold text-neutral-300">Crew documents</div>
      <p className="mt-1 text-sm text-neutral-400">W-9s the crew upload from the Docs tab in their app. Only you can see everyone's.</p>
      <div className="mt-2.5 divide-y divide-neutral-800">
        {crew.map((w) => {
          const mine = (docs ?? []).filter((d) => d.worker_id === w.id);
          const w9 = mine.filter((d) => d.kind === "w9");
          return (
            <div key={w.id} className="py-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 text-sm font-semibold text-white">{w.name}</div>
                {docs === null ? null : w9.length
                  ? <span className="text-xs font-semibold text-emerald-300">W-9 on file</span>
                  : <span className="text-xs font-semibold text-amber-300">No W-9</span>}
              </div>
              {mine.map((d) => (
                <button key={d.id}
                  onClick={() => openDoc(async () => { const { data } = await sb.rpc("crew_doc_get", { p_id: d.id }); return (data as any) ?? null; })}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 min-h-[40px] text-left text-sm text-neutral-300 hover:bg-white/[0.04]">
                  <FileText size={15} className="shrink-0" />
                  <span className="truncate">{d.kind === "w9" ? "W-9" : "Document"} · {d.file_name || "file"}</span>
                  <span className="ml-auto shrink-0 text-xs text-neutral-500">{docDate(d.uploaded_at)}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
