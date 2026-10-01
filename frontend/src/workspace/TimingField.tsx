import { Form, Segmented } from "antd";
import { useTranslation } from "react-i18next";
import { PORT_TIME } from "../form/fields";
import { validateField } from "../form/fieldRules";
import { NumericInput } from "./NumericInput";
import { useFormContext, useWorkspace } from "./context";
import type { FieldDef } from "./fieldGroups";
import { FIELD_STEPS } from "./fieldSteps";

// Loading / discharging time (v1.1): per port the operator gives the days directly or a rate per day. In rate mode the
// days are calculated by the BACKEND on Run and shown back read-only — the browser never divides.
export function TimingField({ def }: { def: FieldDef }) {
  const { t } = useTranslation();
  const { values, setField } = useFormContext();
  const { calc, verdictData } = useWorkspace();
  const port = def.name === PORT_TIME.loading.days ? PORT_TIME.loading : PORT_TIME.discharging;
  const which = port === PORT_TIME.loading ? "loading" : "discharging";
  const mode = values[port.mode] === "rate" ? "rate" : "days";
  const label = t(`fields.${port.mode}`);
  const inputField = mode === "rate" ? port.rate : port.days;
  const inputLabel = t(`fields.${inputField}`);
  const value = values[inputField] as number | null;
  const hintKey = validateField(inputField, value);

  const effective = calc.status === "READY" && verdictData ? verdictData.tce_result[`${which}_days`] : null;
  const set = setField as (f: string, v: unknown) => void;

  return (
    <Form.Item
      label={
        <span>
          {label} {mode === "rate" ? t("timing.unitRate") : t("timing.unitDays")}
          <span className="required-mark"> *</span>
        </span>
      }
      validateStatus={hintKey ? "error" : undefined}
      help={hintKey ? t(`hints.${hintKey}`) : undefined}
    >
      <div className="timing-field">
        <Segmented
          aria-label={label}
          size="small"
          block
          value={mode}
          options={[
            { label: t("timing.days"), value: "days" },
            { label: t("timing.rate"), value: "rate" },
          ]}
          onChange={(v) => set(port.mode, v)}
        />
        <NumericInput field={inputField} label={inputLabel} step={FIELD_STEPS[inputField]} value={value} onChange={set} status={hintKey ? "error" : undefined} />
        {mode === "rate" && (
          <span className="timing-calculated">
            {effective !== null ? t("timing.calculated", { days: Number(effective.toFixed(2)) }) : t("timing.onRun")}
          </span>
        )}
      </div>
    </Form.Item>
  );
}
