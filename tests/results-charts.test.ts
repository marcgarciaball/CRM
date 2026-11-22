import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CampaignBands, MonthBars, type Series } from "@/components/results/charts";
import type { MonthView } from "@/lib/results/compute";
import { eur0 } from "@/lib/results/format";

// Cifras inventadas. Las gráficas se pintan en el servidor: se comprueba el HTML.
const month = (m: string, cur: number | null, prev: number | null, state: MonthView["state"] = "complete"): MonthView => ({
  month: m, state, data_until: null, meta: null,
  m: { ventas_totales: cur } as MonthView["m"],
  prev: prev === null ? null : ({ ventas_totales: prev } as MonthView["prev"]),
});
const months = Array.from({ length: 12 }, (_, i) => month(`2026-${String(i + 1).padStart(2, "0")}`, 100, i === 0 ? null : 50));
const SALES: Series[] = [
  { key: "cur", label: "Ventas", swatch: "bg-ink", value: (m) => m.m?.ventas_totales ?? null },
  { key: "prev", label: "Año anterior", swatch: "bg-muted", value: (m) => m.prev?.ventas_totales ?? null },
];
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("MonthBars", () => {
  it("una serie sin dato en un mes lleva su marca «s/d», no una barra vacía", () => {
    const html = render(createElement(MonthBars, { months, series: SALES, format: eur0, hasData: () => true, label: "x" }));
    expect(html.match(/s\/d/g)).toHaveLength(1);
  });

  it("las barras apiladas no pasan de la altura de la gráfica", () => {
    const stacked = months.map((m) => ({ ...m, prev: { ventas_totales: 100 } as MonthView["prev"] }));
    const html = render(createElement(MonthBars, { months: stacked, series: SALES, stacked: true, format: eur0, hasData: () => true, height: 100, label: "x" }));
    const heights = [...html.matchAll(/data-seg="[^"]+" style="height:([\d.]+)px/g)].map((x) => Number(x[1]));
    expect(heights).toHaveLength(24);
    // Dos segmentos por mes, separados por 2px: la suma por mes cabe en 100px.
    for (let i = 0; i < heights.length; i += 2) expect(heights[i] + heights[i + 1] + 2).toBeLessThanOrEqual(100);
  });

  it("deja sitio arriba para la etiqueta del máximo y la marca «parcial»", () => {
    const partial = months.map((m, i) => (i === 10 ? { ...m, state: "partial" as const } : m));
    const html = render(createElement(MonthBars, { months: partial, series: SALES, format: eur0, hasData: () => true, label: "x" }));
    expect(html).toContain("pt-5");
  });
});

describe("CampaignBands", () => {
  it("ignora campañas sin fechas (las devuelve el calendario por sus entregables) sin romper la página", () => {
    const html = render(createElement(CampaignBands, {
      months: months.map((m) => m.month),
      campaigns: [
        { id: "a", client_id: "c", name: "Sin fechas", start_date: null, end_date: null },
        { id: "b", client_id: "c", name: "Con fechas", start_date: "2025-11-20", end_date: "2026-02-10" },
      ],
    }));
    expect(html).not.toContain("Sin fechas");
    expect(html).toContain("grid-column:1 / 3");
  });
});
