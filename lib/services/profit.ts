import type { YearMonth } from "../dates";
import type { Q } from "../db/types";
import type { ExpenseInput, FixedCostInput, ProductInput } from "../profit/parse";
import { EMPTY_SETTINGS, SETTINGS_FIELDS, type CostSettings, type FixedCostTotals, type Product, type ProductSale } from "../profit/types";

// `numeric` llega como texto: se lee como float8. Los meses viajan como «AAAA-MM».

export async function getSettings(q: Q, clientId: string): Promise<CostSettings> {
  const rows = await q<CostSettings>(
    `select ${SETTINGS_FIELDS.map((f) => `${f}::float8 as ${f}`).join(", ")} from client_cost_settings where client_id = $1`, [clientId],
  );
  return rows[0] ?? { ...EMPTY_SETTINGS };
}

export async function saveSettings(q: Q, clientId: string, s: CostSettings): Promise<void> {
  const cols = ["client_id", ...SETTINGS_FIELDS];
  await q(
    `insert into client_cost_settings (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
     on conflict (client_id) do update set ${SETTINGS_FIELDS.map((f) => `${f} = excluded.${f}`).join(", ")},
       updated_by = auth.uid(), updated_at = now()`,
    [clientId, ...SETTINGS_FIELDS.map((f) => s[f])],
  );
}

/** Totales al mes por grupo (lo ve todo el equipo; un grupo sin líneas es 0). */
export async function fixedCostTotals(q: Q, clientId: string): Promise<FixedCostTotals> {
  const rows = await q<{ grp: "personal" | "estructura"; monthly: number }>("select grp, monthly::float8 as monthly from fixed_cost_totals($1)", [clientId]);
  const totals: FixedCostTotals = { personal: 0, estructura: 0 };
  for (const r of rows) totals[r.grp] = r.monthly;
  return totals;
}

export type FixedCost = FixedCostInput & { id: string };

/** Líneas de costes fijos: solo la Propiedad las recibe; al resto, la base de datos le devuelve una lista vacía. */
export function listFixedCosts(q: Q, clientId: string): Promise<FixedCost[]> {
  return q<FixedCost>(
    `select id, grp as "group", concept, monthly_amount::float8 as monthly_amount, note, position
       from client_fixed_costs where client_id = $1 order by grp desc, position, concept`,
    [clientId],
  );
}

export async function saveFixedCost(q: Q, clientId: string, id: string | null, c: Omit<FixedCostInput, "position">): Promise<void> {
  if (id) {
    await q("update client_fixed_costs set grp = $3, concept = $4, monthly_amount = $5, note = $6 where id = $1 and client_id = $2",
      [id, clientId, c.group, c.concept, c.monthly_amount, c.note]);
  } else {
    await q(
      `insert into client_fixed_costs (client_id, grp, concept, monthly_amount, note, position)
       values ($1, $2, $3, $4, $5, (select coalesce(max(position) + 1, 0) from client_fixed_costs where client_id = $1))`,
      [clientId, c.group, c.concept, c.monthly_amount, c.note],
    );
  }
}

export async function deleteFixedCost(q: Q, clientId: string, id: string): Promise<void> {
  await q("delete from client_fixed_costs where id = $1 and client_id = $2", [id, clientId]);
}

export async function replaceFixedCosts(q: Q, clientId: string, rows: FixedCostInput[]): Promise<number> {
  const payload = rows.map(({ group, ...r }) => ({ ...r, grp: group }));
  await q("select replace_fixed_costs($1, $2::jsonb)", [clientId, JSON.stringify(payload)]);
  return rows.length;
}

const PRODUCT_SELECT = `id, position, family, format, price::float8 as price, fabric_w_cm::float8 as fabric_w_cm,
  fabric_h_cm::float8 as fabric_h_cm, minutes::float8 as minutes, support_cost::float8 as support_cost,
  packaging_cost::float8 as packaging_cost, shopify_title, variant_match, active, note`;

export function listProducts(q: Q, clientId: string): Promise<Product[]> {
  return q<Product>(`select ${PRODUCT_SELECT} from client_products where client_id = $1 order by position, family, format`, [clientId]);
}

const PRODUCT_COLS = ["family", "format", "price", "fabric_w_cm", "fabric_h_cm", "minutes", "support_cost", "packaging_cost",
  "shopify_title", "variant_match", "active", "note"] as const;

export async function saveProduct(q: Q, clientId: string, id: string | null, p: Omit<ProductInput, "position">): Promise<void> {
  const values = PRODUCT_COLS.map((c) => p[c]);
  if (id) {
    await q(
      `update client_products set ${PRODUCT_COLS.map((c, i) => `${c} = $${i + 3}`).join(", ")}, version = version + 1
        where id = $1 and client_id = $2`,
      [id, clientId, ...values],
    );
  } else {
    await q(
      `insert into client_products (client_id, position, ${PRODUCT_COLS.join(", ")})
       values ($1, (select coalesce(max(position) + 1, 0) from client_products where client_id = $1), ${PRODUCT_COLS.map((_, i) => `$${i + 2}`).join(", ")})`,
      [clientId, ...values],
    );
  }
}

export async function deleteProduct(q: Q, clientId: string, id: string): Promise<void> {
  await q("delete from client_products where id = $1 and client_id = $2", [id, clientId]);
}

export async function replaceProducts(q: Q, clientId: string, rows: ProductInput[]): Promise<number> {
  await q("select replace_products($1, $2::jsonb)", [clientId, JSON.stringify(rows)]);
  return rows.length;
}

export async function importProductSales(q: Q, clientId: string, rows: ProductSale[]): Promise<{ rows: number; months: number }> {
  const payload = rows.map((r) => ({ ...r, month: `${r.month}-01` }));
  await q("select import_product_sales($1, $2::jsonb)", [clientId, JSON.stringify(payload)]);
  return { rows: rows.length, months: new Set(rows.map((r) => r.month)).size };
}

export function listProductSales(q: Q, clientId: string, first: YearMonth, last: YearMonth): Promise<ProductSale[]> {
  return q<ProductSale>(
    `select to_char(month, 'YYYY-MM') as month, product_title, variant_title, net_sales::float8 as net_sales,
            quantity::float8 as quantity, reversed_quantity::float8 as reversed_quantity, orders::float8 as orders
       from client_product_sales where client_id = $1 and month between $2::date and $3::date
      order by month, product_title, variant_title`,
    [clientId, `${first}-01`, `${last}-01`],
  );
}

/** Títulos de producto de Shopify importados, para elegir con qué se empareja cada producto del escandallo. */
export async function shopifyTitles(q: Q, clientId: string): Promise<string[]> {
  return (await q<{ t: string }>("select distinct product_title as t from client_product_sales where client_id = $1 order by 1", [clientId])).map((r) => r.t);
}

export function listExpenses(q: Q, clientId: string): Promise<ExpenseInput[]> {
  return q<ExpenseInput>(
    `select to_char(month, 'YYYY-MM') as month, amount::float8 as amount, comment from client_monthly_expenses
      where client_id = $1 order by month`,
    [clientId],
  );
}

export async function saveExpense(q: Q, clientId: string, e: ExpenseInput): Promise<void> {
  await q(
    `insert into client_monthly_expenses (client_id, month, amount, comment) values ($1, $2, $3, $4)
     on conflict (client_id, month) do update set amount = excluded.amount, comment = excluded.comment`,
    [clientId, `${e.month}-01`, e.amount, e.comment],
  );
}

export async function deleteExpense(q: Q, clientId: string, month: YearMonth): Promise<void> {
  await q("delete from client_monthly_expenses where client_id = $1 and month = $2", [clientId, `${month}-01`]);
}

/** Guarda los meses del archivo (sustituye los que ya existían); los demás no se tocan. */
export async function replaceExpenses(q: Q, clientId: string, rows: ExpenseInput[]): Promise<number> {
  for (const e of rows) await saveExpense(q, clientId, e);
  return rows.length;
}
