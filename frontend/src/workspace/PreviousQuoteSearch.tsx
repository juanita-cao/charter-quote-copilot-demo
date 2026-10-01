import { Alert, Button, Collapse, Input, Spin, Tag } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SearchFilters } from "../api/api";
import { useApi } from "../app/contexts";
import { usePreviousSearch } from "../hooks/queries";
import { buildHistoryRowsVM } from "../vm/history";
import { useWorkspace } from "./context";

const EMPTY = { route: "", cargo: "", vessel: "", dwt: "" };

// "Start from a previous quote": search quotes and drafts, click a result to fill the form (SA-24, SA-25). The
// overwrite guard is in requestLoad.
export function PreviousQuoteSearch() {
  const { t } = useTranslation();
  const api = useApi();
  const { requestLoad } = useWorkspace();
  const [draftFilters, setDraftFilters] = useState(EMPTY);
  const [submitted, setSubmitted] = useState<SearchFilters | null>(null);
  const query = usePreviousSearch(api, submitted);
  const rows = useMemo(() => (query.data ? buildHistoryRowsVM(query.data.quotes, query.data.drafts, "ALL") : []), [query.data]);

  const submit = () => {
    const f: SearchFilters = {};
    if (draftFilters.route.trim()) f.route = draftFilters.route.trim();
    if (draftFilters.cargo.trim()) f.cargo_description = draftFilters.cargo.trim();
    if (draftFilters.vessel.trim()) f.vessel_name = draftFilters.vessel.trim();
    const dwt = Number(draftFilters.dwt);
    if (draftFilters.dwt.trim() && Number.isFinite(dwt)) f.vessel_dwt = dwt;
    setSubmitted(f);
  };
  const box = (key: keyof typeof EMPTY, label: string) => (
    <Input
      aria-label={label}
      placeholder={label}
      value={draftFilters[key]}
      onChange={(e) => setDraftFilters((v) => ({ ...v, [key]: e.target.value }))}
      onPressEnter={submit}
    />
  );

  return (
    <Collapse
      className="previous-search"
      items={[
        {
          key: "previous",
          label: t("previous.title"),
          children: (
            <div className="previous-body">
              <div className="previous-filters">
                {box("route", t("previous.route"))}
                {box("cargo", t("previous.cargo"))}
                {box("vessel", t("previous.vessel"))}
                {box("dwt", t("previous.dwt"))}
                <Button onClick={submit}>{t("previous.search")}</Button>
              </div>
              {query.isFetching && <Spin size="small" />}
              {query.isError && <Alert type="error" showIcon message={t("previous.failed")} />}
              {query.isSuccess && rows.length === 0 && <div className="previous-empty">{t("previous.none")}</div>}
              {query.isSuccess && rows.length > 0 && (
                <ul className="previous-list">
                  {rows.map((row) => (
                    <li key={row.key}>
                      <button
                        type="button"
                        className="previous-row"
                        disabled={row.values === null}
                        title={row.values === null ? t("previous.unreadable") : undefined}
                        onClick={() => row.values && requestLoad({ source: "search", kind: row.kind, values: row.values, notice: row.notice })}
                      >
                        {row.kind === "draft" ? <Tag>{t("previous.draftTag")}</Tag> : <Tag color={row.typeLabel === "GO" ? "green" : "red"}>{row.typeLabel}</Tag>}
                        <span className="previous-main">{[row.route, row.cargo].filter(Boolean).join(" · ")}</span>
                        <span className="previous-date">{row.dateIso.slice(0, 10)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
