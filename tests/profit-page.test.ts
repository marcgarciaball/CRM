import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContributionBars, RankingTable } from "@/components/profit/ranking-table";
import { Summary } from "@/components/profit/summary";
import { perMinute } from "@/lib/profit/costing";
import { rankProducts } from "@/lib/profit/ranking";
import type { CostSettings, Product, ProductSale } from "@/lib/profit/types";

// Cifras inventadas.
const settings: CostSettings = {
  iva: 0.21, horas_productivas_anuales: 3200, precio_tela_m2: 7, tinta_m2: null, merma_tela: 0, reimpresion: 0,
  roturas: 0, comision_pct: null, comision_fija_pedido: null, envio_neto_pedido: null, unidades_por_pedido: 3,
};
let n = 0;
const product = (over: Partial<Product>): Product => ({
  id: `p${n}`, position: n++, family: "Lámina", format: "A5", price: 12.1, fabric_w_cm: null, fabric_h_cm: null, minutes: 0,
  support_cost: 0, packaging_cost: 0, shopify_title: "Lámina", variant_match: null, active: true, note: "", ...over,
});
const sale = (variant: string, quantity: number, net: number, title = "Lámina"): ProductSale =>
  ({ month: "2026-03", product_title: title, variant_title: variant, quantity, net_sales: net, reversed_quantity: 0, orders: quantity });

describe("RankingTable", () => {
  const ranking = rankProducts({
    products: [
      product({ family: "Buena", variant_match: "a", support_cost: 2 }),
      product({ family: "Barata", variant_match: "b", support_cost: 6 }),
      product({ family: "Pérdidas", variant_match: "c", support_cost: 11 }),
      product({ family: "Rara", variant_match: "d", support_cost: 1 }),
      product({ family: "Rota", variant_match: "e", price: null }),
    ],
    settings, pm: perMinute({ personal: 0, estructura: 0 }, settings), months: ["2026-03"],
    sales: [sale("a", 100, 1210), sale("b", 80, 968), sale("c", 50, 605), sale("d", 2, 24.2), sale("e", 5, 60.5), sale("x", 10, 121, "Botella")],
  });
  const html = renderToStaticMarkup(createElement(RankingTable, { ranking }));

  it("muestra las etiquetas de qué potenciar", () => {
    for (const label of ["Potenciar", "Revisar precio", "Poco volumen", "Incompleto"]) expect(html).toContain(label);
  });
  it("marca los márgenes sin comisiones ni envío", () => {
    expect(html).toContain("sin comisiones");
    expect(html).toContain("sin envío");
  });
  it("la gráfica de aportación no depende del orden de la tabla", () => {
    const byUnits = { ...ranking, rows: [...ranking.rows].sort((a, b) => b.units - a.units) };
    const titles = (r: typeof ranking) => [...renderToStaticMarkup(createElement(ContributionBars, { ranking: r })).matchAll(/<li[^>]*title="([^":]+)/g)].map((x) => x[1].split(" · ")[0]);
    expect(titles(byUnits)).toEqual(["Buena", "Barata", "Rara", "Pérdidas"]);
  });
  it("lista lo vendido sin escandallo", () => {
    expect(html).toContain("Sin escandallo");
    expect(html).toContain("Botella");
  });
});

describe("Summary", () => {
  it("sin punto de equilibrio dice sin dato", () => {
    const html = renderToStaticMarkup(createElement(Summary, {
      sales: null, expenses: null, result: null, span: "", fixedMonthly: 0, breakEven: { sales: null, contribution_pct: null, covered_share: null },
      perMinute: null, metaMonthlyAvg: null,
    }));
    expect(html).toContain("Punto de equilibrio");
    expect(html).toContain("sin dato");
  });
});
