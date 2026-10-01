import { Collapse, Form } from "antd";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { FormField } from "./FormField";
import { FIELD_GROUPS } from "./fieldGroups";

// memo: the form has no props and reads only the form context, so a Run or a result arriving never re-renders it.
export const WorkspaceForm = memo(function WorkspaceForm() {
  const { t } = useTranslation();
  return (
    <Form layout="vertical" requiredMark={false} onSubmitCapture={(e) => e.preventDefault()}>
      {/* forceRender keeps every field mounted, so values survive collapsing a group */}
      <Collapse
        defaultActiveKey={["cargo"]}
        items={FIELD_GROUPS.map((g) => ({
          key: g.key,
          label: t(`groups.${g.key}`),
          forceRender: true,
          children: g.rows.map((row, i) => (
            // a lone field keeps the group's column width instead of stretching across the whole row
            <div
              className="field-row"
              key={i}
              style={{
                gridTemplateColumns: row.some((f) => f.kind === "others" || f.kind === "voyagePorts")
                  ? "minmax(0, 1fr)" // the Others / voyage-ports lists use the whole row
                  : `repeat(${row.length === 1 ? Math.max(...g.rows.map((r) => r.length)) : row.length}, minmax(0, 1fr))`,
              }}
            >
              {row.map((f) => (
                <FormField key={f.name} def={f} />
              ))}
            </div>
          )),
        }))}
      />
      <p className="required-note">{t("workspace.requiredNote")}</p>
    </Form>
  );
});
