// Mirror of src/backend/configs/bunker_ports.py::KNOWN_PORTS (GAP-3). Public port names; keep in sync with the backend list.
export const KNOWN_PORTS: readonly string[] = [
  "VLADIVOSTOK", "VOSTOCHNY", "NAKHODKA", "VANINO",
  "TOKYO", "BUSAN", "INCHON", "QINGDAO", "SHANGHAI", "ZHOUSHAN",
  "HONGKONG", "KAOHSIUNG", "TAICHUNG", "SINGAPORE", "PORT KLANG",
  "BANGKOK", "KOSICHANG", "HOCHIMINH", "HAIPHONG",
  "COLOMBO", "PORT LOUIS",
  "ROTTERDAM", "HAMBURG", "ANTWERP", "PIRAEUS", "GIBRALTAR",
  "ST.PETERSBURG", "UST-LUGA", "FUJAIRAH",
  "NEW YORK", "HOUSTON", "LOS ANGELES", "RIO DE JANEIRO",
  "DURBAN", "CAPETOWN",
];

export const isKnownPort = (port: string | null | undefined): boolean =>
  typeof port === "string" && KNOWN_PORTS.includes(port.trim());
