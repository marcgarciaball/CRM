import { describe, expect, it } from "vitest";
import { perMinute, unitCost } from "@/lib/profit/costing";
import type { CostSettings, Product } from "@/lib/profit/types";

// Cifras inventadas.
const settings: CostSettings = {
  iva: 0.21, horas_productivas_anuales: 3200, precio_tela_m2: 7, tinta_m2: null, merma_tela: 0.35, reimpresion: 0.15,
  roturas: 0.05, comision_pct: null, comision_fija_pedido: 0.25, envio_neto_pedido: null, unidades_por_pedido: 3.1,
};
const totals = { personal: 5000, estructura: 4000 };
const product: Product = {
  id: "p", position: 0, family: "Lámina", format: "A5 foto", price: 20, fabric_w_cm: 15, fabric_h_cm: 21, minutes: 3,
  support_cost: 1.1, packaging_cost: 0.5, shopify_title: null, variant_match: null, active: true, note: "",
};

describe("perMinute", () => {
  it("reparte personal y estructura anuales entre los minutos productivos", () => {
    expect(perMinute(totals, settings)).toEqual({ personal: (5000 * 12) / (3200 * 60), estructura: (4000 * 12) / (3200 * 60) });
  });
  it("sin horas no hay coste por minuto", () => {
    expect(perMinute(totals, { ...settings, horas_productivas_anuales: null })).toBeNull();
    expect(perMinute(totals, { ...settings, horas_productivas_anuales: 0 })).toBeNull();
  });
});

describe("unitCost", () => {
  const pm = perMinute(totals, settings)!;
  const c = unitCost(product, settings, pm);
  const fabric = 0.0315 * 7 * 1.35 * 1.15;
  const materials = (fabric + 1.1 + 0.5) * 1.05;
  const fees = 0.25 / 3.1;
  const priceNet = 20 / 1.21;

  it("calcula cada término sin IVA", () => {
    expect(c.status).toBe("ok");
    expect(c.price_net).toBeCloseTo(priceNet);
    expect(c.fabric).toBeCloseTo(fabric);
    expect(c.ink).toBe(0);
    expect(c.materials).toBeCloseTo(materials);
    expect(c.fees).toBeCloseTo(fees);
    expect(c.shipping).toBe(0);
  });

  it("márgenes de contribución y completo", () => {
    const contribution = priceNet - materials - fees;
    expect(c.contribution).toBeCloseTo(contribution);
    expect(c.contribution_pct).toBeCloseTo(contribution / priceNet);
    expect(c.labour).toBeCloseTo(3 * pm.personal);
    expect(c.structure).toBeCloseTo(3 * pm.estructura);
    expect(c.full).toBeCloseTo(contribution - 3 * pm.personal - 3 * pm.estructura);
    expect(c.full_pct).toBeCloseTo((contribution - 3 * pm.personal - 3 * pm.estructura) / priceNet);
  });

  it("marca lo que se calcula sin comisiones ni envío", () => {
    expect(c.partial).toEqual(["comisiones", "envío"]);
    const complete = unitCost(product, { ...settings, comision_pct: 0.02, envio_neto_pedido: 3.1 }, pm);
    expect(complete.partial).toEqual([]);
    expect(complete.fees).toBeCloseTo(20 * 0.02 + fees);
    expect(complete.shipping).toBeCloseTo(1);
  });

  it("tinta por m² si se indica", () => {
    expect(unitCost(product, { ...settings, tinta_m2: 2 }, pm).ink).toBeCloseTo(0.0315 * 2 * 1.15);
  });

  it("sin precio no se calcula: incompleto", () => {
    const r = unitCost({ ...product, price: null }, settings, pm);
    expect(r.status).toBe("incomplete");
    expect(r.missing).toContain("precio");
    expect(r.contribution).toBeNull();
    expect(r.full).toBeNull();
  });

  it("con tela pero sin precio de la tela: incompleto; sin medida de tela, no lleva tela", () => {
    const r = unitCost(product, { ...settings, precio_tela_m2: null }, pm);
    expect(r.status).toBe("incomplete");
    expect(r.missing).toContain("precio de la tela");
    const noFabric = unitCost({ ...product, fabric_w_cm: null, fabric_h_cm: null }, { ...settings, precio_tela_m2: null }, pm);
    expect(noFabric.status).toBe("ok");
    expect(noFabric.fabric).toBe(0);
  });

  it("sin minutos o sin coste por minuto solo hay margen de contribución", () => {
    const r = unitCost({ ...product, minutes: null }, settings, pm);
    expect(r.contribution).not.toBeNull();
    expect(r.full).toBeNull();
    expect(unitCost(product, settings, null).full).toBeNull();
  });
});
