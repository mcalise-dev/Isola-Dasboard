// Turns any US phone number inside a piece of text into a tap-to-call link.
// Used for task titles ("Call Case Materials 508-695-1461 …") so the number is one tap.
import { Fragment, type ReactNode } from "react";

const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

export const telHref = (raw: string) => "tel:" + raw.replace(/[^\d+]/g, "");

export function withPhoneLinks(text: string | null | undefined): ReactNode {
  const s = String(text ?? "");
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of s.matchAll(PHONE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(s.slice(last, i));
    out.push(
      <a key={i} href={telHref(m[0])} onClick={(e) => e.stopPropagation()}
        className="whitespace-nowrap font-semibold text-brand underline underline-offset-2">{m[0]}</a>,
    );
    last = i + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out.length ? <Fragment>{out}</Fragment> : s;
}
