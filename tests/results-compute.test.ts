import { describe, expect, it } from "vitest";
import { MONTHLY_FIELDS, type MonthlyRow } from "@/lib/results/columns";
import { availableYears, computeResults, defaultPeriod, parsePeriod, type MetaMonth, type Period } from "@/lib/results/compute";
import { eur, int, monthSpan, pct, ratio } from "@/lib/results/format";

// Cifras inventadas.
const empty = Object.fromEntries(MONTHLY_FIELDS.map((f) => [f, null])) as Record<(typeof MONTHLY_FIELDS)[number], null>;
const row = (month: string, v: Partial<MonthlyRow>): MonthlyRow => ({ ...empty, month, data_until: null, ...v });
const months = (year: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${year}-${String(from + i).padStart(2, "0")}`);

const monthly: MonthlyRow[] = [
  ...months(2025, 2, 10).map((m) => row(m, { ventas_totales: 100, pedidos: 2, sesiones: 100, sesiones_compra: 4 })),
  ...months(2026, 1, 10).map((m) => row(m, { ventas_totales: 500, pedidos: 10, sesiones: 200, sesiones_compra: 6 })),
  row("2026-11", { ventas_totales: 30, pedidos: 1, data_until: "2026-11-02" }),
];
const meta: MetaMonth[] = [...months(2025, 11, 12), ...months(2026, 1, 10)]
  .map((m) => ({ month: m, spend: 10, impressions: 1000, clicks: 50, purchases: null }));
const today = "2026-11-22";
const y = (year: number): Period => ({ kind: "year", year });

describe("computeResults", () => {
  const r = computeResults({ monthly, meta, period: y(2026), today });

  it("recorre los 12 meses y marca parcial y futuro", () => {
    expect(r.months).toHaveLength(12);
    expect(r.months[10]).toMatchObject({ month: "2026-11", state: "partial", data_until: "2026-11-02" });
    expect(r.months[11].state).toBe("future");
    expect(r.months[0].state).toBe("complete");
  });

  it("suma solo meses completos y dice qué falta", () => {
    expect(r.kpis.ventas_totales.value).toBe(5000);
    expect(r.kpis.ventas_totales.missing).toEqual(["2026-11"]);
    expect(r.kpis.pedido_medio.value).toBe(50);
    expect(r.kpis.conversion.value).toBeCloseTo(60 / 2000);
  });

  it("compara solo con los meses que tienen dato en los dos años", () => {
    expect(r.kpis.ventas_totales.compare).toEqual({ current: 4500, previous: 900, months: months(2026, 2, 10) });
    expect(r.months[1].prev?.ventas_totales).toBe(100);
    expect(r.months[0].prev).toBeNull();
  });

  it("inversión en Meta sin comparación si el año anterior no tiene gasto", () => {
    expect(r.kpis.inversion_meta.value).toBe(100);
    expect(r.kpis.inversion_meta.compare).toBeNull();
    expect(r.kpis.gasto_ventas.value).toBeCloseTo(100 / 5000);
  });

  it("una cifra sin columnas es sin dato, no cero", () => {
    expect(r.kpis.descuentos.value).toBeNull();
    expect(r.kpis.pct_descuento.value).toBeNull();
    expect(r.kpis.descuentos.compare).toBeNull();
  });

  it("lista los huecos de 2026", () => {
    expect(r.gaps).toEqual(["noviembre 2026 parcial (hasta el 2)"]);
  });

  it("lista los huecos de 2025 y cuenta el gasto de Meta aunque falten ventas", () => {
    const r25 = computeResults({ monthly, meta, period: y(2025), today });
    expect(r25.gaps).toEqual(["Sin ventas: ene 2025, nov–dic 2025", "Sin gasto de Meta: feb–oct 2025"]);
    expect(r25.kpis.inversion_meta.value).toBe(20);
    expect(r25.kpis.ventas_totales.value).toBe(900);
  });

  it("marca el mes en curso como parcial aunque no tenga datos_hasta", () => {
    const r2 = computeResults({ monthly: [row("2026-11", { ventas_totales: 5 })], meta: [], period: y(2026), today });
    expect(r2.months[10].state).toBe("partial");
    expect(r2.gaps).toContain("noviembre 2026 en curso");
    expect(r2.kpis.ventas_totales.value).toBeNull();
  });

  it("sin datos: todas las cifras sin dato y sin comparación", () => {
    const r0 = computeResults({ monthly: [], meta: [], period: y(2026), today });
    for (const k of Object.values(r0.kpis)) {
      expect(k.value).toBeNull();
      expect(k.compare).toBeNull();
    }
  });

  it("últimos 12 meses: del mes actual hacia atrás", () => {
    const r12 = computeResults({ monthly, meta, period: { kind: "last12" }, today });
    expect(r12.months.map((m) => m.month)).toEqual([...months(2025, 12, 12), ...months(2026, 1, 11)]);
  });
});

describe("periodo", () => {
  it("lee el parámetro", () => {
    const fb = y(2020);
    expect(parsePeriod("12m", fb)).toEqual({ kind: "last12" });
    expect(parsePeriod("2025", fb)).toEqual(y(2025));
    expect(parsePeriod("abc", fb)).toBe(fb);
    expect(parsePeriod(undefined, fb)).toBe(fb);
  });
  it("por defecto, el año más reciente con datos", () => {
    expect(defaultPeriod(monthly, today)).toEqual(y(2026));
    expect(defaultPeriod([], "2027-03-01")).toEqual(y(2027));
  });
  it("años disponibles, del más reciente al más antiguo", () => {
    expect(availableYears(monthly, meta)).toEqual([2026, 2025]);
  });
});

describe("formato", () => {
  const n = (s: string) => s.replace(/[  ]/g, " ");
  it("euros, enteros y porcentajes en español", () => {
    expect(n(eur(1234.5))).toBe("1.234,50 €");
    expect(eur(null)).toBe("sin dato");
    expect(n(int(3200))).toBe("3.200");
    expect(n(pct(0.032))).toBe("3,2 %");
  });
  it("variación: ×N desde el doble, si no ± %", () => {
    expect(ratio(4900, 1000)).toBe("×4,9");
    expect(ratio(109, 100)).toBe("+9 %");
    expect(ratio(88, 100)).toBe("−12 %");
  });
  it("tramos de meses", () => {
    expect(monthSpan(months(2025, 2, 10))).toBe("feb–oct 2025");
    expect(monthSpan(["2025-11", "2025-12", "2026-01"])).toBe("nov 2025–ene 2026");
    expect(monthSpan(["2025-01", "2025-11", "2025-12"])).toBe("ene 2025, nov–dic 2025");
    expect(monthSpan([])).toBe("");
  });
});
