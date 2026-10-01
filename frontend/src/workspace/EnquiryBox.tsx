import { Button, Collapse, Input } from "antd";
import { useTranslation } from "react-i18next";
import { ENQUIRY_FIELD } from "./fieldGroups";
import { useFormContext } from "./context";

// "Start from an enquiry": where the operator pastes the customer's message. The text is kept with the quote and the
// draft (the cargo notes). It sits at the very top of the inputs, above "Start from a previous quote"; reading the
// enquiry and filling the form from it is the next step (design_problem.md PT-18, v1.2).
export function EnquiryBox() {
  const { t } = useTranslation();
  const { values, setField, recogniseFields } = useFormContext();
  return (
    <Collapse
      className="enquiry-box"
      defaultActiveKey={["enquiry"]}
      items={[
        {
          key: "enquiry",
          label: t("enquiry.title"),
          forceRender: true,
          children: (
            <div>
              <Input.TextArea
                aria-label={t(`fields.${ENQUIRY_FIELD}`)}
                placeholder={t("enquiry.placeholder")}
                autoSize={{ minRows: 4, maxRows: 14 }}
                maxLength={4000}
                value={values[ENQUIRY_FIELD] ?? ""}
                onChange={(e) => setField(ENQUIRY_FIELD, e.target.value === "" ? null : e.target.value)}
              />
              <div className="enquiry-box-footer">
                <Button size="small" onClick={recogniseFields}>
                  {t("enquiry.recognise")}
                </Button>
                <span className="enquiry-box-count">{(values[ENQUIRY_FIELD] ?? "").length} / 4000</span>
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}
