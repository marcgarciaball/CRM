import { addMonths } from "@/lib/dates";
import type { Kpi, KpiKey, Results } from "@/lib/results/compute";
import { eur, eur0, int, monthSpan, pct, ratio } from "@/lib/results/format";

type Tile = {
  key: KpiKey; label: string; format: (n: number | null) => string;
  /** «ratio»: ×N / ±%; «value»: cifra de este año frente a la del anterior (porcentajes). */
  compareAs: "ratio" | "value";
  extra?: (r: Results) => string | null;
};

const TILES: Tile[] = [
  { key: "ventas_totales", label: "Ventas totales", format: eur0, compareAs: "ratio" },
  { key: "pedidos", label: "Pedidos", format: int, compareAs: "ratio" },
  { key: "pedido_medio", label: "Pedido medio", format: eur, compareAs: "ratio" },
  {
    key: "descuentos", label: "Descuentos", format: eur0, compareAs: "ratio",
    extra: (r) => r.kpis.pct_descuento.value === null ? null : `${pct(r.kpis.pct_descuento.value)} de las ventas brutas`,
  },
  {
    key: "inversion_meta", label: "Inversión en Meta", format: eur0, compareAs: "ratio",
    extra: (r) => r.kpis.gasto_ventas.value === null ? null : `${pct(r.kpis.gasto_ventas.value)} de las ventas`,
  },
  { key: "conversion", label: "Conversión", format: pct, compareAs: "value" },
  { key: "clientes_nuevos", label: "Clientes nuevos", format: int, compareAs: "ratio" },
  { key: "pct_recurrentes", label: "Clientes que repiten", format: pct, compareAs: "value" },
];

function compareLine(k: Kpi, t: Tile): string | null {
  if (!k.compare) return null;
  const span = monthSpan(k.compare.months.map((m) => addMonths(m, -12)));
  return t.compareAs === "ratio"
    ? `${ratio(k.compare.current, k.compare.previous)} frente a ${span}`
    : `${t.format(k.compare.current)} frente a ${t.format(k.compare.previous)} en ${span}`;
}

/** Cifras clave del periodo. Lo que no cuenta (meses sin dato o a medias) se dice debajo de cada cifra. */
export function KpiGrid({ results }: { results: Results }) {
  return (
    <dl className="mb-8 grid grid-cols-2 border-t-2 border-l border-ink md:grid-cols-4">
      {TILES.map((t) => {
        const k = results.kpis[t.key];
        const cmp = compareLine(k, t);
        const extra = t.extra?.(results);
        return (
          <div key={t.key} className="min-w-0 border-r border-b border-ink p-3">
            <dt className="eyebrow">{t.label}</dt>
            <dd className={`mt-1 font-mono text-xl font-bold tracking-tight md:text-2xl ${k.value === null ? "text-muted" : ""}`}>{t.format(k.value)}</dd>
            {extra && <dd className="text-xs">{extra}</dd>}
            {cmp && <dd className="mt-1 text-xs text-muted">{cmp}</dd>}
            {k.value !== null && k.missing.length > 0 && <dd className="mt-1 text-xs text-muted">Sin contar: {monthSpan(k.missing)}</dd>}
          </div>
        );
      })}
    </dl>
  );
}
