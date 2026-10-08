"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showError } from "@/components/Toaster";
import { cn } from "@/lib/utils";

// v4.9: talk instead of type. Appends what you say to a field via onText(chunk).
// The chunk already carries a leading space when it follows earlier speech or the
// caller says the field has text (hasText). Hidden when the browser has no speech API.

type SpeechAlt = { transcript: string };
type SpeechResult = { isFinal: boolean; length: number; [i: number]: SpeechAlt };
type SpeechEvent = { resultIndex: number; results: { length: number; [i: number]: SpeechResult } };
type SpeechErrorEvent = { error: string };
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechCtor = new () => SpeechRec;

function getCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function Dictate({ onText, hasText, className }: { onText: (text: string) => void; hasText?: boolean; className?: string }) {
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<SpeechRec | null>(null);
  const said = useRef(false);
  const cb = useRef(onText);
  cb.current = onText;
  const filled = useRef(hasText);
  filled.current = hasText;

  useEffect(() => { setOk(!!getCtor()); }, []);
  useEffect(() => () => { try { rec.current?.abort(); } catch { /* ignore */ } }, []);

  function start() {
    const C = getCtor();
    if (!C) return;
    const r = new C();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;
    said.current = false;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = (res[0]?.transcript ?? "").trim();
        if (!t) continue;
        if (res.isFinal) {
          cb.current((said.current || filled.current ? " " : "") + t);
          said.current = true;
        } else live += (live ? " " : "") + t;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") showError("Microphone blocked — allow it in your browser settings.");
      else if (e.error !== "no-speech" && e.error !== "aborted") showError("Dictation stopped: " + e.error);
    };
    r.onend = () => { setOn(false); setInterim(""); rec.current = null; };
    rec.current = r;
    try { r.start(); setOn(true); } catch { setOn(false); rec.current = null; }
  }

  function stop() { try { rec.current?.stop(); } catch { /* ignore */ } }

  if (!ok) return null;
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Button type="button" variant="outline" size="icon"
        onClick={() => (on ? stop() : start())}
        aria-label={on ? "Stop dictation" : "Dictate"} aria-pressed={on}
        title={on ? (interim || "Listening…") : "Dictate"}
        className={cn(on && "animate-pulse border-red-500 bg-red-600/20 text-red-300 hover:bg-red-600/30")}>
        {on ? <MicOff size={16} /> : <Mic size={16} />}
      </Button>
    </span>
  );
}
