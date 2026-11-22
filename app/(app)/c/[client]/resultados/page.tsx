import type { Metadata } from "next";
import { CampaignBands, Legend, MonthBars, type Series } from "@/components/results/charts";
import { ClearResults, FormatHelp, ImportDialog } from "@/components/results/import-dialog";
import { KpiGrid } from "@/components/results/kpis";
import { MetaCampaignsTable, MonthlyTable } from "@/components/results/tables";
import { Collapsed, PageHeader, Section, Tabs } from "@/components/ui";
import { formatInstant, monthRange, todayMadrid } from "@/lib/dates";
import { loadClient } from "@/lib/load";
import { one, type SearchParams } from "@/lib/params";
import { clientPath } from "@/lib/paths";
import { availableYears, computeResults, defaultPeriod, parsePeriod, type MonthView, type Period } from "@/lib/results/compute";
import { eur0, int } from "@/lib/results/format";
import { campaignsForRange } from "@/lib/services/campaigns";
import { lastImports, listMetaCampaigns, listMetaMonths, listMonthly, type LastImport } from "@/lib/services/results";

export const metadata: Metadata = { title: "Resultados" };

const periodKey = (p: Period) => (p.kind === "last12" ? "12m" : String(p.year));
const periodLabel = (p: Period) => (p.kind === "last12" ? "últimos 12 meses" : String(p.year));
const lastLine = (what: string, l: LastImport) => l ? `${what}: ${l.by ?? "alguien"}, ${formatInstant(l.at)}` : `${what}: nunca`;

const orig = (m: MonthView) => {
  const r = m.m;
  if (!r) return null;
  const parts = [r.ventas_google_bing_org, r.ventas_directo, r.ventas_instagram_sin_pago, r.ventas_email];
  return parts.every((v) => v === null) ? null : parts.reduce<number>((a, v) => a + (v ?? 0), 0);
};
const rest = (m: MonthView) => {
  const r = m.m;
  if (!r || (r.ventas_otros === null && r.ventas_sin_atribuir === null)) return null;
  return (r.ventas_otros ?? 0) + (r.ventas_sin_atribuir ?? 0);
};

const SALES: Series[] = [
  { key: "cur", label: "Ventas totales", swatch: "bg-ink", value: (m) => m.m?.ventas_totales ?? null },
  { key: "prev", label: "Mismo mes del año anterior", swatch: "bg-[#8c8c8c]", value: (m) => m.prev?.ventas_totales ?? null },
];
const SPEND: Series[] = [{ key: "spend", label: "Inversión en Meta", swatch: "bg-accent", value: (m) => m.meta?.spend ?? null }];
const ORIGIN: Series[] = [
  { key: "org", label: "Orgánico (Google, directo, Instagram, email)", swatch: "bg-ink", value: orig },
  { key: "paid", label: "Meta de pago (UTM)", swatch: "bg-accent", value: (m) => m.m?.ventas_meta_pago_utm ?? null },
  { key: "rest", label: "Otros y sin origen", swatch: "bg-[#8c8c8c]", value: rest },
];
const CUSTOMERS: Series[] = [
  { key: "new", label: "Nuevos", swatch: "bg-ink", value: (m) => m.m?.clientes_nuevos ?? null },
  { key: "back", label: "Repiten", swatch: "bg-accent", value: (m) => m.m?.clientes_recurrentes ?? null },
];

/** Panel de resultados: ventas, descuentos, inversión en Meta y campañas, por meses. Lo ve todo el equipo del cliente. */
export default async function ResultsPage({ params, searchParams }: { params: Promise<{ client: string }>; searchParams: SearchParams }) {
  const sp = await searchParams;
  const today = todayMadrid();
  const data = await loadClient((await params).client, async (q, _user, client) => {
    const monthly = await listMonthly(q, client.id);
    const meta = await listMetaMonths(q, client.id);
    const period = parsePeriod(one(sp.periodo), defaultPeriod(monthly, today));
    const results = computeResults({ monthly, meta, period, today });
    const first = results.months[0].month;
    const last = results.months.at(-1)!.month;
    return {
      monthly, meta, period, results,
      campaigns: await campaignsForRange(q, client.id, monthRange(first).first, monthRange(last).last),
      metaCampaigns: await listMetaCampaigns(q, client.id, first, last),
      imports: await lastImports(q, client.id),
    };
  });
  const { client, results, period } = data;
  const readOnly = !!client.archived_at;
  const base = clientPath(client.id, "resultados");
  const years = availableYears(data.monthly, data.meta);
  const tabs = [
    ...years.map((y) => ({ key: String(y), label: String(y), href: `${base}?periodo=${y}` })),
    { key: "12m", label: "Últimos 12 meses", href: `${base}?periodo=12m` },
  ];
  const empty = data.monthly.length === 0 && data.meta.length === 0;
  const actions = readOnly ? undefined : <ImportDialog clientId={client.id} />;

  if (empty) {
    return (
      <>
        <PageHeader title="Resultados" eyebrow={client.name} actions={actions} />
        <Section title="Aún no hay datos">
          <p className="mb-3 text-sm">Sube los archivos con «Importar CSV» y aquí verás ventas, descuentos, inversión en Meta y campañas mes a mes.</p>
          <FormatHelp />
          <p className="text-xs text-muted">Columnas del histórico mensual: <code className="font-mono break-all">mes, ventas_brutas, descuentos, devoluciones, ventas_netas, envios, ventas_totales, pedidos, pedido_medio_shopify, articulos, sesiones, sesiones_carrito, sesiones_checkout, sesiones_compra, conversion, ventas_google_bing_org, ventas_directo, ventas_instagram_sin_pago, ventas_meta_pago_utm, ventas_email, ventas_otros, ventas_sin_atribuir, clientes_nuevos, clientes_recurrentes, ventas_clientes_nuevos, ventas_clientes_recurrentes</code> (y opcional <code className="font-mono">datos_hasta</code>).</p>
        </Section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Resultados" eyebrow={`${client.name} · ${periodLabel(period)}`} actions={actions}>
        <p className="mt-1 text-xs text-muted">{lastLine("Histórico mensual", data.imports.monthly)} · {lastLine("Meta Ads", data.imports.meta)}</p>
      </PageHeader>
      <Tabs tabs={tabs} current={periodKey(period)} />

      <KpiGrid results={results} />

      <Section title="Ventas e inversión por mes">
        <Legend series={SALES} />
        <MonthBars months={results.months} series={SALES} format={eur0} hasData={(m) => m.m?.ventas_totales != null} label="Ventas totales por mes frente al mismo mes del año anterior" />
        <p className="mt-4 mb-1 text-xs font-bold">Inversión en Meta</p>
        <MonthBars months={results.months} series={SPEND} format={eur0} hasData={(m) => m.meta?.spend != null} height={80} label="Inversión en Meta por mes" />
        <CampaignBands months={results.months.map((m) => m.month)} campaigns={data.campaigns} />
      </Section>

      <Section title="De dónde vienen las ventas">
        <Legend series={ORIGIN} />
        <MonthBars months={results.months} series={ORIGIN} stacked format={eur0} hasData={(m) => orig(m) !== null} label="Ventas por origen del pedido, por mes" />
      </Section>

      <Section title="Clientes nuevos y que repiten">
        <Legend series={CUSTOMERS} />
        <MonthBars months={results.months} series={CUSTOMERS} format={int} hasData={(m) => m.m?.clientes_nuevos != null} height={120} label="Clientes nuevos y que repiten por mes" />
      </Section>

      <Section title="Campañas de Meta" count={data.metaCampaigns.length}>
        <MetaCampaignsTable campaigns={data.metaCampaigns} />
      </Section>

      <Section title="Mes a mes">
        <MonthlyTable months={results.months} />
      </Section>

      {results.gaps.length > 0 && (
        <Section title="Datos que faltan">
          <ul className="list-disc space-y-1 pl-5 text-sm">{results.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
        </Section>
      )}

      {!readOnly && client.my_role === "owner" && (
        <Collapsed title="Opciones">
          <p className="mb-2 text-sm">Borra el histórico mensual y el informe de Meta de este cliente. No se puede deshacer.</p>
          <ClearResults clientId={client.id} />
        </Collapsed>
      )}
    </>
  );
}
