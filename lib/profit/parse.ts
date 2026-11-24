import { isYearMonth, type YearMonth } from "../dates";
import { AppError } from "../errors";
import { parseCsv } from "../results/csv";
import type { FixedCostGroup, Product, ProductSale } from "./types";

export type ProductInput = Omit<Product, "id">;
export type FixedCostInput = { group: FixedCostGroup; concept: string; monthly_amount: number | null; note: string; position: number };
export type ExpenseInput = { month: YearMonth; amount: number | null; comment: string };
export type ParsedProfitFile =
  | { kind: "product_sales"; rows: ProductSale[] }
  | { kind: "products"; rows: ProductInput[] }
  | { kind: "fixed_costs"; rows: FixedCostInput[] }
  | { kind: "expenses"; rows: ExpenseInput[] };

const NUMBER = /^-?\d+(\.\d+)?$/;
function num(cell: string | undefined, line: number, column: string): number | null {
  const v = (cell ?? "").trim();
  if (!v) return null;
  if (!NUMBER.test(v)) throw new AppError(`Fila ${line}: ${column} no es un número («${v}»).`);
  return Number(v);
}
const cellOf = (header: string[], cells: string[]) => (name: string) => {
  const i = header.indexOf(name);
  return i < 0 ? "" : (cells[i] ?? "").trim();
};

/**
 * Archivos de Rentabilidad: export de Shopify de ventas por producto y variante, escandallo de productos,
 * costes fijos y gastos mensuales. Devuelve null si el archivo no es ninguno de ellos.
 */
export function parseProfitCsv(text: string): ParsedProfitFile | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;
  const header = rows[0].map((h) => h.trim());
  const body = rows.slice(1);
  const has = (...cols: string[]) => cols.every((c) => header.includes(c));
  if (has("Month", "Product title", "Product variant title", "Net sales", "Quantity ordered")) return productSales(header, body);
  if (has("familia", "formato", "precio", "producto_shopify")) return products(header, body);
  if (has("grupo", "concepto", "importe_mes")) return fixedCosts(header, body);
  if (has("mes", "gastos")) return expenses(header, body);
  return null;
}

function requireRows(body: string[][]) {
  if (body.length === 0) throw new AppError("El archivo no tiene filas.");
}

function productSales(header: string[], body: string[][]): ParsedFrom<"product_sales"> {
  requireRows(body);
  const out = new Map<string, ProductSale>();
  const compare = header.find((h) => /^Month \(\d+\)$/.test(h));
  const suffixes = ["", ...(compare ? [compare.slice("Month".length)] : [])];
  // Un mes que el archivo trae como principal manda: si también aparece como comparación, esa copia no se suma.
  const mainMonths = new Set(body.map((cells) => cellOf(header, cells)("Month").slice(0, 7)));
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = cellOf(header, cells);
    const title = get("Product title");
    if (!title) return;
    const variant = get("Product variant title");
    for (const sfx of suffixes) {
      const month = get(`Month${sfx}`).slice(0, 7);
      if (!isYearMonth(month)) throw new AppError(`Fila ${line}: mes no válido («${get(`Month${sfx}`)}»).`);
      const net = num(get(`Net sales${sfx}`), line, `Net sales${sfx}`);
      const qty = num(get(`Quantity ordered${sfx}`), line, `Quantity ordered${sfx}`);
      if (!net && !qty) continue;
      if (sfx && mainMonths.has(month)) continue;
      const rev = num(get(`Reversed quantity${sfx}`), line, `Reversed quantity${sfx}`);
      const orders = num(get(`Orders${sfx}`), line, `Orders${sfx}`);
      const key = `${month}\u0000${title}\u0000${variant}`;
      const prev = out.get(key);
      if (!prev) out.set(key, { month, product_title: title, variant_title: variant, net_sales: net, quantity: qty, reversed_quantity: rev, orders });
      else {
        const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
        prev.net_sales = add(prev.net_sales, net);
        prev.quantity = add(prev.quantity, qty);
        prev.reversed_quantity = add(prev.reversed_quantity, rev);
        prev.orders = add(prev.orders, orders);
      }
    }
  });
  if (out.size === 0) throw new AppError("El archivo no tiene ventas.");
  return { kind: "product_sales", rows: [...out.values()] };
}

type ParsedFrom<K extends ParsedProfitFile["kind"]> = Extract<ParsedProfitFile, { kind: K }>;

const YES = ["", "sí", "si", "1", "true", "yes"];
const NO = ["no", "0", "false"];

function products(header: string[], body: string[][]): ParsedFrom<"products"> {
  requireRows(body);
  const rows = body.map((cells, i): ProductInput => {
    const line = i + 2;
    const get = cellOf(header, cells);
    const family = get("familia");
    if (!family) throw new AppError(`Fila ${line}: falta la familia.`);
    const active = get("activo").toLowerCase();
    if (!YES.includes(active) && !NO.includes(active)) throw new AppError(`Fila ${line}: activo debe ser sí o no.`);
    return {
      position: i, family: family.slice(0, 160), format: get("formato").slice(0, 160),
      price: num(get("precio"), line, "precio"), fabric_w_cm: num(get("tela_ancho_cm"), line, "tela_ancho_cm"),
      fabric_h_cm: num(get("tela_alto_cm"), line, "tela_alto_cm"), minutes: num(get("minutos"), line, "minutos"),
      support_cost: num(get("soporte"), line, "soporte"), packaging_cost: num(get("embalaje"), line, "embalaje"),
      shopify_title: get("producto_shopify") || null, variant_match: get("variante_contiene") || null,
      active: !NO.includes(active), note: get("nota").slice(0, 1000),
    };
  });
  return { kind: "products", rows };
}

function fixedCosts(header: string[], body: string[][]): ParsedFrom<"fixed_costs"> {
  requireRows(body);
  const rows = body.map((cells, i): FixedCostInput => {
    const line = i + 2;
    const get = cellOf(header, cells);
    const group = get("grupo").toLowerCase();
    if (group !== "personal" && group !== "estructura") throw new AppError(`Fila ${line}: grupo debe ser personal o estructura.`);
    const concept = get("concepto");
    if (!concept) throw new AppError(`Fila ${line}: falta el concepto.`);
    return { group, concept: concept.slice(0, 160), monthly_amount: num(get("importe_mes"), line, "importe_mes"), note: get("nota").slice(0, 500), position: i };
  });
  return { kind: "fixed_costs", rows };
}

function expenses(header: string[], body: string[][]): ParsedFrom<"expenses"> {
  requireRows(body);
  const seen = new Set<string>();
  const rows = body.map((cells, i): ExpenseInput => {
    const line = i + 2;
    const get = cellOf(header, cells);
    const month = get("mes");
    if (!isYearMonth(month)) throw new AppError(`Fila ${line}: mes no válido («${month}»). Usa AAAA-MM.`);
    if (seen.has(month)) throw new AppError(`El mes ${month} aparece dos veces.`);
    seen.add(month);
    return { month, amount: num(get("gastos"), line, "gastos"), comment: get("comentario").slice(0, 300) };
  });
  return { kind: "expenses", rows };
}
