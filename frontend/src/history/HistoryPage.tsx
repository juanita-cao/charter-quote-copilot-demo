import { Alert, Button, Checkbox, DatePicker, Input, Modal, Table, Tag, Tooltip, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useApi } from "../app/contexts";
import { partitionTargets, type DeleteOutcome } from "../hooks/deleteTargets";
import { useBulkDelete, useExportRecords } from "../hooks/mutations";
import { useHistoryLists } from "../hooks/queries";
import type { HistoryQuery } from "../hooks/queryKeys";
import { historyReducer, initialHistoryState, type HistoryFilters, type HistoryPill, type MonthRange } from "../state/historyMachine";
import { buildHistoryRowsVM } from "../vm/history";
import type { HistoryRowVM } from "../vm/types";
import { useWorkspace } from "../workspace/context";
import { money } from "../workspace/format";
import { exportFilename, saveBlob } from "./download";
import { MAX_EXPORT_RECORDS, exportSelectionState } from "./exportKeys";

const MONTH = "YYYY-MM";
const defaultRange = (): MonthRange => [dayjs().startOf("year").format(MONTH), dayjs().format(MONTH)];
const BLANK = { route: "", cargo: "", vessel: "", dwt: "" };

function deleteMessage(t: TFunction, outcome: DeleteOutcome): { type: "success" | "error"; text: string } {
  const { report } = outcome;
  if (outcome.outcome === "allSucceeded") return { type: "success", text: t("history.deleted", { n: report.quotesDeleted + report.draftsDeleted }) };
  if (outcome.outcome === "allFailed") return { type: "error", text: t("history.deleteFailed") };
  const parts: string[] = [];
  if (!report.failed.includes("quotes") && report.quotesDeleted > 0) parts.push(t("history.deletedQuotes", { n: report.quotesDeleted }));
  if (!report.failed.includes("drafts") && report.draftsDeleted > 0) parts.push(t("history.deletedDrafts", { n: report.draftsDeleted }));
  if (report.failed.includes("quotes")) parts.push(t("history.quotesFailed"));
  if (report.failed.includes("drafts")) parts.push(t("history.draftsFailed"));
  return { type: "error", text: parts.join(" ") };
}

// History (IT-08, IT-13, IT-14): one list of quotes and drafts, search, select, delete, and load into the Workspace.
// M5 keeps the list dimension and the delete dimension apart; a response that no longer matches the current request is ignored.
export function HistoryPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { requestLoad } = useWorkspace();
  const [messageApi, messageHolder] = message.useMessage();
  const [state, dispatch] = useReducer(historyReducer, undefined, () => initialHistoryState(defaultRange()));
  const [inputs, setInputs] = useState(BLANK);
  const bulkDelete = useBulkDelete(api);
  const exporter = useExportRecords(api);
  const exporting = useRef(false); // a state flag is one render late for two clicks in the same tick

  const query: HistoryQuery = state.filters ? { mode: "search", filters: state.filters } : { mode: "range", monthRange: state.monthRange };
  const lists = useHistoryLists(api, query, state.listSeq);

  // The query is keyed by listSeq, so a settled, non-placeholder result always belongs to the current request.
  // Each request is reported once: with data already cached (coming back to this page) the result exists at mount, and
  // StrictMode runs the effect twice before the first dispatch has been applied — the second, identical event would be
  // an illegal one for the state machine and blank the page (found by the real-backend smoke run, 2026-09-21).
  const reportedSeq = useRef(0);
  useEffect(() => {
    if (state.listStatus !== "LOADING" || lists.isPlaceholderData || reportedSeq.current === state.listSeq) return;
    if (lists.isSuccess) {
      reportedSeq.current = state.listSeq;
      dispatch({ type: "listsLoaded", listSeq: state.listSeq, rowCount: lists.data.quotes.length + lists.data.drafts.length });
    } else if (lists.isError) {
      reportedSeq.current = state.listSeq;
      dispatch({ type: "listsFailed", listSeq: state.listSeq });
    }
  }, [state.listStatus, state.listSeq, lists.isPlaceholderData, lists.isSuccess, lists.isError, lists.data]);

  const allRows = useMemo(() => (lists.data ? buildHistoryRowsVM(lists.data.quotes, lists.data.drafts, "ALL") : []), [lists.data]);
  const rows = useMemo(
    () => allRows.filter((r) => state.pill === "ALL" || (state.pill === "QUOTES" ? r.kind === "quote" : r.kind === "draft")),
    [allRows, state.pill],
  );
  const counts = { all: allRows.length, quotes: allRows.filter((r) => r.kind === "quote").length, drafts: allRows.filter((r) => r.kind === "draft").length };
  const listed = state.listStatus === "LISTED";
  const visibleKeys = rows.map((r) => r.key);

  const submitSearch = () => {
    const dwt = Number(inputs.dwt);
    const filters: HistoryFilters = {
      route: inputs.route,
      cargo_description: inputs.cargo,
      vessel_name: inputs.vessel,
      vessel_dwt: inputs.dwt.trim() !== "" && Number.isFinite(dwt) ? dwt : 0,
    };
    dispatch({ type: "searchSubmitted", filters });
  };
  const reset = () => {
    setInputs(BLANK);
    dispatch({ type: "resetClicked", monthRange: defaultRange() });
  };
  const changeMonth = (which: 0 | 1, value: Dayjs | null) => {
    if (!value) return;
    const next: MonthRange = which === 0 ? [value.format(MONTH), state.monthRange[1]] : [state.monthRange[0], value.format(MONTH)];
    if (next[0] > next[1]) return;
    setInputs(BLANK);
    dispatch({ type: "rangeChanged", monthRange: next });
  };

  const load = (row: HistoryRowVM) => {
    if (row.values === null || !listed) return;
    dispatch({ type: "loadRowClicked", key: row.key });
    requestLoad({ source: "history", kind: row.kind, values: row.values, notice: row.notice });
    navigate("/workspace");
  };

  const confirmDelete = () => {
    const targets = state.deleteTargets;
    dispatch({ type: "confirmed" });
    bulkDelete.mutate(targets, {
      onSuccess: (result) => {
        dispatch({ type: result.outcome, report: result.report });
        if (result.outcome !== "allFailed") dispatch({ type: "refetchRequested" });
        const m = deleteMessage(t, result);
        void (m.type === "success" ? messageApi.success(m.text) : messageApi.error(m.text));
        dispatch({ type: "acknowledged" });
      },
    });
  };
  const exportState = exportSelectionState(state.selection);
  const downloadExcel = () => {
    if (exporting.current || exportState !== "OK") return;
    exporting.current = true;
    exporter.mutate(state.selection, {
      onSuccess: (blob) => saveBlob(blob, exportFilename()),
      onError: () => void messageApi.error(t("history.exportFailed")),
      onSettled: () => {
        exporting.current = false;
      },
    });
  };
  const frozen = partitionTargets(state.deleteTargets);
  const modalOpen = state.deleteStatus === "DEL_CONFIRMING" || state.deleteStatus === "DEL_RUNNING";

  const pill = (value: HistoryPill, label: string, n: number) => (
    <Button
      key={value}
      size="small"
      type={state.pill === value ? "primary" : "default"}
      aria-label={`${label} ${n}`}
      aria-pressed={state.pill === value}
      onClick={() => dispatch({ type: "pillChanged", pill: value })}
    >
      {label} {n}
    </Button>
  );

  return (
    <div className="history-page">
      {messageHolder}
      <h2>{t("history.title")}</h2>

      <div className="history-filters">
        <Input aria-label={t("history.route")} placeholder={t("history.route")} value={inputs.route} onChange={(e) => setInputs({ ...inputs, route: e.target.value })} onPressEnter={submitSearch} />
        <Input aria-label={t("history.cargo")} placeholder={t("history.cargo")} value={inputs.cargo} onChange={(e) => setInputs({ ...inputs, cargo: e.target.value })} onPressEnter={submitSearch} />
        <Input aria-label={t("history.vessel")} placeholder={t("history.vessel")} value={inputs.vessel} onChange={(e) => setInputs({ ...inputs, vessel: e.target.value })} onPressEnter={submitSearch} />
        <Input aria-label={t("history.dwt")} placeholder={t("history.dwt")} inputMode="numeric" value={inputs.dwt} onChange={(e) => setInputs({ ...inputs, dwt: e.target.value })} onPressEnter={submitSearch} />
        <Button onClick={reset}>{t("history.reset")}</Button>
        <Button type="primary" onClick={submitSearch}>
          {t("history.search")}
        </Button>
      </div>
      <div className="history-months">
        <DatePicker aria-label={t("history.from")} picker="month" allowClear={false} format={MONTH} value={dayjs(state.monthRange[0], MONTH)} onChange={(v) => changeMonth(0, v)} />
        <span aria-hidden>–</span>
        <DatePicker aria-label={t("history.to")} picker="month" allowClear={false} format={MONTH} value={dayjs(state.monthRange[1], MONTH)} onChange={(v) => changeMonth(1, v)} />
      </div>

      {state.listStatus === "ERROR" ? (
        <Alert
          type="error"
          showIcon
          message={t("history.error")}
          action={
            <Button size="small" onClick={() => dispatch({ type: "retryClicked" })}>
              {t("history.retry")}
            </Button>
          }
        />
      ) : state.listStatus === "EMPTY" ? (
        <div className="history-empty">
          <p>{t("history.empty")}</p>
          <p className="history-empty-hint">{t("history.emptyHint")}</p>
          <Button onClick={() => dispatch({ type: "refetchRequested" })}>{t("history.refresh")}</Button>
        </div>
      ) : (
        <>
          <div className="history-pills" role="group">
            {pill("ALL", t("history.pillAll"), counts.all)}
            {pill("QUOTES", t("history.pillQuotes"), counts.quotes)}
            {pill("DRAFTS", t("history.pillDrafts"), counts.drafts)}
          </div>
          <Table<HistoryRowVM>
            size="small"
            rowKey="key"
            loading={state.listStatus === "LOADING"}
            dataSource={rows}
            scroll={{ x: "max-content" }}
            pagination={{ pageSize: 20, showSizeChanger: false, showTotal: () => t("history.total", { n: rows.length }) }}
            rowSelection={{
              hideSelectAll: true,
              selectedRowKeys: state.selection,
              getCheckboxProps: () => ({ disabled: !listed }),
              onSelect: (row) => listed && dispatch({ type: "rowToggled", key: row.key, visibleKeys }),
            }}
            onRow={(row) => ({ onDoubleClick: () => load(row) })}
            columns={[
              {
                title: t("history.type"),
                dataIndex: "typeLabel",
                render: (_: unknown, r) =>
                  r.kind === "draft" ? <Tag>{t("history.draftTag")}</Tag> : <Tag color={r.typeLabel === "GO" ? "green" : "red"}>{r.typeLabel}</Tag>,
              },
              { title: t("history.date"), dataIndex: "dateIso", render: (v: string) => v.slice(0, 10) },
              { title: t("history.route"), dataIndex: "route" },
              { title: t("history.cargo"), dataIndex: "cargo" },
              { title: t("history.vessel"), dataIndex: "vessel" },
              { title: t("history.quantity"), dataIndex: "quantity", align: "right", render: (v: number | null) => (v === null ? "-" : v.toLocaleString("en-US")) },
              { title: t("history.rate"), dataIndex: "rate", align: "right", render: (v: number | null) => (v === null ? "-" : money(v)) },
              { title: t("history.tce"), dataIndex: "tce", align: "right", render: (v: number | null) => (v === null ? "-" : money(v)) },
              {
                title: "",
                key: "load",
                render: (_: unknown, r) => (
                  <Tooltip title={r.values === null ? t("history.unreadable") : undefined}>
                    <span>
                      <Button size="small" disabled={r.values === null || !listed} onClick={() => load(r)}>
                        {t("history.load")}
                      </Button>
                    </span>
                  </Tooltip>
                ),
              },
            ]}
          />
          <div className="history-toolbar">
            <Checkbox
              disabled={!listed}
              checked={visibleKeys.length > 0 && visibleKeys.every((k) => state.selection.includes(k))}
              indeterminate={state.selection.length > 0 && !visibleKeys.every((k) => state.selection.includes(k))}
              onChange={() => listed && dispatch({ type: "selectAllToggled", visibleKeys })}
            >
              {t("history.selectAll")}
            </Checkbox>
            {state.selection.length > 0 && <span>{t("history.selected", { n: state.selection.length })}</span>}
            <Button danger disabled={!listed || state.selection.length === 0 || state.deleteStatus !== "DEL_IDLE"} onClick={() => dispatch({ type: "deleteClicked" })}>
              {t("history.deleteSelected")}
            </Button>
            <span className="history-toolbar-spacer" />
            <Tooltip title={exportState === "TOO_MANY" ? t("history.exportTooMany", { n: MAX_EXPORT_RECORDS }) : undefined}>
              <span>
                <Button disabled={!listed || exportState !== "OK"} loading={exporter.isPending} onClick={downloadExcel}>
                  {t("history.downloadExcel")}
                </Button>
              </span>
            </Tooltip>
          </div>
        </>
      )}

      <Modal
        open={modalOpen}
        title={t("history.deleteTitle", { n: state.deleteTargets.length })}
        okText={t("history.delete")}
        cancelText={t("history.cancel")}
        okButtonProps={{ danger: true }}
        confirmLoading={state.deleteStatus === "DEL_RUNNING"}
        onOk={confirmDelete}
        onCancel={() => state.deleteStatus === "DEL_CONFIRMING" && dispatch({ type: "cancelled" })}
        maskClosable={false}
      >
        {frozen.quoteIds.length > 0 && <p>{t("history.deleteQuotes", { count: frozen.quoteIds.length })}</p>}
        {frozen.draftIds.length > 0 && <p>{t("history.deleteDrafts", { count: frozen.draftIds.length })}</p>}
      </Modal>
    </div>
  );
}
