"use client";
// Audit log (spec §10, §12): every proposal, approval, refusal, execution and connection
// change, in order. Rows can't be edited or removed.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Empty } from "@/components/ui/bits";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ScrollText } from "lucide-react";

const EVENT_LABEL: Record<string, string> = {
  proposed: "Drafted", edited: "Edited", approved: "Approved", approve_denied: "Approval refused", approval_invalidated: "Approval cancelled by an edit",
  rejected: "Rejected", revoked: "Approval withdrawn", execution_started: "Sending started", execution_confirmed: "Sent / done",
  execution_failed: "Failed, nothing sent", execution_blocked: "Blocked by policy", proposal_blocked: "Draft blocked",
  writes_enabled: "Outbound actions turned on", writes_disabled: "Outbound actions turned off", writes_change_denied: "Switch change refused",
  connection_started: "Connection started", connection_connected: "Connected", connection_error: "Connection error",
  connection_setup_required: "Disconnected", connection_test_ok: "Connection check passed", connection_test_failed: "Connection check failed",
};

export default function AuditScreen() {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<"all" | "refused">("all");
  const [q, setQ] = useState("");
  useEffect(() => { sb.from("mkt_audit_events").select("*").order("at", { ascending: false }).limit(500).then(({ data }) => setRows(data ?? [])); }, [sb]);
  const shown = (rows ?? []).filter((r) => (filter === "all" || !r.ok) && (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <PageHeader title="Audit log" sub="Every draft, approval, refusal, send attempt and connection change. Entries can't be edited or removed."
        actions={<Segmented value={filter} onChange={(v) => setFilter(v as "all" | "refused")} options={[{ value: "all", label: "All" }, { value: "refused", label: "Refused / failed" }]} />} />
      <Input id="audit-q" className="mb-3 md:w-80" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
      {rows === null ? <div className="skeleton h-40" /> : !shown.length ? <Empty icon={<ScrollText size={26} />} title="Nothing logged yet" body="Entries appear the moment anything is drafted, approved, refused or connected." /> : (
        <TableWrap>
          <Table>
            <THead><TR><TH>When</TH><TH>What</TH><TH>Source</TH><TH>Details</TH></TR></THead>
            <TBody>
              {shown.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-xs text-neutral-400">{new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</TD>
                  <TD><Badge variant={r.ok ? "default" : "danger"}>{EVENT_LABEL[r.event] ?? r.event}</Badge></TD>
                  <TD className="text-xs text-neutral-400">{r.connector ?? "—"}</TD>
                  <TD className="max-w-[420px] truncate text-xs text-neutral-400" title={JSON.stringify(r.detail)}>
                    {r.detail?.reason ?? r.detail?.title ?? r.detail?.error ?? (r.detail?.recipients ? `To ${[].concat(r.detail.recipients).join(", ")}` : "")}
                    {r.action_id ? <span className="ml-1 text-neutral-600">#{String(r.action_id).slice(0, 8)}</span> : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
