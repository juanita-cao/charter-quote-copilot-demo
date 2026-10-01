// Shared by every dashboard (T2.35, design_backend.md §24) — one CSV-export function, not
// one hand-rolled per dashboard. Client-side only: the browser already has exactly the
// rows on screen, so there is no reason to round-trip through the backend for this.

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv<T extends object>(filename: string, rows: readonly T[]): void {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]) as (keyof T)[];
  const lines = [columns.join(","), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
