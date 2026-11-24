import { describe, expect, it } from "vitest";
import { MONTHLY_FIELDS, type MonthlyRow } from "@/lib/results/columns";
import { perMinute } from "@/lib/profit/costing";
import { matchProduct, normalize } from "@/lib/profit/match";
import { breakEven, monthlyResults, rankProducts } from "@/lib/profit/ranking";
import type { CostSettings, Product, ProductSale } from "@/lib/profit/types";

// Cifras inventadas.
const settings: CostSettings = {
  iva: 0.21, horas_productivas_anuales: 3200, precio_tela_m2: 7, tinta_m2: null, merma_tela: 0, reimpresion: 0,
  roturas: 0, comision_pct: 0, comision_fija_pedido: 0, envio_neto_pedido: 0, unidades_por_pedido: 3,
};
const pm = perMinute({ personal: 0, estructura: 0 }, settings);
let n = 0;
const product = (over: Partial<Product>): Product => ({
  id: `p${n}`, position: n++, family: "F", format: "", price: 12.1, fabric_w_cm: null, fabric_h_cm: null, minutes: 0,
  support_cost: 0, packaging_cost: 0, shopify_title: "Lámina", variant_match: null, active: true, note: "", ...over,
});
const sale = (product_title: string, variant_title: string, quantity: number, net_sales: number, month = "2026-03", reversed_quantity = 0): ProductSale =>
  ({ month, product_title, variant_title, quantity, net_sales, reversed_quantity, orders: quantity });

describe("emparejar con Shopify", () => {
  it("normaliza mayúsculas, espacios y * por x", () => {
    expect(normalize("  15*21CM /  Vertical ")).toBe("15x21cm / vertical");
  });
  it("título igual y texto de variante contenido; gana el primero por posición; se ignoran los inactivos", () => {
    const off = product({ id: "off", variant_match: "15x21cm", active: false });
    const a = product({ id: "a", variant_match: "15x21cm" });
    const b = product({ id: "b", variant_match: "15x21" });
    const any = product({ id: "any" });
    const list = [off, a, b, any];
    expect(matchProduct(list, "lámina", "15*21cm / Vertical")?.id).toBe("a");
    expect(matchProduct(list, "Lámina", "10x15cm")?.id).toBe("any");
    expect(matchProduct(list, "Botella", "10x15cm")).toBeNull();
  });
});

describe("rankProducts", () => {
  // Precio 12,10 € con IVA = 10 € sin IVA. Coste variable: soporte.
  const good = product({ id: "good", variant_match: "a", support_cost: 2 });       // margen 8 €
  const cheap = product({ id: "cheap", variant_match: "b", support_cost: 6 });     // margen 4 €
  const loss = product({ id: "loss", variant_match: "c", support_cost: 11 });      // margen −1 €
  const rare = product({ id: "rare", variant_match: "d", support_cost: 1 });       // margen 9 €, pocas uds
  const broken = product({ id: "broken", variant_match: "e", price: null });
  const products = [good, cheap, loss, rare, broken];
  const sales = [
    sale("Lámina", "a", 100, 1210, "2026-03", 2),
    sale("Lámina", "b", 80, 968),
    sale("Lámina", "c", 50, 605),
    sale("Lámina", "d", 2, 24.2),
    sale("Lámina", "e", 5, 60.5),
    sale("Botella", "x", 10, 121),
    sale("Lámina", "a", 999, 9999, "2025-01"), // fuera del periodo
  ];
  const r = rankProducts({ products, settings, pm, sales, months: ["2026-03"] });
  const row = (id: string) => r.rows.find((x) => x.product.id === id)!;

  it("cuenta unidades netas del periodo y aportación real con lo cobrado", () => {
    expect(row("good").units).toBe(98);
    expect(row("good").net_sales).toBe(1210);
    expect(row("good").real_contribution).toBeCloseTo(1210 / 1.21 - 98 * 2);
  });

  it("lista lo vendido sin escandallo y la parte de ventas emparejada", () => {
    expect(r.unmatched).toEqual([{ product_title: "Botella", variant_title: "x", units: 10, net_sales: 121 }]);
    const total = 1210 + 968 + 605 + 24.2 + 60.5 + 121;
    expect(r.matched_share).toBeCloseTo((total - 121) / total);
  });

  it("etiquetas: incompleto, revisar precio, potenciar y poco volumen", () => {
    expect(row("broken").tag).toBe("incompleto");
    expect(row("loss").tag).toBe("revisar_precio");
    expect(row("good").tag).toBe("potenciar");
    expect(row("rare").tag).toBe("poco_volumen");
    expect(row("cheap").tag).toBeNull();
  });

  it("ordena por aportación real, sin dato al final", () => {
    expect(r.rows[0].product.id).toBe("good");
    expect(r.rows.at(-1)!.product.id).toBe("broken");
  });

  it("un producto activo sin ventas aparece con 0 unidades", () => {
    const r2 = rankProducts({ products: [good], settings, pm, sales: [], months: ["2026-03"] });
    expect(r2.rows[0]).toMatchObject({ units: 0, net_sales: 0, real_contribution: 0, tag: null });
    expect(r2.matched_share).toBeNull();
  });
});

describe("breakEven", () => {
  it("(fijos + Meta) ÷ % de contribución, en ventas con IVA", () => {
    const sales = [sale("Lámina", "", 100, 1210)];
    const r = rankProducts({ products: [product({ support_cost: 5 })], settings, pm, sales, months: ["2026-03"] });
    const be = breakEven({ totals: { personal: 6000, estructura: 4000 }, metaMonthlyAvg: 1000, ranking: r, iva: 0.21 });
    expect(be.contribution_pct).toBeCloseTo(0.5);
    expect(be.sales).toBeCloseTo((11000 / 0.5) * 1.21);
    expect(be.covered_share).toBeCloseTo(1);
  });
  it("sin ventas con escandallo no hay punto de equilibrio", () => {
    const r = rankProducts({ products: [], settings, pm, sales: [], months: ["2026-03"] });
    expect(breakEven({ totals: { personal: 1, estructura: 1 }, metaMonthlyAvg: null, ranking: r, iva: 0.21 })).toEqual({ sales: null, contribution_pct: null, covered_share: null });
  });
});

describe("monthlyResults", () => {
  const blank = Object.fromEntries(MONTHLY_FIELDS.map((f) => [f, null]));
  const monthly = [{ ...blank, month: "2026-04", data_until: null, ventas_totales: 14000 } as MonthlyRow];
  it("ventas − gastos solo si hay las dos cifras", () => {
    const r = monthlyResults({
      months: ["2025-11", "2026-04", "2026-05"], monthly,
      expenses: [{ month: "2025-11", amount: 6500, comment: "" }, { month: "2026-04", amount: 18610, comment: "abrimos oficinas" }],
    });
    expect(r).toEqual([
      { month: "2025-11", sales: null, expenses: 6500, result: null, comment: "" },
      { month: "2026-04", sales: 14000, expenses: 18610, result: -4610, comment: "abrimos oficinas" },
      { month: "2026-05", sales: null, expenses: null, result: null, comment: "" },
    ]);
  });
});
