export type Contact = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  linkedin: string | null;
  address: string | null;
  prospect_type: string | null;
  lead_score: number | null;
  source: string | null;
  notes: string | null;
  tier: string | null;
  buildings: string | null;
  stage: string;
  li_status: string;
  em_status: string;
  last_touch: string | null;
  next_action: string | null;
  next_date: string | null;
  angle: string | null;
  sector: string | null;
  drafts: Record<string, string>;
};

export const STAGES = ["Not started", "Emailed", "Called", "Meeting", "Walk-through", "Proposal", "Won", "Dead", "Client"];
export const LI_STATUSES = ["Not Contacted", "Connection Sent", "Connected", "Message Sent", "Follow-up 1", "Follow-up 2", "Responded", "Conversation", "Not Interested"];
export const EM_STATUSES = ["Not Contacted", "Email Sent", "Follow-up 1", "Follow-up 2", "Responded", "Conversation", "Not Interested"];
export const SECTORS = ["Medical", "Commercial", "Banks"];
export const PTYPES = ["Property Manager", "Facilities Director", "Owner / Developer", "General Contractor", "Broker"];
export const TIER_ORDER: Record<string, number> = { A: 0, Client: 0, B: 1, C: 2, Broker: 3 };

export const scoreLetter = (n: number | null) => (n === 3 ? "A" : n === 2 ? "B" : "C");
export const firstName = (n: string) => n.trim().split(" ")[0].replace(",", "");
export const coShort = (n: string | null) => (n ?? "").replace(/\s*\(.*?\)\s*/g, "").replace(/\s*[–—-]\s*.*$/, "").trim();
export const isDue = (c: Contact) =>
  !!c.next_date && c.next_date <= new Date().toISOString().slice(0, 10) && !["Won", "Dead", "Client"].includes(c.stage);

export function bldg(c: Contact) {
  const a = (c.buildings ?? "").split("·")[0].trim();
  return a && !/not published/i.test(a) ? a : "";
}

export function genDrafts(c: Contact): Record<string, string> {
  const fn = firstName(c.name), co = coShort(c.company), b = bldg(c);
  const t = c.prospect_type ?? "Property Manager";
  const sec = c.sector ?? "Medical";
  const propWord = sec === "Banks" ? "bank branches" : sec === "Commercial" ? "commercial properties" : "medical properties";
  const town = b.split(",")[1] ? b.split(",")[1].trim().replace(/\s*0\d{4}$/, "") : "";
  const ref = b || (t === "General Contractor" ? "your projects" : "your properties") + " in Rhode Island";
  const D: Record<string, string> = {};
  D.li_conn = t === "General Contractor"
    ? `${fn} — I run Isola Excavation & Design in Providence. We sub masonry, concrete, asphalt patching and sitework for GCs around RI. Figured we should be connected.`
    : `${fn} — I run Isola Excavation & Design in Providence. We do masonry, concrete, drainage and asphalt work at ${propWord} around RI${town ? ` — we're out by ${town} a lot` : ""}. Figured we should be connected.`;
  D.li_msg = t === "Owner / Developer"
    ? `Thanks for connecting, ${fn}. Quick question — when something exterior needs fixing at ${ref}, do you have a go-to contractor for concrete and sitework, or does it vary by job?`
    : t === "General Contractor"
    ? `Thanks for connecting, ${fn}. Do you self-perform concrete and masonry on your RI jobs, or bring in subs? We've been picking up that scope for a few GCs and have room in the schedule.`
    : `Thanks for connecting, ${fn}. Quick question — how do you usually handle exterior repairs at ${ref}? Masonry, concrete, asphalt, drainage — that kind of thing. Asking because that's most of what we do at ${propWord} around Providence.`;
  D.li_fu1 = `${fn} — one thing worth knowing about us: we diagnose before we price. ${sec === "Banks" ? "Had a branch where the entrance walkway kept failing; turned out to be roof runoff, not the concrete." : "Had a medical office where the walkway kept failing; turned out to be roof runoff, not the concrete."} Fixed the drainage, then the flatwork — hasn't moved since. If anything at ${ref} keeps coming back after repairs, that's the kind of thing I'd look at.`;
  D.li_fu2 = `${fn} — I'll leave it here: if you ever want a second set of eyes on a problem area at ${ref}, I do free walk-throughs and you'd deal with me directly, not a salesman. Either way, good to be connected.`;
  const svc = t === "General Contractor" ? "masonry, concrete, asphalt patching and sitework as a sub"
    : t === "Owner / Developer" ? "masonry, concrete, drainage and asphalt work that protects how the property shows"
    : "concrete repair and grinding, masonry and brick work, asphalt patching, and drainage";
  D.em1_subj = b ? `Exterior work at ${b.split(",")[0]}` : `Exterior work — ${co}`;
  D.em1 = `${fn},\n\nI run Isola Excavation & Design out of Providence. ${b ? `I know ${b.split(",")[0]} — we do a lot of work on ${propWord} in that area.` : `We do a lot of exterior work on ${propWord} around RI.`}\n\nWhere we're different: we figure out why something is failing before pricing the fix, and I'm on every job myself. We're a one-stop shop for exterior repairs — for ${t === "General Contractor" ? "GCs" : "properties like yours"} that means ${svc}. One call covers it.\n\n${t === "General Contractor" ? "Do you bring in subs for that scope, or self-perform?" : "Do you typically use outside contractors for that type of work?"}\n\nMike Calise\nIsola Excavation & Design · Providence RI\n508-933-2661 · isola-ri.com`;
  D.em2 = `${fn},\n\nAttached a one-pager from a recent job — ${sec === "Medical" ? "a medical facility pipe repair we handled while the building stayed occupied" : "a concrete demo-and-replace at an occupied commercial property, done section by section so access never closed"}. Problem, diagnosis, fix, photos. One page.\n\nIf there's a spot at ${ref} that keeps needing attention, I'm happy to walk it with you — no charge, and you get a straight answer on what's actually causing it.\n\nMike`;
  D.em3 = `${fn},\n\nLast one from me. Heading into fall, two things worth repairing at ${ref} before winter locks them in: cracked or heaved walkways that freeze-thaw will make worse, and drainage problems that turn into ice${sec === "Banks" ? " — a slip-and-fall at a branch entrance is a liability nobody wants" : ""}. Fall is the right window to fix both.\n\nIf it's easier, keep my number for when something comes up: 508-933-2661. I answer my own phone.\n\nMike`;
  for (const k of Object.keys(D)) if (c.drafts && c.drafts[k]) D[k] = c.drafts[k];
  return D;
}
