import { Form, InputNumber } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { rateForTotal, totalFreight } from "../form/freightLink";
import { useFormContext } from "./context";
import { TOTAL_FREIGHT_STEP } from "./fieldSteps";

// A linked view of quantity x freight rate. Editing it (typing or the arrows) holds the quantity fixed and solves the
// freight rate, which is then an ordinary form edit (dirty, recalculation, results). What the user typed is not rewritten
// while they type; any other change of quantity or rate makes it follow the product again.
export function TotalFreightField() {
  const { t } = useTranslation();
  const { values, setField } = useFormContext();
  const derived = totalFreight(values.quantity, values.freight_rate);
  const shown = derived === null ? null : Number(derived.toFixed(2));
  // undefined = not being edited (follow the product); otherwise what the user last entered
  const [typed, setTyped] = useState<number | null | undefined>(undefined);
  const [hintKey, setHintKey] = useState<string | null>(null);
  const label = t("fields.total_freight");

  // A change that did not come from this field (the product moved away from what was typed) ends the "editing" state.
  // The tolerance covers the 6-decimal rounding of the solved rate, which can move the product by a little.
  const tolerance = Math.max(0.005, Math.abs(values.quantity ?? 0) * 1e-6);
  useEffect(() => {
    if (typed === undefined) return;
    if (typed === null || shown === null || Math.abs(shown - typed) > tolerance) {
      setTyped(undefined);
      setHintKey(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const onChange = (v: number | null) => {
    setTyped(v);
    if (v === null) return setHintKey(null); // nothing to solve; it snaps back on blur
    const r = rateForTotal(v, values.quantity);
    if (r.ok) {
      setHintKey(null);
      setField("freight_rate", r.rate);
    } else {
      setHintKey(r.reason === "needQuantity" ? "needQuantity" : "mustBeGreaterThanZero");
    }
  };

  return (
    <Form.Item label={<span>{label}</span>} validateStatus={hintKey ? "error" : undefined} help={hintKey ? t(`hints.${hintKey}`) : undefined}>
      <InputNumber
        aria-label={label}
        style={{ width: "100%" }}
        step={TOTAL_FREIGHT_STEP}
        status={hintKey ? "error" : undefined}
        value={typed !== undefined ? typed : shown}
        formatter={(v, info) => (info.userTyping ? info.input : v === undefined || String(v) === "" ? "" : String(Number(v)))}
        onChange={onChange}
        onBlur={() => {
          setTyped(undefined);
          setHintKey(null);
        }}
      />
    </Form.Item>
  );
}
