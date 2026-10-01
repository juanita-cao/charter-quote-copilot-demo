import { Line } from "@ant-design/plots";
import { Card, Empty, Select, Space, Spin, Typography } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../app/contexts";
import { KNOWN_PORTS } from "../config/bunkerPorts";
import { englishFormFor, matchCargo } from "../config/cargoMatch";
import {
  useBunkerPriceDashboard,
  useFreightTrendDashboard,
  usePortCostDashboard,
  useVesselTypeDashboard,
} from "../hooks/queries";
import { DownloadCsvButton } from "./DownloadCsvButton";
import { DWT_BAND_LABELS, DWT_UNKNOWN, dwtBandColor, dwtBandLabel } from "./vesselDwtBands";

// T2.35, dashboard 1 of 5 (design_backend.md §24): bunker price history. A second "actual
// price paid" series (from the company's own saved quotes) was built and then dropped at
// the client's request (2026-09-23) — the price an operator types into a quote is itself
// usually copied from this same scraped reference, so it wasn't an independent signal,
// just a circular echo of the one series below.

// Chart tooltips show money with two decimals (client, 2026-09-24: 26.9607843137255 -> 26.96).
const money2 = (v: unknown) => Number(v).toFixed(2);

function BunkerPriceDashboard() {
  const { t } = useTranslation();
  const api = useApi();
  const [port, setPort] = useState<string>(KNOWN_PORTS[0]);
  const query = useBunkerPriceDashboard(api, port);

  // vlsfo_high/lsmgo_high, not low — matches vm/bunker.ts's own auto-fill (hfo_price/mgo_price
  // take the high side), so the chart reads the same number the calculation actually uses.
  // The unit sits in the series name (legend and tooltip), like the other three dashboards'
  // tooltip labels (client, 2026-09-24).
  const unit = t("dashboards.bunkerUnit");
  const data = (query.data ?? []).flatMap((p) => [
    { date: p.report_date, price: p.vlsfo_high, series: `VLSFO (${unit})` },
    { date: p.report_date, price: p.lsmgo_high, series: `LSMGO (${unit})` },
  ]);

  return (
    <Card
      title={t("dashboards.bunkerPriceTitle")}
      extra={
        <Space>
          <Select
            value={port}
            onChange={setPort}
            style={{ width: 180 }}
            showSearch
            options={KNOWN_PORTS.map((p) => ({ value: p, label: p }))}
            aria-label={t("dashboards.port")}
          />
          <DownloadCsvButton filename={`bunker-price-${port}`} rows={query.data ?? []} />
        </Space>
      }
    >
      <Spin spinning={query.isLoading}>
        {data.length > 0 ? (
          // `slider: { x: true }` (design_backend.md §24, client request 2026-09-23) lets the
          // operator zoom/pan the x-axis instead of every point being squeezed onto one screen —
          // this is the same chart that keeps growing a new point every scrape, indefinitely.
          <Line
            data={data}
            xField="date"
            yField="price"
            tooltip={{ items: [{ channel: "y", valueFormatter: money2 }] }}
            colorField="series"
            scale={{ color: { range: ["#1F7A6C", "#D97706"] } }}
            legend={{ color: { position: "top" } }}
            point={{ shape: "circle", size: 0.8, style: { lineWidth: 0 } }}
            height={320}
            slider={{ x: { sparklineData: [] } }}
          />
        ) : (
          <Empty description={t("dashboards.noData")} />
        )}
      </Spin>
    </Card>
  );
}

// T2.35, dashboard 2 of 5 (design_backend.md §24): TCE trend by vessel type — merged with
// what was going to be a separate "hire trend by vessel type" dashboard. Bucketed into
// DWT_TIERS' fixed, non-overlapping bands (vesselDwtBands.ts) — the client considered and
// declined a "nearest tier ± half the gap to its neighbour" scheme, keeping the bands
// already built. `vessel_dwt = null`/`0` (T2.34's historical import, §23 — no real DWT
// captured for ~1/6 of it after the backfill) lands in "< 2000" like any other small
// vessel — a known, documented skew, not a bug here. One point per saved quote, not
// averaged. **[AMENDMENT 2026-09-23]** Small multiples (one chart per band) were tried and
// dropped for the same single-chart-plus-Select shape as dashboards 1/4 — a band picker
// (mirroring the port/cargo picker) rather than 11 charts on screen at once.
function VesselTypeDashboard() {
  const { t } = useTranslation();
  const api = useApi();
  const query = useVesselTypeDashboard(api);

  const byBand = useMemo(() => {
    const grouped = new Map<string, { date: string; tce: number }[]>();
    for (const row of query.data ?? []) {
      const band = dwtBandLabel(row.vessel_dwt);
      const rows = grouped.get(band) ?? [];
      rows.push({ date: row.quote_date, tce: row.tce });
      grouped.set(band, rows);
    }
    return [...DWT_BAND_LABELS, DWT_UNKNOWN].filter((label) => grouped.has(label)).map((label) => ({
      band: label,
      rows: grouped.get(label)!.sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }, [query.data]);

  const [band, setBand] = useState<string | null>(null);
  const selected = band ?? byBand[0]?.band ?? null;
  const rows = byBand.find((b) => b.band === selected)?.rows ?? [];

  return (
    <Card
      title={t("dashboards.vesselTypeTitle")}
      extra={
        <Space>
          <Select
            value={selected}
            onChange={setBand}
            style={{ width: 180 }}
            options={byBand.map((b) => ({
              value: b.band,
              label: `${b.band === DWT_UNKNOWN ? t("dashboards.unknownDwt") : b.band} (${b.rows.length})`,
            }))}
            aria-label={t("dashboards.vesselType")}
          />
          <DownloadCsvButton filename={`vessel-type-trend-${selected ?? "none"}`} rows={rows} />
        </Space>
      }
      style={{ marginTop: 20 }}
    >
      <Spin spinning={query.isLoading}>
        {rows.length > 0 ? (
          <Line
            data={rows}
            xField="date"
            yField="tce"
            tooltip={{ items: [{ channel: "y", name: t("dashboards.tceLabel"), valueFormatter: money2 }] }}
            style={{ stroke: selected ? dwtBandColor(selected) : "#1F7A6C" }}
            point={{ shape: "circle", size: 0.8, style: { fill: selected ? dwtBandColor(selected) : "#1F7A6C", lineWidth: 0 } }}
            height={320}
            slider={{ x: { sparklineData: [] } }}
          />
        ) : (
          <Empty description={t("dashboards.noData")} />
        )}
      </Spin>
    </Card>
  );
}

// T2.35, dashboard 4 of 5 (design_backend.md §24): freight-rate trend per cargo. No new
// standard cargo list — `cargo_description` is matched against PT-18's own `cargo.json`
// (`matchCargo`), the same dictionary the "Recognise fields" button already uses, rather
// than building a second one. One cargo at a time (a Select, mirroring dashboard 1's port
// picker) rather than small multiples — cargo.json has 71 concepts, far too many for a
// grid the way 12 DWT bands were. One point per saved quote, not averaged, same reasoning
// as dashboard 2 (the zoom slider is only worth having with real per-quote detail).
function FreightTrendDashboard() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const query = useFreightTrendDashboard(api);

  // Concepts are Chinese by convention (cargoMatch.ts's own docstring — no invented
  // bilingual pairing). On the English UI, show the concept's own verified English form
  // when cargo.json has one; otherwise fall back to the Chinese concept rather than
  // inventing a translation, same discipline the dictionary build itself already applies.
  const cargoLabel = (concept: string) => (i18n.language === "zh" ? concept : (englishFormFor(concept) ?? concept));

  const byCargo = useMemo(() => {
    const grouped = new Map<string, { date: string; freightRate: number }[]>();
    for (const row of query.data ?? []) {
      const cargo = matchCargo(row.cargo_description);
      if (cargo === null) continue; // not matched against the standard list — not shown, not guessed
      const rows = grouped.get(cargo) ?? [];
      rows.push({ date: row.quote_date, freightRate: row.freight_rate });
      grouped.set(cargo, rows);
    }
    return [...grouped.entries()]
      .map(([cargo, rows]) => ({ cargo, rows: rows.sort((a, b) => a.date.localeCompare(b.date)) }))
      .sort((a, b) => b.rows.length - a.rows.length); // most-quoted cargo first
  }, [query.data]);

  const [cargo, setCargo] = useState<string | null>(null);
  const selected = cargo ?? byCargo[0]?.cargo ?? null;
  const rows = byCargo.find((c) => c.cargo === selected)?.rows ?? [];

  return (
    <Card
      title={t("dashboards.freightTrendTitle")}
      extra={
        <Space>
          <Select
            value={selected}
            onChange={setCargo}
            style={{ width: 180 }}
            showSearch
            options={byCargo.map((c) => ({ value: c.cargo, label: `${cargoLabel(c.cargo)} (${c.rows.length})` }))}
            aria-label={t("dashboards.cargo")}
          />
          <DownloadCsvButton filename={`freight-trend-${selected ?? "none"}`} rows={rows} />
        </Space>
      }
      style={{ marginTop: 20 }}
    >
      <Spin spinning={query.isLoading}>
        {rows.length > 0 ? (
          <Line
            data={rows}
            xField="date"
            yField="freightRate"
            tooltip={{ items: [{ channel: "y", name: t("dashboards.freightLabel"), valueFormatter: money2 }] }}
            style={{ stroke: "#1F7A6C" }}
            point={{ shape: "circle", size: 0.8, style: { fill: "#1F7A6C", lineWidth: 0 } }}
            height={320}
            slider={{ x: { sparklineData: [] } }}
          />
        ) : (
          <Empty description={t("dashboards.noData")} />
        )}
      </Spin>
    </Card>
  );
}

// T2.35, dashboard 5 of 5 (design_backend.md §24): port cost (PDA) over time, per port —
// "港口使费整理" (client's own naming, 2026-09-23): one port at a time via a Select
// (mirroring dashboards 1/4's port/cargo picker), x = date, y = USD, same size and shape
// as dashboard 1. **[AMENDMENT 2026-09-23]** A horizontal bar-chart "compare all ports at
// once" first cut was dropped for this — same single-chart-plus-Select shape as every
// other dashboard here now. Each saved quote contributes up to two (port, date, pda)
// observations — load and discharge are the same port-cost concept regardless of which
// role the port played that voyage, so both feed the same selected port's series when it
// was used either way. Pre-split legacy records (the even port_cost÷2 estimate) are
// included exactly like real splits — client-confirmed 2026-09-23, no special-casing.
function PortCostDashboard() {
  const { t } = useTranslation();
  const api = useApi();
  const query = usePortCostDashboard(api);

  const byPort = useMemo(() => {
    const grouped = new Map<string, { date: string; pda: number }[]>();
    for (const row of query.data ?? []) {
      for (const [port, pda] of [
        [row.load_port, row.load_port_pda],
        [row.discharge_port, row.discharge_port_pda],
      ] as const) {
        if (!port || pda === null) continue;
        const rows = grouped.get(port) ?? [];
        rows.push({ date: row.quote_date, pda });
        grouped.set(port, rows);
      }
    }
    return [...grouped.entries()]
      .map(([port, rows]) => ({ port, rows: rows.sort((a, b) => a.date.localeCompare(b.date)) }))
      .sort((a, b) => b.rows.length - a.rows.length); // most-quoted port first
  }, [query.data]);

  const [port, setPort] = useState<string | null>(null);
  const selected = port ?? byPort[0]?.port ?? null;
  const rows = byPort.find((p) => p.port === selected)?.rows ?? [];

  return (
    <Card
      title={t("dashboards.portCostTitle")}
      extra={
        <Space>
          <Select
            value={selected}
            onChange={setPort}
            style={{ width: 180 }}
            showSearch
            options={byPort.map((p) => ({ value: p.port, label: `${p.port} (${p.rows.length})` }))}
            aria-label={t("dashboards.port")}
          />
          <DownloadCsvButton filename={`port-cost-${selected ?? "none"}`} rows={rows} />
        </Space>
      }
      style={{ marginTop: 20 }}
    >
      <Spin spinning={query.isLoading}>
        {rows.length > 0 ? (
          <Line
            data={rows}
            xField="date"
            yField="pda"
            tooltip={{ items: [{ channel: "y", name: t("dashboards.pdaLabel"), valueFormatter: money2 }] }}
            style={{ stroke: "#1F7A6C" }}
            point={{ shape: "circle", size: 0.8, style: { fill: "#1F7A6C", lineWidth: 0 } }}
            height={320}
            slider={{ x: { sparklineData: [] } }}
          />
        ) : (
          <Empty description={t("dashboards.noData")} />
        )}
      </Spin>
    </Card>
  );
}

export function DashboardsPage() {
  const { t } = useTranslation();
  return (
    <div>
      <Typography.Title level={3}>{t("dashboards.title")}</Typography.Title>
      <BunkerPriceDashboard />
      <VesselTypeDashboard />
      <FreightTrendDashboard />
      <PortCostDashboard />
    </div>
  );
}
