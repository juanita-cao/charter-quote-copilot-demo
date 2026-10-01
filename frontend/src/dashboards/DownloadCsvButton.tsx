import { DownloadOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { downloadCsv } from "./downloadCsv";

// Shared "Download" action for every dashboard card (T2.35, design_backend.md §24) — one
// component, not one download button hand-built per dashboard. `rows` is whatever the
// dashboard already fetched (its natural, wide shape — not the long/flattened shape a
// chart library wants), so the CSV mirrors the underlying data, not just what's drawn.
export function DownloadCsvButton<T extends object>({ filename, rows }: { filename: string; rows: readonly T[] }) {
  const { t } = useTranslation();
  return (
    <Button
      icon={<DownloadOutlined />}
      disabled={rows.length === 0}
      onClick={() => downloadCsv(filename, rows)}
      aria-label={t("dashboards.download")}
    >
      {t("dashboards.download")}
    </Button>
  );
}
