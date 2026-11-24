import type { PerMinute } from "@/lib/profit/costing";
import { eur, eur0, pct } from "@/lib/results/format";

/** Cifras clave de Rentabilidad: ventas y gastos con IVA, costes fijos, punto de equilibrio y coste por minuto. */
export function Summary({ sales, expenses, result, span, fixedMonthly, breakEven, perMinute, metaMonthlyAvg }: {
  sales: number | null; expenses: number | null; result: number | null; span: string; fixedMonthly: number;
  breakEven: { sales: number | null; contribution_pct: number | null; covered_share: number | null };
  perMinute: PerMinute; metaMonthlyAvg: number | null;
}) {
  const tiles: { label: string; value: string; sub?: string | null }[] = [
    { label: "Ventas (con IVA)", value: eur0(sales), sub: span ? `meses con gastos: ${span}` : null },
    { label: "Gastos (con IVA)", value: eur0(expenses) },
    { label: "Resultado", value: result === null ? "sin dato" : `${result >= 0 ? "+" : "−"}${eur0(Math.abs(result))}` },
    { label: "Costes fijos / mes", value: eur0(fixedMonthly), sub: metaMonthlyAvg !== null ? `+ ${eur0(metaMonthlyAvg)} de Meta al mes de media` : null },
    {
      label: "Punto de equilibrio", value: breakEven.sales === null ? "sin dato" : `${eur0(breakEven.sales)}/mes`,
      sub: breakEven.sales === null ? "Hace falta escandallo completo y ventas por producto."
        : `en ventas con IVA, con un ${pct(breakEven.contribution_pct)} de contribución · calculado con el ${pct(breakEven.covered_share)} de las ventas`,
    },
    {
      label: "Coste por minuto", value: perMinute ? eur(perMinute.personal + perMinute.estructura) : "sin dato",
      sub: perMinute ? `personal ${eur(perMinute.personal)} · estructura ${eur(perMinute.estructura)}` : "Faltan las horas productivas.",
    },
  ];
  return (
    <dl className="mb-8 grid grid-cols-2 border-t-2 border-l border-ink md:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0 border-r border-b border-ink p-3">
          <dt className="eyebrow">{t.label}</dt>
          <dd className={`mt-1 font-mono text-xl font-bold tracking-tight md:text-2xl ${t.value === "sin dato" ? "text-muted" : ""}`}>{t.value}</dd>
          {t.sub && <dd className="mt-1 text-xs text-muted">{t.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
