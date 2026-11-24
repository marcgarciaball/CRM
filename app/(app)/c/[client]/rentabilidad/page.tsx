import type { Metadata } from "next";
import { Expenses } from "@/components/profit/expenses";
import { FixedCosts, ProductsEditor, SettingsForm } from "@/components/profit/escandallo";
import { ProfitFormats, ProfitImportDialog } from "@/components/profit/import-dialog";
import { ContributionBars, RankingTable } from "@/components/profit/ranking-table";
import { Summary } from "@/components/profit/summary";
import { Legend, MonthBars, type Series } from "@/components/results/charts";
import { PageHeader, Section, Tabs } from "@/components/ui";
import { todayMadrid } from "@/lib/dates";
import { loadClient } from "@/lib/load";
import { enumParam, one, type SearchParams } from "@/lib/params";
import { clientPath } from "@/lib/paths";
import { perMinute } from "@/lib/profit/costing";
import { breakEven, metaMonthlyAverage, monthlyResults, rankProducts, type Ranking } from "@/lib/profit/ranking";
import { availableYears, computeResults, defaultPeriod, parsePeriod, type MonthView, type Period } from "@/lib/results/compute";
import { eur0, monthSpan } from "@/lib/results/format";
import {
  fixedCostTotals, getSettings, listExpenses, listFixedCosts, listProductSales, listProducts, shopifyTitles,
} from "@/lib/services/profit";
import { listMetaMonths, listMonthly } from "@/lib/services/results";

export const metadata: Metadata = { title: "Rentabilidad" };

const SORTS = ["aportacion", "margen", "unidades"] as const;
const periodKey = (p: Period) => (p.kind === "last12" ? "12m" : String(p.year));
const periodLabel = (p: Period) => (p.kind === "last12" ? "últimos 12 meses" : String(p.year));

function sortRanking(r: Ranking, by: (typeof SORTS)[number]): Ranking {
  if (by === "aportacion") return r;
  const key = by === "margen" ? (x: Ranking["rows"][number]) => x.cost.full_pct ?? x.cost.contribution_pct : (x: Ranking["rows"][number]) => x.units;
  return { ...r, rows: [...r.rows].sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity)) };
}

/** Rentabilidad: escandallo editable, márgenes por producto, qué potenciar y gastos frente a ventas. */
export default async function ProfitPage({ params, searchParams }: { params: Promise<{ client: string }>; searchParams: SearchParams }) {
  const sp = await searchParams;
  const today = todayMadrid();
  const data = await loadClient((await params).client, async (q, _user, client) => {
    const monthly = await listMonthly(q, client.id);
    const meta = await listMetaMonths(q, client.id);
    const expenses = await listExpenses(q, client.id);
    const period = parsePeriod(one(sp.periodo), defaultPeriod(monthly, today));
    const results = computeResults({ monthly, meta, period, today });
    const first = results.months[0].month;
    const last = results.months.at(-1)!.month;
    return {
      monthly, meta, expenses, period, results,
      settings: await getSettings(q, client.id),
      totals: await fixedCostTotals(q, client.id),
      lines: client.my_role === "owner" ? await listFixedCosts(q, client.id) : [],
      products: await listProducts(q, client.id),
      sales: await listProductSales(q, client.id, first, last),
      titles: await shopifyTitles(q, client.id),
    };
  });
  const { client, results, period, settings, totals } = data;
  const readOnly = !!client.archived_at;
  const isOwner = client.my_role === "owner";
  const base = clientPath(client.id, "rentabilidad");
  const sort = enumParam(sp.orden, SORTS) ?? "aportacion";
  const q = (extra: Record<string, string>) => `${base}?${new URLSearchParams({ periodo: periodKey(period), orden: sort, ...extra })}`;

  const pastMonths = results.months.filter((m) => m.state !== "future");
  const months = pastMonths.map((m) => m.month);
  const pm = perMinute(totals, settings);
  const ranking = sortRanking(rankProducts({ products: data.products, settings, pm, sales: data.sales, months }), sort);
  const metaMonthlyAvg = metaMonthlyAverage(pastMonths, today.slice(0, 7));
  const be = breakEven({ totals, metaMonthlyAvg, ranking, iva: settings.iva });
  const monthRows = monthlyResults({ months, monthly: data.monthly, expenses: data.expenses, partial: pastMonths.filter((m) => m.state === "partial").map((m) => m.month) });
  const both = monthRows.filter((r) => r.result !== null);
  const sum = (f: (r: (typeof both)[number]) => number) => (both.length ? both.reduce((a, r) => a + f(r), 0) : null);
  const partialFlags = [...new Set(ranking.rows.flatMap((r) => (r.cost.status === "ok" ? r.cost.partial : [])))];

  const years = [...new Set([...availableYears(data.monthly, data.meta), ...data.expenses.map((e) => Number(e.month.slice(0, 4)))])].sort((a, b) => b - a);
  const tabs = [
    ...years.map((y) => ({ key: String(y), label: String(y), href: q({ periodo: String(y) }) })),
    { key: "12m", label: "Últimos 12 meses", href: q({ periodo: "12m" }) },
  ];
  const byMonth = new Map(monthRows.map((r) => [r.month, r]));
  const SERIES: Series[] = [
    { key: "sales", label: "Ventas (con IVA)", swatch: "bg-ink", value: (m: MonthView) => byMonth.get(m.month)?.sales ?? null },
    { key: "exp", label: "Gastos (con IVA)", swatch: "bg-accent", value: (m: MonthView) => byMonth.get(m.month)?.expenses ?? null },
  ];
  const actions = readOnly ? undefined : <ProfitImportDialog clientId={client.id} isOwner={isOwner} />;
  const empty = data.products.length === 0 && data.expenses.length === 0 && data.sales.length === 0 && totals.personal + totals.estructura === 0;

  return (
    <>
      <PageHeader title="Rentabilidad" eyebrow={`${client.name} · ${periodLabel(period)}`} actions={actions}>
        <p className="mt-1 text-xs text-muted">Márgenes con los costes y precios actuales del escandallo.</p>
      </PageHeader>
      {empty ? (
        <Section title="Aún no hay datos">
          <p className="mb-3 text-sm">Rellena el escandallo aquí abajo o súbelo con «Importar CSV». Estos son los archivos que se admiten:</p>
          <ProfitFormats isOwner={isOwner} />
        </Section>
      ) : (
        <>
          <Tabs tabs={tabs} current={periodKey(period)} />
          {partialFlags.length > 0 && (
            <p role="note" className="mb-4 border border-ink bg-st-warn-bg px-3 py-2 text-sm text-st-warn-fg">
              Faltan {partialFlags.join(" y ")} en los supuestos: los márgenes no los incluyen y son algo mejores de lo real.
            </p>
          )}
          <Summary sales={sum((r) => r.sales!)} expenses={sum((r) => r.expenses!)} result={sum((r) => r.result!)}
            span={monthSpan(both.map((r) => r.month))} fixedMonthly={totals.personal + totals.estructura} breakEven={be} perMinute={pm} metaMonthlyAvg={metaMonthlyAvg} />

          <Section title="Ventas y gastos por mes">
            <Legend series={SERIES} />
            <MonthBars months={results.months} series={SERIES} format={eur0} label="Ventas y gastos con IVA por mes"
              hasData={(m) => byMonth.get(m.month)?.sales != null || byMonth.get(m.month)?.expenses != null} />
            {monthRows.some((r) => r.comment) && (
              <ul className="mt-3 space-y-0.5 text-xs">
                {monthRows.filter((r) => r.comment).map((r) => <li key={r.month}><span className="font-mono uppercase">{monthSpan([r.month])}</span> · {r.comment}</li>)}
              </ul>
            )}
          </Section>

          <Section title="Qué potenciar" actions={
            <nav aria-label="Ordenar" className="flex gap-1 text-xs">
              {([["aportacion", "Aportación"], ["margen", "Margen"], ["unidades", "Unidades"]] as const).map(([k, l]) => (
                <a key={k} href={q({ orden: k })} aria-current={sort === k ? "true" : undefined} className={`px-2 py-1 ${sort === k ? "bg-ink text-white" : "hover:bg-subtle"}`}>{l}</a>
              ))}
            </nav>
          }>
            <ContributionBars ranking={ranking} />
            <RankingTable ranking={ranking} />
          </Section>
        </>
      )}

      <Section title="Escandallo: supuestos">
        <SettingsForm clientId={client.id} settings={settings} readOnly={readOnly} />
      </Section>
      <Section title="Escandallo: costes fijos">
        <FixedCosts clientId={client.id} isOwner={isOwner} lines={data.lines} totals={totals} readOnly={readOnly} />
      </Section>
      <Section title="Escandallo: productos" count={data.products.length}>
        <ProductsEditor clientId={client.id} products={data.products} shopifyTitles={data.titles} isOwner={isOwner} readOnly={readOnly} />
      </Section>
      <Section title="Gastos mensuales">
        <Expenses clientId={client.id} rows={monthRows} canEdit={isOwner && !readOnly} />
      </Section>
    </>
  );
}
