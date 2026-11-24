import type { YearMonth } from "../dates";

/** Supuestos generales del escandallo. Porcentajes como fracción (0,21 = 21 %). `null` = sin dato. */
export type CostSettings = {
  iva: number | null; horas_productivas_anuales: number | null; precio_tela_m2: number | null;
  tinta_m2: number | null; merma_tela: number | null; reimpresion: number | null; roturas: number | null;
  comision_pct: number | null; comision_fija_pedido: number | null; envio_neto_pedido: number | null;
  unidades_por_pedido: number | null;
};
export const SETTINGS_FIELDS = [
  "iva", "horas_productivas_anuales", "precio_tela_m2", "tinta_m2", "merma_tela", "reimpresion", "roturas",
  "comision_pct", "comision_fija_pedido", "envio_neto_pedido", "unidades_por_pedido",
] as const satisfies readonly (keyof CostSettings)[];
export const EMPTY_SETTINGS = Object.fromEntries(SETTINGS_FIELDS.map((f) => [f, null])) as CostSettings;

export type FixedCostGroup = "personal" | "estructura";
/** Costes fijos al mes por grupo. */
export type FixedCostTotals = Record<FixedCostGroup, number>;

export type Product = {
  id: string; position: number; family: string; format: string; price: number | null;
  fabric_w_cm: number | null; fabric_h_cm: number | null; minutes: number | null; support_cost: number | null;
  packaging_cost: number | null; shopify_title: string | null; variant_match: string | null; active: boolean; note: string;
};

/** Ventas de una variante de Shopify en un mes (export por producto y variante). */
export type ProductSale = {
  month: YearMonth; product_title: string; variant_title: string; net_sales: number | null;
  quantity: number | null; reversed_quantity: number | null; orders: number | null;
};
