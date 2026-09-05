"use client";

/* ============================================================
   A number field with a permanent "$" sitting inside it.

   Mike was typing the dollar sign himself on every price. The glyph
   here is decoration — it is never part of the value, so what gets
   stored stays a clean number and jobs.price_amount can still parse
   whatever is written from it.

   Kept as type="number" with inputMode="decimal" so phones open the
   number pad. The spinner arrows are hidden because on a price field
   they are only ever a mis-tap.
   ============================================================ */

export default function MoneyInput({
  value,
  onChange,
  onBlur,
  placeholder = "0.00",
  className = "",
  autoFocus = false,
}: {
  value: any;
  onChange: (v: string) => void;
  onBlur?: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-neutral-400 select-none">
        $
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        autoFocus={autoFocus}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
        className={`${className} pl-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
    </div>
  );
}
