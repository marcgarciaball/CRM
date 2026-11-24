import type { YearMonth } from "../dates";
import type { MonthlyRow } from "../results/columns";
import { unitCost, type PerMinute, type UnitCost } from "./costing";
import { matchProduct } from "./match";
import type { CostSettings, FixedCostTotals, Product, ProductSale } from "./types";

export type Tag = "potenciar" | "revisar_precio" | "poco_volumen" | "incompleto";
export type RankRow = { product: Product; cost: UnitCost; units: number; net_sales: number; real_contribution: number | null; tag: Tag | null };
export type Unmatched = { product_title: string; variant_title: string; units: number; net_sales: number };
export type Ranking = {
  rows: RankRow[]; unmatched: Unmatched[];
  /** Ventas netas emparejadas con un producto del escandallo ÷ todas las ventas netas del periodo. */
  matched_share: number | null;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const unitsOf = (s: ProductSale) => (s.quantity ?? 0) - Math.abs(s.reversed_quantity ?? 0);

/**
 * Productos del escandallo con lo vendido en los meses dados. Aportación real = ventas netas cobradas sin IVA
 * − unidades × coste variable (materiales, comisiones y envío). Etiquetas por medianas entre productos con ventas.
 */
export function rankProducts(i: { products: Product[]; settings: CostSettings; pm: PerMinute; sales: ProductSale[]; months: YearMonth[] }): Ranking {
  const inPeriod = new Set(i.months);
  const acc = new Map<string, { units: number; net: number }>();
  const unmatched = new Map<string, Unmatched>();
  let total = 0;
  let matched = 0;
  for (const s of i.sales) {
    if (!inPeriod.has(s.month)) continue;
    const net = s.net_sales ?? 0;
    total += net;
    const p = matchProduct(i.products, s.product_title, s.variant_title);
    if (p) {
      matched += net;
      const a = acc.get(p.id) ?? { units: 0, net: 0 };
      a.units += unitsOf(s);
      a.net += net;
      acc.set(p.id, a);
    } else {
      const key = `${s.product_title}\u0000${s.variant_title}`;
      const u = unmatched.get(key) ?? { product_title: s.product_title, variant_title: s.variant_title, units: 0, net_sales: 0 };
      u.units += unitsOf(s);
      u.net_sales += net;
      unmatched.set(key, u);
    }
  }
  const iva = i.settings.iva ?? 0;
  const rows: RankRow[] = i.products.filter((p) => p.active).map((product) => {
    const cost = unitCost(product, i.settings, i.pm);
    const { units, net } = acc.get(product.id) ?? { units: 0, net: 0 };
    const variable = cost.materials + cost.fees + cost.shipping;
    const real = cost.status === "ok" ? net / (1 + iva) - units * variable : null;
    return { product, cost, units, net_sales: net, real_contribution: real, tag: null };
  });

  const margin = (r: RankRow) => r.cost.full_pct ?? r.cost.contribution_pct;
  const sold = rows.filter((r) => r.cost.status === "ok" && r.units > 0);
  const mMargin = sold.length ? median(sold.map((r) => margin(r) ?? 0)) : 0;
  const mReal = sold.length ? median(sold.map((r) => r.real_contribution ?? 0)) : 0;
  const mUnits = sold.length ? median(sold.map((r) => r.units)) : 0;
  for (const r of rows) {
    if (r.cost.status !== "ok") r.tag = "incompleto";
    else if ((r.cost.full ?? r.cost.contribution ?? 0) < 0) r.tag = "revisar_precio";
    else if (r.units > 0 && (margin(r) ?? 0) >= mMargin && (r.real_contribution ?? 0) >= mReal) r.tag = "potenciar";
    else if (r.units > 0 && (margin(r) ?? 0) >= mMargin && r.units < mUnits) r.tag = "poco_volumen";
  }
  rows.sort((a, b) => (b.real_contribution ?? -Infinity) - (a.real_contribution ?? -Infinity) || a.product.position - b.product.position);
  return {
    rows,
    unmatched: [...unmatched.values()].sort((a, b) => b.net_sales - a.net_sales),
    matched_share: total ? matched / total : null,
  };
}

/**
 * Ventas al mes (con IVA) que cubren los costes fijos y la publicidad, con el % de contribución real del periodo
 * (ponderado por lo vendido de productos con escandallo completo).
 */
export function breakEven(i: { totals: FixedCostTotals; metaMonthlyAvg: number | null; ranking: Ranking; iva: number | null }): {
  sales: number | null; contribution_pct: number | null; covered_share: number | null;
} {
  const complete = i.ranking.rows.filter((r) => r.real_contribution !== null && r.net_sales > 0);
  const allNet = i.ranking.rows.reduce((a, r) => a + r.net_sales, 0) + i.ranking.unmatched.reduce((a, u) => a + u.net_sales, 0);
  if (complete.length === 0 || allNet === 0) return { sales: null, contribution_pct: null, covered_share: null };
  const iva = 1 + (i.iva ?? 0);
  const real = complete.reduce((a, r) => a + r.real_contribution!, 0);
  const netNoVat = complete.reduce((a, r) => a + r.net_sales, 0) / iva;
  const pct = netNoVat ? real / netNoVat : null;
  const fixed = i.totals.personal + i.totals.estructura + (i.metaMonthlyAvg ?? 0);
  return {
    sales: pct && pct > 0 ? (fixed / pct) * iva : null,
    contribution_pct: pct,
    covered_share: complete.reduce((a, r) => a + r.net_sales, 0) / allNet,
  };
}

export type MonthResult = { month: YearMonth; sales: number | null; expenses: number | null; result: number | null; comment: string };

/** Ventas con IVA (Resultados) frente a gastos con IVA, mes a mes. */
export function monthlyResults(i: { months: YearMonth[]; monthly: MonthlyRow[]; expenses: { month: YearMonth; amount: number | null; comment: string }[] }): MonthResult[] {
  const sales = new Map(i.monthly.map((r) => [r.month, r.ventas_totales]));
  const exp = new Map(i.expenses.map((e) => [e.month, e]));
  return i.months.map((month) => {
    const s = sales.get(month) ?? null;
    const e = exp.get(month);
    const expenses = e?.amount ?? null;
    return { month, sales: s, expenses, result: s !== null && expenses !== null ? s - expenses : null, comment: e?.comment ?? "" };
  });
}
