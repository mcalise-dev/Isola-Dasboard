"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import JobRecord from "@/components/job/JobRecord";
import ThmBrand from "@/components/field/ThmBrand";

// Only open the job file if this login is the THM partner AND THM is on this job.
export default function ThmJobGate({ id }: { id: string }) {
  const sb = useMemo(() => createClient(), []);
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { sb.rpc("thm_partner_job", { p_job: id }).then(({ data }) => setOk(!!data)); }, [sb, id]);
  if (ok === null) return <div className="text-sm text-neutral-500">Loading…</div>;
  if (!ok) return (
    <div className="rounded-xl border border-white/10 p-4 text-sm text-neutral-300">
      This job isn't a THM job. <Link href="/field/thm" className="underline">Back to THM jobs</Link>
    </div>
  );
  return (
    <>
      <ThmBrand className="mb-4" />
      <JobRecord id={id} partner />
    </>
  );
}
