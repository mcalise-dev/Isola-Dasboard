"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { showToast } from "@/components/Toaster";

/* v4.8: in-app replacements for the browser's confirm() and prompt().
     if (!(await ask({ title: "Delete this cost?", confirm: "Delete", danger: true }))) return;
     const name = await askText({ title: "Rename job", initial: job.job_name });  // null = cancelled
     await copyText(url, "Link copied");
   <DialogHost /> is mounted once in the app layouts. Bottom sheet on a phone. */

type AskReq = {
  kind: "ask" | "text";
  title: string;
  body?: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
  label?: string;
  initial?: string;
  placeholder?: string;
  multiline?: boolean;
  readOnly?: boolean;
  resolve: (v: any) => void;
};
const EVT = "isola:dialog";

function open(req: Omit<AskReq, "resolve">) {
  return new Promise<any>((resolve) => {
    if (typeof window === "undefined") return resolve(req.kind === "ask" ? false : null);
    window.dispatchEvent(new CustomEvent(EVT, { detail: { ...req, resolve } }));
  });
}

export function ask(o: { title: string; body?: string; confirm?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return open({ kind: "ask", ...o });
}

export function askText(o: { title: string; body?: string; label?: string; initial?: string; placeholder?: string; confirm?: string; multiline?: boolean }): Promise<string | null> {
  return open({ kind: "text", ...o });
}

// Copy to clipboard; if the browser refuses, show the text selectable in a sheet.
export async function copyText(text: string, done = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    showToast(done);
  } catch {
    await open({ kind: "text", title: "Copy this", initial: text, readOnly: true, confirm: "Done" });
  }
}

export default function DialogHost() {
  const [req, setReq] = useState<AskReq | null>(null);
  const [val, setVal] = useState("");
  const queue = useRef<AskReq[]>([]);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const r = (e as CustomEvent).detail as AskReq;
      setReq((cur) => {
        if (cur) { queue.current.push(r); return cur; }
        setVal(r.initial ?? "");
        return r;
      });
    };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);

  useEffect(() => {
    if (req?.kind === "text") setTimeout(() => { inputRef.current?.focus(); if (req.readOnly) inputRef.current?.select(); }, 50);
  }, [req]);

  function finish(v: any) {
    req?.resolve(v);
    const next = queue.current.shift() ?? null;
    setVal(next?.initial ?? "");
    setReq(next);
  }
  const cancelValue = req?.kind === "ask" ? false : null;
  const okValue = () => (req?.kind === "ask" ? true : req?.readOnly ? null : val);

  return (
    <Dialog open={!!req} onOpenChange={(o) => { if (!o) finish(cancelValue); }}>
      {req ? (
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); finish(okValue()); }}>
            <DialogHeader>
              <DialogTitle>{req.title}</DialogTitle>
              {req.body ? <DialogDescription className="whitespace-pre-line">{req.body}</DialogDescription> : null}
            </DialogHeader>
            {req.kind === "text" ? (
              <div className="space-y-1.5">
                {req.label ? <label className="text-sm font-medium text-neutral-300">{req.label}</label> : null}
                {req.multiline || req.readOnly ? (
                  <Textarea ref={inputRef} rows={req.readOnly ? 3 : 4} value={val} readOnly={req.readOnly}
                    placeholder={req.placeholder} onChange={(e) => setVal(e.target.value)} />
                ) : (
                  <Input ref={inputRef} value={val} placeholder={req.placeholder} onChange={(e) => setVal(e.target.value)} />
                )}
              </div>
            ) : null}
            <DialogFooter>
              {!req.readOnly ? (
                <Button type="button" variant="outline" onClick={() => finish(cancelValue)}>{req.cancel ?? "Cancel"}</Button>
              ) : null}
              <Button type="submit" variant={req.danger ? "destructive" : "default"}>{req.confirm ?? (req.kind === "ask" ? "OK" : "Save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
