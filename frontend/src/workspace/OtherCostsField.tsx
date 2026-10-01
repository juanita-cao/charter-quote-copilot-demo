import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Form, Input, InputNumber } from "antd";
import { useTranslation } from "react-i18next";
import type { OtherCostRow } from "../form/fields";
import { useFormContext } from "./context";
import { OTHER_COST_STEP } from "./fieldSteps";

export const MAX_OTHER_COSTS = 20;

// "Others" (v1.1): any number of custom voyage costs, each a name and an amount. An untouched row is ignored; a
// half-filled one keeps the form incomplete.
export function OtherCostsField() {
  const { t } = useTranslation();
  const { values, setField } = useFormContext();
  const rows = values.other_costs;
  const set = (next: OtherCostRow[]) => setField("other_costs", next);
  const update = (i: number, patch: Partial<OtherCostRow>) => set(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const half = rows.some((r) => (r.name.trim() === "") !== (r.amount === null));
  const full = rows.length >= MAX_OTHER_COSTS;

  return (
    <Form.Item
      label={t("fields.other_costs")}
      validateStatus={half ? "error" : undefined}
      help={half ? t("hints.otherCostIncomplete") : undefined}
    >
      <div className="other-costs">
        {rows.map((row, i) => (
          <div className="other-row" key={i}>
            <Input aria-label={t("others.name", { n: i + 1 })} value={row.name} onChange={(e) => update(i, { name: e.target.value })} />
            <InputNumber
              aria-label={t("others.amount", { n: i + 1 })}
              style={{ width: 160 }}
              step={OTHER_COST_STEP}
              value={row.amount}
              formatter={(v, info) => (info.userTyping ? info.input : v === undefined || String(v) === "" ? "" : String(Number(v)))}
              onChange={(v) => update(i, { amount: typeof v === "number" ? v : null })}
            />
            <Button aria-label={t("others.remove", { n: i + 1 })} icon={<DeleteOutlined aria-hidden />} onClick={() => set(rows.filter((_, k) => k !== i))} />
          </div>
        ))}
        <div className="other-add">
          <Button icon={<PlusOutlined aria-hidden />} disabled={full} onClick={() => set([...rows, { name: "", amount: null }])}>
            {t("others.add")}
          </Button>
          {full && <span className="other-limit">{t("others.limit", { n: MAX_OTHER_COSTS })}</span>}
        </div>
      </div>
    </Form.Item>
  );
}
