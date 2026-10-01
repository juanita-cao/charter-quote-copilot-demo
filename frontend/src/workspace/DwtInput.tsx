import { AutoComplete, Input } from "antd";
import { useEffect, useState } from "react";
import { DWT_TIERS } from "./fieldGroups";

const parse = (raw: string): number | null => (raw.trim() === "" ? null : Number(raw.trim()));
const show = (v: number | null): string => (v === null || Number.isNaN(v) ? "" : String(v));
const options = DWT_TIERS.map((v) => ({ value: String(v) }));

// One free-text-plus-suggestions field (decision 2): a tier or any whole number; anything else stays visible beside its hint.
export function DwtInput({ value, onChange, label, status }: { value: number | null; onChange: (v: number | null) => void; label: string; status?: "error" }) {
  const [raw, setRaw] = useState(() => show(value));
  useEffect(() => {
    if (!Object.is(parse(raw), value)) setRaw(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <AutoComplete
      style={{ width: "100%" }}
      options={options}
      filterOption={(input, option) => (option?.value ?? "").includes(input.trim())}
      status={status}
      value={raw}
      onChange={(v: string) => {
        setRaw(v);
        onChange(parse(v));
      }}
    >
      <Input aria-label={label} status={status} />
    </AutoComplete>
  );
}
