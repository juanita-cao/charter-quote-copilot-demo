import { AutoComplete, Form, Input, Switch } from "antd";
import { useTranslation } from "react-i18next";
import { KNOWN_PORTS } from "../config/bunkerPorts";
import { REQUIRED_FIELDS } from "../form/fields";
import { laycanHint, validateField } from "../form/fieldRules";
import { DwtInput } from "./DwtInput";
import { OtherCostsField } from "./OtherCostsField";
import { TimingField } from "./TimingField";
import { TotalFreightField } from "./TotalFreightField";
import { VoyagePortsField } from "./VoyagePortsField";
import { NumericInput } from "./NumericInput";
import { useFormContext } from "./context";
import { CONTRACT_TERMS, CRANE_TIERS, type FieldDef } from "./fieldGroups";
import { FIELD_STEPS } from "./fieldSteps";
import type { Values } from "./context";

const toOptions = (list: readonly (string | number)[]) => list.map((v) => ({ value: String(v) }));
const filter = (input: string, option?: { value: string }) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase());

export function FormField({ def }: { def: FieldDef }) {
  if (def.kind === "total") return <TotalFreightField />;
  if (def.kind === "timing") return <TimingField def={def} />;
  if (def.kind === "others") return <OtherCostsField />;
  if (def.kind === "voyagePorts") return <VoyagePortsField />;
  return <ValueField def={def as FieldDef & { name: keyof Values }} />;
}

function ValueField({ def }: { def: FieldDef & { name: keyof Values } }) {
  const { t } = useTranslation();
  const {
    values,
    setField,
    routes,
    bunkerCaption,
    ballastCaption,
    ladenCaption,
    cargoCaption,
    dismissCargoCaption,
    acceptCargoOffer,
    termsCaption,
    dismissTermsCaption,
    acceptTermsOffer,
    quantityCaption,
    dismissQuantityCaption,
    acceptQuantityOffer,
    laycanCaption,
    dismissLaycanCaption,
    acceptLaycanOffer,
  } = useFormContext();
  const name = def.name;
  const label = t(`fields.${name}`);
  const required = (REQUIRED_FIELDS as readonly string[]).includes(name);
  const raw = values[name];
  const hintKey = validateField(name, raw) ?? (name === "laycan_end" ? laycanHint(values.laycan_start, values.laycan_end) : null);
  const hint = hintKey ? t(`hints.${hintKey}`) : undefined;
  const set = setField as (f: string, v: unknown) => void;

  // The crane toggle only exists for the tiers where it matters (8000 / 9000 / 10000 t).
  if (def.kind === "crane" && !(typeof values.vessel_dwt === "number" && CRANE_TIERS.includes(values.vessel_dwt))) return null;

  let control;
  switch (def.kind) {
    case "text":
      control = (
        <Input
          aria-label={label}
          value={(raw as string | null) ?? ""}
          onChange={(e) => set(name, e.target.value === "" ? null : e.target.value)}
          onBlur={name === "cargo_description" && cargoCaption ? dismissCargoCaption : undefined}
        />
      );
      break;
    case "date": {
      const isLaycanField = name === "laycan_start" || name === "laycan_end";
      control = (
        <Input
          type="date"
          aria-label={label}
          status={hint ? "error" : undefined}
          value={(raw as string | null) ?? ""}
          onChange={(e) => set(name, e.target.value === "" ? null : e.target.value)}
          onBlur={isLaycanField && laycanCaption ? dismissLaycanCaption : undefined}
        />
      );
      break;
    }
    case "number":
      control = (
        <NumericInput
          field={name}
          label={label}
          step={FIELD_STEPS[name]}
          value={raw as number | null}
          onChange={set}
          status={hint ? "error" : undefined}
          onBlur={name === "quantity" && quantityCaption ? dismissQuantityCaption : undefined}
        />
      );
      break;
    case "route":
    case "terms":
    case "port": {
      const options = def.kind === "route" ? toOptions(routes) : def.kind === "terms" ? toOptions(CONTRACT_TERMS) : toOptions(KNOWN_PORTS);
      control = (
        <AutoComplete
          style={{ width: "100%" }}
          options={options}
          filterOption={filter}
          value={(raw as string | null) ?? ""}
          onChange={(v: string) => set(name, v === "" ? null : v)}
        >
          <Input aria-label={label} onBlur={def.kind === "terms" && termsCaption ? dismissTermsCaption : undefined} />
        </AutoComplete>
      );
      break;
    }
    case "dwt":
      control = <DwtInput label={label} value={raw as number | null} onChange={(v) => set(name, v)} status={hint ? "error" : undefined} />;
      break;
    case "crane":
      control = <Switch aria-label={label} checked={values.has_crane === true} onChange={(c) => set(name, c)} />;
      break;
  }

  const caption =
    def.kind === "port" && bunkerCaption ? (
      <AutofillCaption ns="bunker" caption={bunkerCaption} />
    ) : name === "ballast_distance" && ballastCaption ? (
      <AutofillCaption ns="distance" caption={ballastCaption} />
    ) : name === "laden_distance" && ladenCaption ? (
      <AutofillCaption ns="distance" caption={ladenCaption} />
    ) : name === "cargo_description" && cargoCaption ? (
      <AutofillCaption ns="cargo" caption={cargoCaption} onAccept={acceptCargoOffer} />
    ) : def.kind === "terms" && termsCaption ? (
      <AutofillCaption ns="terms" caption={termsCaption} onAccept={acceptTermsOffer} />
    ) : name === "quantity" && quantityCaption ? (
      <AutofillCaption ns="quantity" caption={quantityCaption} onAccept={acceptQuantityOffer} />
    ) : name === "laycan_end" && laycanCaption ? (
      <AutofillCaption ns="laycan" caption={laycanCaption} onAccept={acceptLaycanOffer} />
    ) : null;

  return (
    <Form.Item
      label={
        <span>
          {label}
          {required && <span className="required-mark"> *</span>}
        </span>
      }
      validateStatus={hint ? "error" : undefined}
      help={hint ?? caption ?? undefined}
    >
      {control}
    </Form.Item>
  );
}

// Shared by bunker price, distance lookup, and the field recogniser: a small "where this value came from" note —
// ok (green), warn (amber), or offer (amber + a "Replace" action, when the field already holds something different
// from a fresh match — design_frontend.md §13, never applied without this explicit click).
export function AutofillCaption({
  ns,
  caption,
  onAccept,
}: {
  ns: "bunker" | "distance" | "cargo" | "terms" | "ports" | "quantity" | "laycan";
  caption: { kind: "ok" | "warn" | "offer"; key: string; params?: Record<string, string> };
  onAccept?: () => void;
}) {
  const { t } = useTranslation();
  if (caption.kind === "offer") {
    return (
      <span className={`bunker-caption ${caption.kind}`}>
        {t(`${ns}.${caption.key}`, caption.params)}{" "}
        <a onClick={onAccept} role="button">
          {t(`${ns}.replace`)}
        </a>
      </span>
    );
  }
  return <span className={`bunker-caption ${caption.kind}`}>{t(`${ns}.${caption.key}`, caption.params)}</span>;
}
