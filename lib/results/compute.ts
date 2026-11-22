import { addMonths, monthOf, monthRange, type LocalDate, type YearMonth } from "../dates";
import type { MonthlyField, MonthlyRow } from "./columns";
import { monthLong, monthSpan } from "./format";

export type MetaMonth = { month: YearMonth; spend: number | null; impressions: number | null; clicks: number | null; purchases: number | null };
export type Period = { kind: "year"; year: number } | { kind: "last12" };

export function parsePeriod(v: string | undefined, fallback: Period): Period {
  if (v === "12m") return { kind: "last12" };
  if (v && /^\d{4}$/.test(v)) return { kind: "year", year: Number(v) };
  return fallback;
}

/** El año del último mes con ventas; sin datos, el año de hoy. */
export function defaultPeriod(monthly: MonthlyRow[], today: LocalDate): Period {
  const last = monthly.map((r) => r.month).sort().at(-1);
  return { kind: "year", year: Number((last ?? today).slice(0, 4)) };
}

export function availableYears(monthly: MonthlyRow[], meta: MetaMonth[]): number[] {
  const years = new Set([...monthly, ...meta].map((r) => Number(r.month.slice(0, 4))));
  return [...years].sort((a, b) => b - a);
}

/**
 * complete: mes cerrado con fila de ventas; partial: `data_until` antes de fin de mes o mes en curso;
 * missing: sin fila de ventas; future: después del mes actual.
 */
export type MonthState = "complete" | "partial" | "missing" | "future";
export type MonthView = {
  month: YearMonth; state: MonthState; data_until: LocalDate | null;
  m: MonthlyRow | null; meta: MetaMonth | null;
  /** El mismo mes del año anterior, solo si está completo. */
  prev: MonthlyRow | null;
};
export type KpiKey = "ventas_totales" | "pedidos" | "pedido_medio" | "descuentos" | "pct_descuento" | "inversion_meta"
  | "gasto_ventas" | "conversion" | "clientes_nuevos" | "pct_recurrentes";
export type Kpi = {
  key: KpiKey; value: number | null;
  /** Meses del periodo (hasta hoy) que no cuentan en la cifra por falta de dato o por estar a medias. */
  missing: YearMonth[];
  /** Mismos meses en los dos años: `current` es la cifra de este año sobre esos meses, `months` los meses de este año. */
  compare: { current: number; previous: number; months: YearMonth[] } | null;
};
export type Results = { period: Period; months: MonthView[]; kpis: Record<KpiKey, Kpi>; gaps: string[] };

type Src = { month: YearMonth; state: MonthState; inProgress: boolean; m: MonthlyRow | null; meta: MetaMonth | null };
type Def = { has: (s: Src) => boolean; calc: (ss: Src[]) => number | null };

const sum = (ss: Src[], f: MonthlyField) => ss.reduce((acc, s) => acc + (s.m![f] ?? 0), 0);
const spend = (ss: Src[]) => ss.reduce((acc, s) => acc + (s.meta!.spend ?? 0), 0);
const div = (a: number, b: number) => (b === 0 ? null : a / b);
const complete = (...fields: MonthlyField[]) => (s: Src) => s.state === "complete" && fields.every((f) => s.m![f] !== null);
const hasSpend = (s: Src) => !s.inProgress && s.state !== "future" && s.meta?.spend != null;

const DEFS: Record<KpiKey, Def> = {
  ventas_totales: { has: complete("ventas_totales"), calc: (ss) => sum(ss, "ventas_totales") },
  pedidos: { has: complete("pedidos"), calc: (ss) => sum(ss, "pedidos") },
  pedido_medio: { has: complete("ventas_totales", "pedidos"), calc: (ss) => div(sum(ss, "ventas_totales"), sum(ss, "pedidos")) },
  descuentos: { has: complete("descuentos"), calc: (ss) => Math.abs(sum(ss, "descuentos")) },
  pct_descuento: { has: complete("descuentos", "ventas_brutas"), calc: (ss) => div(Math.abs(sum(ss, "descuentos")), sum(ss, "ventas_brutas")) },
  // El gasto de Meta sale de su informe: cuenta aunque falten las ventas de ese mes.
  inversion_meta: { has: hasSpend, calc: spend },
  gasto_ventas: { has: (s) => hasSpend(s) && complete("ventas_totales")(s), calc: (ss) => div(spend(ss), sum(ss, "ventas_totales")) },
  conversion: { has: complete("sesiones_compra", "sesiones"), calc: (ss) => div(sum(ss, "sesiones_compra"), sum(ss, "sesiones")) },
  clientes_nuevos: { has: complete("clientes_nuevos"), calc: (ss) => sum(ss, "clientes_nuevos") },
  pct_recurrentes: {
    has: complete("clientes_nuevos", "clientes_recurrentes"),
    calc: (ss) => div(sum(ss, "clientes_recurrentes"), sum(ss, "clientes_nuevos") + sum(ss, "clientes_recurrentes")),
  },
};

function periodMonths(period: Period, current: YearMonth): YearMonth[] {
  const first = period.kind === "year" ? `${period.year}-01` : addMonths(current, -11);
  return Array.from({ length: 12 }, (_, i) => addMonths(first, i));
}

export function computeResults(i: { monthly: MonthlyRow[]; meta: MetaMonth[]; period: Period; today: LocalDate }): Results {
  const current = monthOf(i.today);
  const rows = new Map(i.monthly.map((r) => [r.month, r]));
  const metas = new Map(i.meta.map((r) => [r.month, r]));
  const src = (month: YearMonth): Src => {
    const m = rows.get(month) ?? null;
    const inProgress = month === current;
    const partial = inProgress || (!!m?.data_until && m.data_until < monthRange(month).last);
    const state: MonthState = month > current ? "future" : !m ? "missing" : partial ? "partial" : "complete";
    return { month, state, inProgress, m, meta: metas.get(month) ?? null };
  };
  const list = periodMonths(i.period, current);
  const cur = list.map(src);
  const prevOf = (s: Src) => src(addMonths(s.month, -12));

  const kpis = {} as Record<KpiKey, Kpi>;
  for (const [key, def] of Object.entries(DEFS) as [KpiKey, Def][]) {
    const usable = cur.filter(def.has);
    const both = usable.filter((s) => def.has(prevOf(s)));
    const current = both.length ? def.calc(both) : null;
    const previous = both.length ? def.calc(both.map(prevOf)) : null;
    kpis[key] = {
      key,
      value: usable.length ? def.calc(usable) : null,
      missing: cur.filter((s) => s.state !== "future" && !def.has(s)).map((s) => s.month),
      compare: current !== null && previous ? { current, previous, months: both.map((s) => s.month) } : null,
    };
  }

  const past = cur.filter((s) => s.state !== "future");
  const gaps: string[] = [];
  const noSales = past.filter((s) => s.state === "missing").map((s) => s.month);
  if (noSales.length) gaps.push(`Sin ventas: ${monthSpan(noSales)}`);
  for (const s of past.filter((s) => s.state === "partial")) {
    const until = s.m?.data_until;
    gaps.push(until && until < monthRange(s.month).last
      ? `${monthLong(s.month)} parcial (hasta el ${Number(until.slice(8))})`
      : `${monthLong(s.month)} en curso`);
  }
  const noMeta = past.filter((s) => s.state === "complete" && !s.meta).map((s) => s.month);
  if (noMeta.length) gaps.push(`Sin gasto de Meta: ${monthSpan(noMeta)}`);

  return {
    period: i.period,
    months: cur.map((s) => {
      const p = prevOf(s);
      return { month: s.month, state: s.state, data_until: s.m?.data_until ?? null, m: s.m, meta: s.meta, prev: p.state === "complete" ? p.m : null };
    }),
    kpis,
    gaps,
  };
}
