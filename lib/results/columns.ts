import type { LocalDate, YearMonth } from "../dates";

/** Cifras del histórico mensual (Shopify). Los nombres coinciden con las columnas del CSV y de la tabla. */
export const MONTHLY_FIELDS = [
  "ventas_brutas", "descuentos", "devoluciones", "ventas_netas", "envios", "ventas_totales", "pedidos",
  "pedido_medio_shopify", "articulos", "sesiones", "sesiones_carrito", "sesiones_checkout", "sesiones_compra", "conversion",
  "ventas_google_bing_org", "ventas_directo", "ventas_instagram_sin_pago", "ventas_meta_pago_utm", "ventas_email",
  "ventas_otros", "ventas_sin_atribuir", "clientes_nuevos", "clientes_recurrentes", "ventas_clientes_nuevos",
  "ventas_clientes_recurrentes",
] as const;

/** Columnas de Meta del histórico mensual: se aceptan pero se ignoran (Meta sale solo de su informe). */
export const IGNORED_MONTHLY = ["meta_gasto", "meta_compras_segun_meta", "meta_impresiones", "meta_clics"] as const;

export type MonthlyField = (typeof MONTHLY_FIELDS)[number];
/** Un mes del histórico. `null` es «sin dato», nunca cero. */
export type MonthlyRow = { month: YearMonth; data_until: LocalDate | null } & Record<MonthlyField, number | null>;

export type MetaAdRow = {
  month: YearMonth; campaign_name: string; ad_name: string;
  reach: number | null; impressions: number | null; clicks: number | null; spend: number | null; purchases: number | null;
};
