"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function FieldName() {
  const [me, setMe] = useState<{ name?: string; role?: string } | null>(null);
  useEffect(() => {
    createClient().rpc("crew_me").then(({ data }: any) => setMe(data ?? null));
  }, []);
  // Mike previewing the crew app gets a way back
  if (me?.role === "owner") return <a href="/home" className="text-xs text-amber-300 underline underline-offset-2">Preview — back to my app</a>;
  return <div className="text-xs text-neutral-400 truncate">{me?.name ? `Signed in as ${me.name}` : " "}</div>;
}
