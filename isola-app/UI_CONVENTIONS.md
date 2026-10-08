# Isola On The Go — UI conventions (v4.8)

Every screen should look and behave like Home and Jobs (`components/home/HomeScreen.tsx`,
`components/jobs/JobsScreen.tsx`). Black and white, one white primary button per screen.

## Building blocks — use these, don't hand-roll
| Need | Use |
|---|---|
| Page title row + actions | `PageHeader` from `@/components/ui/bits` (title, sub, actions) |
| Section heading | `SectionTitle` from `@/components/ui/bits` |
| KPI / count tile | `Stat` from `@/components/ui/bits` (tone "ok" / "warn" / "bad", onClick for filters) |
| Panel / list row container | `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card` |
| Buttons | `Button` from `@/components/ui/button` — variants: default (the one white primary), outline, ghost, destructive, success, link; sizes sm / default / lg / icon |
| Inputs | `Input`, `Textarea`, `NativeSelect`, `Field` (label + control), `Label` from `@/components/ui/input` |
| Status chip | `Badge` from `@/components/ui/badge` |
| Filter pills / view switch | `Segmented` from `@/components/ui/tabs` (or outline Buttons) |
| Forms that pop up | `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` (`@/components/ui/dialog`) or `Sheet` (`@/components/ui/sheet`) |
| Tables (desktop) | `TableWrap, Table, THead, TBody, TR, TH, TD` from `@/components/ui/table` |
| Empty list | `Empty` from `@/components/ui/bits` (title, body, action) |
| Loading | `ListSkeleton` from `@/components/ui/bits` |
| Load failed | `LoadError` from `@/components/ui/bits` (onRetry) — never leave skeletons spinning forever |
| Icons | `lucide-react` — no emoji as UI icons |
| `cn()` | `@/lib/utils` |

Colors: use the theme tokens (`bg-card`, `border-border`, `text-muted-foreground`) plus
`text-white / text-neutral-300/400/500`. Status color only for meaning: emerald = good/done,
amber = due soon/warning, red = overdue/error, sky = new/needs review.

## Feedback — no browser pop-ups
`alert()`, `confirm()` and `prompt()` are not allowed (they block the phone and look broken).
| Old | New |
|---|---|
| `alert("Save failed: " + e.message)` | `showError("Save failed: " + e.message)` from `@/components/Toaster` |
| `alert("Saved")` / success notes | `showToast("Saved")` |
| `alert("Give it a title.")` (validation) | `showError("Give it a title.")` — or inline red text under the field |
| `if (!confirm("Delete X?")) return; await del(); load();` | Prefer `undoable({ text: "Deleted X", hide, restore, commit })` from `@/components/Toaster` (row disappears, Undo puts it back). Otherwise `if (!(await ask({ title: "Delete X?", confirm: "Delete", danger: true }))) return;` from `@/components/Dialogs` |
| other `confirm(...)` | `await ask({ title, body?, confirm: "Verb" })` → boolean |
| `prompt("Label", initial)` | `await askText({ title, initial })` → string or null (null = cancelled) |
| `prompt("Copy this link:", url)` / clipboard | `await copyText(url, "Link copied")` from `@/components/Dialogs` |
| Pop-up blocked when opening a file | `showError("Allow pop-ups to view the file.")` |

`ask`/`askText`/`copyText` return Promises — the calling function must be `async`.
Public pages (`/p/`, `/punch/`, `/vendor-submit`, `/clock`) have no DialogHost: show inline messages there.

## Loading pattern
```tsx
const [rows, setRows] = useState<any[] | null>(null);
const [err, setErr] = useState<string | null>(null);
async function load() {
  setErr(null);
  try {
    const [a, b] = await withTimeout(Promise.all([q1, q2]));   // @/lib/load
    const e = firstError(a, b);                                 // @/lib/load
    if (e) throw new Error(e);
    setRows(a.data ?? []);
  } catch (e: any) { setErr(e?.message === "timeout" ? "No response — check your signal." : e?.message); }
}
if (err) return <LoadError message={err} onRetry={load} />;
if (!rows) return <ListSkeleton />;
```

## Layout
- Page column width comes from `MainFrame` (5xl by default). Don't wrap screens in your own max-width.
- Lists: one column on phone; on `md:` and up use a 2–3 column grid of Cards or a table where rows have many fields.
- Floating buttons: use the page's PageHeader `actions` on desktop. The global + (QuickAdd) already exists on phone.
- Touch targets ≥ 40px tall on anything tapped in the field.
- Keep all existing behavior, queries, columns and business rules. This is a visual/UX pass, not a rewrite of logic.
