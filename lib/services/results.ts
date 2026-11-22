import type { YearMonth } from "../dates";
import type { Q } from "../db/types";
import { MONTHLY_FIELDS, type MetaAdRow, type MonthlyRow } from "../results/columns";
import type { MetaMonth } from "../results/compute";

// `numeric` llega como texto desde los dos drivers: se lee como float8. Los meses viajan como «AAAA-MM».
const FIELDS_SELECT = MONTHLY_FIELDS.map((f) => `${f}::float8 as ${f}`).join(", ");

/** Guarda meses del histórico; un mes que ya existe se sustituye entero. Los meses que no vienen no se tocan. */
export async function upsertMonthly(q: Q, clientId: string, rows: MonthlyRow[]): Promise<{ added: number; replaced: number }> {
  const months = rows.map((r) => `${r.month}-01`);
  const existing = await q<{ n: number }>(
    "select count(*)::int as n from client_metrics_monthly where client_id = $1 and month = any ($2::date[])", [clientId, months],
  );
  const cols = ["client_id", "month", "data_until", ...MONTHLY_FIELDS];
  const sql = `insert into client_metrics_monthly (${cols.join(", ")})
    values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
    on conflict (client_id, month) do update set ${cols.slice(2).map((c) => `${c} = excluded.${c}`).join(", ")},
      imported_by = auth.uid(), imported_at = now()`;
  for (const r of rows) await q(sql, [clientId, `${r.month}-01`, r.data_until, ...MONTHLY_FIELDS.map((f) => r[f])]);
  const replaced = existing[0].n;
  return { added: rows.length - replaced, replaced };
}

/**
 * Sustituye los meses del informe de Meta que trae el archivo; los demás meses se conservan.
 * Borrar e insertar van juntos en `import_meta_ads` (la base de datos no deja vaciar meses sin poner filas).
 */
export async function replaceMetaAds(q: Q, clientId: string, rows: MetaAdRow[]): Promise<{ rows: number; months: number }> {
  const payload = rows.map((r) => ({ ...r, month: `${r.month}-01` }));
  await q("select import_meta_ads($1, $2::jsonb)", [clientId, JSON.stringify(payload)]);
  return { rows: rows.length, months: new Set(rows.map((r) => r.month)).size };
}

export function listMonthly(q: Q, clientId: string): Promise<MonthlyRow[]> {
  return q<MonthlyRow>(
    `select to_char(month, 'YYYY-MM') as month, data_until, ${FIELDS_SELECT}
       from client_metrics_monthly where client_id = $1 order by month`,
    [clientId],
  );
}

/** Totales de Meta por mes. Una cifra es null si ninguna fila del mes la tiene. */
export function listMetaMonths(q: Q, clientId: string): Promise<MetaMonth[]> {
  return q<MetaMonth>(
    `select to_char(month, 'YYYY-MM') as month, sum(spend)::float8 as spend, sum(impressions)::float8 as impressions,
            sum(clicks)::float8 as clicks, sum(purchases)::float8 as purchases
       from client_meta_ads where client_id = $1 group by month order by month`,
    [clientId],
  );
}

export type MetaCampaign = {
  campaign_name: string; months: YearMonth[];
  spend: number | null; clicks: number | null; impressions: number | null; purchases: number | null;
};

/** Campañas de Meta con gasto entre dos meses (incluidos), de mayor a menor gasto. */
export function listMetaCampaigns(q: Q, clientId: string, first: YearMonth, last: YearMonth): Promise<MetaCampaign[]> {
  return q<MetaCampaign>(
    `select campaign_name, array_agg(distinct to_char(month, 'YYYY-MM') order by to_char(month, 'YYYY-MM')) as months,
            sum(spend)::float8 as spend, sum(clicks)::float8 as clicks, sum(impressions)::float8 as impressions,
            sum(purchases)::float8 as purchases
       from client_meta_ads
      where client_id = $1 and month between $2::date and $3::date
      group by campaign_name
      order by sum(spend) desc nulls last, campaign_name
      limit 200`,
    [clientId, `${first}-01`, `${last}-01`],
  );
}

export type LastImport = { by: string | null; at: Date } | null;

/** Última importación de cada archivo: quién (nombre) y cuándo. */
export async function lastImports(q: Q, clientId: string): Promise<{ monthly: LastImport; meta: LastImport }> {
  const last = async (table: "client_metrics_monthly" | "client_meta_ads"): Promise<LastImport> =>
    (await q<{ by: string | null; at: Date }>(
      `select p.display_name as by, t.imported_at as at from ${table} t left join profiles p on p.id = t.imported_by
        where t.client_id = $1 order by t.imported_at desc limit 1`,
      [clientId],
    ))[0] ?? null;
  return { monthly: await last("client_metrics_monthly"), meta: await last("client_meta_ads") };
}

/** Borra todos los resultados del cliente (las reglas de la base de datos solo lo permiten a la Propiedad). */
export async function clearResults(q: Q, clientId: string): Promise<void> {
  await q("delete from client_metrics_monthly where client_id = $1", [clientId]);
  await q("delete from client_meta_ads where client_id = $1", [clientId]);
}
