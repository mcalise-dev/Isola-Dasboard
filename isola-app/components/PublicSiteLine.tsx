"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SiteLineJobBody from "@/components/siteline/JobBody";
import { Shell, YellowButton, PHONE, HEAD } from "@/components/siteline/ui";

/* Isola SiteLine — the client's no-login project page (/site/<token>). Every job has one.
   v7.5 (10/23/26): same look as the SiteLine example screen on isola-ri.com, so the website
   and the real thing match — white card, status pill, numbered steps, yellow-edged cards,
   big yellow contact button. Content stays the simple v7.3 set: signature first, where it
   stands, the work, updates, documents.
   Everything comes from public_siteline(token): the contract price the client agreed to,
   never costs, crew pay or internal notes.
   v89 (11/18/26): the page body lives in siteline/JobBody so the contact portal shows the same thing. */

export default function PublicSiteLine({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  async function load() {
    setFailed(false);
    const { data, error } = await supabase.rpc("public_siteline", { p_token: token });
    if (error) setFailed(true);
    setD(data);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  if (loading) {
    return (
      <Shell>
        <div className="space-y-3" aria-busy="true">
          <div className="h-3 w-1/3 animate-pulse bg-[#EEE]" />
          <div className="h-7 w-3/4 animate-pulse bg-[#EEE]" />
          <div className="h-20 animate-pulse bg-[#F3F3F3]" />
          <div className="h-16 animate-pulse bg-[#F3F3F3]" />
        </div>
      </Shell>
    );
  }
  if (failed || !d?.ok) {
    return (
      <Shell>
        <h1 className="text-[22px] font-extrabold text-[#111]" style={HEAD}>{failed ? "Couldn't load your project" : "This link isn't active"}</h1>
        <p className="mt-2 text-[14px] text-[#555]">{failed ? "Check your connection and try again." : `Call Isola at ${PHONE}, or get your current link below.`}</p>
        <div className="mt-5">
          {failed ? <YellowButton onClick={load}>Try again</YellowButton> : <YellowButton href="/siteline">Find my projects</YellowButton>}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <SiteLineJobBody d={d} token={token} />
    </Shell>
  );
}
