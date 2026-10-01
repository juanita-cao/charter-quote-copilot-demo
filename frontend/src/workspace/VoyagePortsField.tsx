import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { AutoComplete, Button, Form, Input, Segmented } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VoyagePort, VoyagePortRole } from "../api/types";
import { searchCargoPorts } from "../config/cargoPorts";
import { validateVoyagePorts } from "../form/voyagePorts";
import { AutofillCaption } from "./FormField";
import { useFormContext } from "./context";

export const MAX_VOYAGE_PORTS = 12;

// The voyage port sequence (v1.2, design_frontend.md §12, PT-21): replaces the separate Load port / Discharge port
// fields. Add any number of ports, in travel order; tag one "Load" and one "Discharge" (everything else is a
// waypoint). Exactly one of each is enforced with an error, not a silent swap — picking a second Load does not
// quietly un-tag the first one.
export function VoyagePortsField() {
  const { t } = useTranslation();
  const { values, setField, customPorts, portsCaption, acceptPortsOffer } = useFormContext();
  const rows = values.voyage_ports;
  const set = (next: VoyagePort[]) => setField("voyage_ports", next);
  const full = rows.length >= MAX_VOYAGE_PORTS;
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  const [query, setQuery] = useState("");
  const options = useMemo(() => searchCargoPorts(query, customPorts).map((v) => ({ value: v })), [query, customPorts]);
  const error = validateVoyagePorts(rows);

  const roleOptions = [
    { label: t("voyagePorts.waypoint"), value: "waypoint" },
    { label: t("voyagePorts.load"), value: "load" },
    { label: t("voyagePorts.discharge"), value: "discharge" },
  ];

  return (
    <Form.Item
      label={t("fields.voyage_ports")}
      validateStatus={error ? "error" : undefined}
      help={error ? t(`hints.${error}`) : portsCaption ? <AutofillCaption ns="ports" caption={portsCaption} onAccept={acceptPortsOffer} /> : undefined}
    >
      <div className="voyage-ports">
        {rows.map((row, i) => (
          <div className="voyage-port-row" key={i}>
            <AutoComplete
              style={{ flex: "1 1 0", minWidth: 0 }}
              options={options}
              value={row.port}
              onSearch={setQuery}
              onChange={(v: string) => set(rows.map((r, k) => (k === i ? { ...r, port: v } : r)))}
            >
              <Input aria-label={t("voyagePorts.port", { n: i + 1 })} />
            </AutoComplete>
            <Segmented
              aria-label={t("voyagePorts.role", { n: i + 1 })}
              size="small"
              options={roleOptions}
              value={row.role}
              onChange={(v) => set(rows.map((r, k) => (k === i ? { ...r, role: v as VoyagePortRole } : r)))}
            />
            <Button
              aria-label={t("voyagePorts.moveUp", { n: i + 1 })}
              icon={<ArrowUpOutlined aria-hidden />}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            />
            <Button
              aria-label={t("voyagePorts.moveDown", { n: i + 1 })}
              icon={<ArrowDownOutlined aria-hidden />}
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
            />
            <Button aria-label={t("voyagePorts.remove", { n: i + 1 })} icon={<DeleteOutlined aria-hidden />} onClick={() => set(rows.filter((_, k) => k !== i))} />
          </div>
        ))}
        <div className="voyage-port-add">
          <Button icon={<PlusOutlined aria-hidden />} disabled={full} onClick={() => set([...rows, { port: "", role: "waypoint" }])}>
            {t("voyagePorts.add")}
          </Button>
          {full && <span className="voyage-port-limit">{t("voyagePorts.limit", { n: MAX_VOYAGE_PORTS })}</span>}
        </div>
      </div>
    </Form.Item>
  );
}
