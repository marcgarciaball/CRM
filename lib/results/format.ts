import type { YearMonth } from "../dates";

/** Formato español de las cifras del panel. `null` es «sin dato». */
const NO_DATA = "sin dato";
const eurFmt = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" });
const eur0Fmt = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", useGrouping: "always", maximumFractionDigits: 0 });
const intFmt = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
const pctFmt = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1 });
const oneDecimal = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

export const eur = (n: number | null) => (n === null ? NO_DATA : eurFmt.format(n));
/** Euros sin céntimos, para cifras grandes y ejes. */
export const eur0 = (n: number | null) => (n === null ? NO_DATA : eur0Fmt.format(n));
export const int = (n: number | null) => (n === null ? NO_DATA : intFmt.format(n));
/** Fracción a porcentaje: 0,032 → «3,2 %». */
export const pct = (n: number | null) => (n === null ? NO_DATA : pctFmt.format(n));

/** Variación frente al año anterior: «×4,9» desde el doble; si no, «+9 %» / «−12 %». */
export function ratio(current: number, previous: number): string {
  const r = current / previous;
  if (r >= 2) return `×${oneDecimal.format(r)}`;
  const change = Math.round((r - 1) * 100);
  return `${change < 0 ? "−" : "+"}${Math.abs(change)} %`;
}

export const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MONTH_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const parts = (ym: YearMonth) => [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))] as const;
const index = (ym: YearMonth) => parts(ym)[0] * 12 + parts(ym)[1] - 1;
export const monthShort = (ym: YearMonth) => MONTH_SHORT[parts(ym)[1] - 1];
export const monthLong = (ym: YearMonth) => `${MONTH_LONG[parts(ym)[1] - 1]} ${parts(ym)[0]}`;

/** Meses en tramos legibles: «feb–oct 2025», «nov 2025–ene 2026», «ene 2025, nov–dic 2025». */
export function monthSpan(months: YearMonth[]): string {
  const sorted = [...new Set(months)].sort();
  const runs: YearMonth[][] = [];
  for (const m of sorted) {
    const last = runs.at(-1);
    if (last && index(m) === index(last.at(-1)!) + 1) last.push(m);
    else runs.push([m]);
  }
  return runs.map((run) => {
    const [a, b] = [run[0], run.at(-1)!];
    if (a === b) return `${monthShort(a)} ${parts(a)[0]}`;
    if (parts(a)[0] === parts(b)[0]) return `${monthShort(a)}–${monthShort(b)} ${parts(a)[0]}`;
    return `${monthShort(a)} ${parts(a)[0]}–${monthShort(b)} ${parts(b)[0]}`;
  }).join(", ");
}
