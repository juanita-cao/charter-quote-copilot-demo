import { InputNumber } from "antd";
import { memo } from "react";

// A number field with up / down arrows (always visible, see styles.css). The arrows never clamp: a value that breaks a
// rule still gets its hint from F-Field-Rules, exactly as a typed one does (the server stays authoritative).
function NumericInputBase({
  field,
  value,
  onChange,
  label,
  step,
  status,
  onBlur,
}: {
  field: string;
  value: number | null;
  onChange: (field: string, v: number | null) => void;
  label: string;
  step: number;
  status?: "error";
  /** Dismisses a recognised-value caption on blur (design_frontend.md §13's "touched" convention) — optional since
   * most numeric fields have no recogniser caption to dismiss. */
  onBlur?: () => void;
}) {
  return (
    <InputNumber
      aria-label={label}
      style={{ width: "100%" }}
      step={step}
      status={status}
      value={value === null || Number.isNaN(value) ? null : value}
      // Ant Design pads to the step's decimals ("22.0" for a 0.5 step); show 22, 22.5, 1.05 — but never touch what is being typed
      formatter={(v, info) => (info.userTyping ? info.input : v === undefined || String(v) === "" ? "" : String(Number(v)))}
      onChange={(v) => onChange(field, typeof v === "number" ? v : null)}
      onBlur={onBlur}
    />
  );
}

// memo: all props are primitives or the stable `setField`, so a field only re-renders when its own value changes.
export const NumericInput = memo(NumericInputBase);
