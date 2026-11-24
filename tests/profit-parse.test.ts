import { describe, expect, it } from "vitest";
import { parseProfitCsv } from "@/lib/profit/parse";

// Cifras inventadas.
const SALES_HEADER = `"Month","Product title","Product variant title","Product variant SKU","Gross sales","Discounts","Sales reversals","Net sales","Quantity ordered","Reversed quantity","Orders","Cost of goods sold","Gross profit","Gross margin","Month (20250101)","Gross sales (20250101)","Discounts (20250101)","Sales reversals (20250101)","Net sales (20250101)","Quantity ordered (20250101)","Reversed quantity (20250101)","Orders (20250101)","Cost of goods sold (20250101)","Gross profit (20250101)","Gross margin (20250101)"`;
const salesRow = (title: string, variant: string, net: number, qty: number, rev: number, netPrev: number, qtyPrev: number) =>
  `"2026-03-01","${title}","${variant}",,${net},0,0,${net},${qty},${rev},${qty},,,,"2025-03-01",${netPrev},0,0,${netPrev},${qtyPrev},0,${qtyPrev},,,`;

describe("ventas por producto (export de Shopify)", () => {
  it("cada fila da sus dos meses", () => {
    const r = parseProfitCsv(`${SALES_HEADER}\n${salesRow("Lámina", "15x21cm / A color", 200, 10, -1, 40, 2)}`);
    expect(r).toEqual({
      kind: "product_sales",
      rows: [
        { month: "2026-03", product_title: "Lámina", variant_title: "15x21cm / A color", net_sales: 200, quantity: 10, reversed_quantity: -1, orders: 10 },
        { month: "2025-03", product_title: "Lámina", variant_title: "15x21cm / A color", net_sales: 40, quantity: 2, reversed_quantity: 0, orders: 2 },
      ],
    });
  });
  it("descarta la mitad sin ventas ni unidades y suma las repetidas", () => {
    const r = parseProfitCsv([SALES_HEADER, salesRow("A", "v", 10, 1, 0, 0, 0), salesRow("A", "v", 5, 2, 0, 0, 0)].join("\n"));
    expect(r?.rows).toEqual([{ month: "2026-03", product_title: "A", variant_title: "v", net_sales: 15, quantity: 3, reversed_quantity: 0, orders: 3 }]);
  });
});

describe("ventas por producto: meses repetidos entre las dos mitades", () => {
  it("si un mes viene como principal y como comparación, cuenta solo el principal (no se duplica)", () => {
    const row = (month: string, prevMonth: string, net: number, prevNet: number) =>
      `"${month}-01","A","v",,${net},0,0,${net},1,0,1,,,,"${prevMonth}-01",${prevNet},0,0,${prevNet},1,0,1,,,`;
    const r = parseProfitCsv([SALES_HEADER, row("2026-03", "2025-03", 100, 40), row("2025-03", "2024-03", 40, 10)].join("\n"));
    if (r?.kind !== "product_sales") throw new Error("tipo");
    expect(r.rows.find((x) => x.month === "2025-03")?.net_sales).toBe(40);
    expect(r.rows.map((x) => x.month).sort()).toEqual(["2024-03", "2025-03", "2026-03"]);
  });
});

describe("escandallo de productos", () => {
  const header = "familia,formato,precio,tela_ancho_cm,tela_alto_cm,minutos,soporte,embalaje,producto_shopify,variante_contiene,activo,nota";
  it("lee cada producto en orden; vacío es sin dato; activo por defecto", () => {
    const r = parseProfitCsv(`${header}\nTablitas + clip,A5 foto,20,14.8,21,3,1.10,0.50,Revelado en lámina de madera con clip,15x21cm,,\nBodas,Ramo,60,,,60,9,1,,,no,bordado`);
    expect(r).toEqual({
      kind: "products",
      rows: [
        { position: 0, family: "Tablitas + clip", format: "A5 foto", price: 20, fabric_w_cm: 14.8, fabric_h_cm: 21, minutes: 3, support_cost: 1.1,
          packaging_cost: 0.5, shopify_title: "Revelado en lámina de madera con clip", variant_match: "15x21cm", active: true, note: "" },
        { position: 1, family: "Bodas", format: "Ramo", price: 60, fabric_w_cm: null, fabric_h_cm: null, minutes: 60, support_cost: 9,
          packaging_cost: 1, shopify_title: null, variant_match: null, active: false, note: "bordado" },
      ],
    });
  });
  it("exige la familia", () => {
    expect(() => parseProfitCsv(`${header}\n,A5,20,,,,,,,,,`)).toThrow("Fila 2: falta la familia");
  });
});

describe("costes fijos", () => {
  it("lee grupo, concepto, importe y nota", () => {
    expect(parseProfitCsv("grupo,concepto,importe_mes,nota\npersonal,Salarios,2000,Nóminas\nestructura,Tinta,90,")).toEqual({
      kind: "fixed_costs",
      rows: [
        { group: "personal", concept: "Salarios", monthly_amount: 2000, note: "Nóminas", position: 0 },
        { group: "estructura", concept: "Tinta", monthly_amount: 90, note: "", position: 1 },
      ],
    });
  });
  it("el grupo es personal o estructura", () => {
    expect(() => parseProfitCsv("grupo,concepto,importe_mes,nota\nmarketing,Anuncios,1,")).toThrow("Fila 2: grupo debe ser personal o estructura");
  });
});

describe("gastos mensuales", () => {
  it("lee mes, gastos y comentario", () => {
    expect(parseProfitCsv("mes,gastos,comentario\n2026-04,18610,abrimos oficinas\n2026-05,,")).toEqual({
      kind: "expenses",
      rows: [{ month: "2026-04", amount: 18610, comment: "abrimos oficinas" }, { month: "2026-05", amount: null, comment: "" }],
    });
  });
  it("rechaza un mes no válido o repetido", () => {
    expect(() => parseProfitCsv("mes,gastos,comentario\nabril,1,")).toThrow("Fila 2: mes no válido");
    expect(() => parseProfitCsv("mes,gastos,comentario\n2026-04,1,\n2026-04,2,")).toThrow("El mes 2026-04 aparece dos veces");
  });
});

describe("otros archivos", () => {
  it("devuelve null si no es ninguno de estos formatos", () => {
    expect(parseProfitCsv("mes,ventas_totales\n2026-01,1")).toBeNull();
    expect(parseProfitCsv("")).toBeNull();
  });
  it("número no válido con su fila", () => {
    expect(() => parseProfitCsv("mes,gastos,comentario\n2026-04,\"1.234,5\",")).toThrow("Fila 2: gastos no es un número");
  });
});
