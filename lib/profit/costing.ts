import type { CostSettings, FixedCostTotals, Product } from "./types";

/** € por minuto de producción de personal y de estructura; null sin horas productivas. */
export type PerMinute = { personal: number; estructura: number } | null;

export function perMinute(totals: FixedCostTotals, s: CostSettings): PerMinute {
  const hours = s.horas_productivas_anuales;
  if (!hours) return null;
  const minutes = hours * 60;
  return { personal: (totals.personal * 12) / minutes, estructura: (totals.estructura * 12) / minutes };
}

export type UnitCost = {
  status: "ok" | "incomplete";
  /** Datos imprescindibles que faltan (en español). */
  missing: string[];
  /** Términos que faltan y se han calculado como 0: el margen lo indica. */
  partial: ("comisiones" | "envío")[];
  price_net: number | null; fabric: number; ink: number; materials: number; fees: number; shipping: number;
  contribution: number | null; contribution_pct: number | null;
  labour: number | null; structure: number | null; full: number | null; full_pct: number | null;
};

const pctOr0 = (v: number | null) => v ?? 0;

/**
 * Coste y margen de una unidad, sin IVA:
 * tela = área × precio × (1 + merma) × (1 + reimpresión); tinta = área × tinta/m² × (1 + reimpresión);
 * materiales = (tela + tinta + soporte + embalaje) × (1 + roturas); comisiones = PVP × % + fijo ÷ uds/pedido;
 * envío = envío neto ÷ uds/pedido; contribución = PVP sin IVA − materiales − comisiones − envío;
 * completo = contribución − minutos × (€/min personal + €/min estructura).
 */
export function unitCost(p: Product, s: CostSettings, pm: PerMinute): UnitCost {
  const missing: string[] = [];
  const partial: UnitCost["partial"] = [];
  if (p.price === null) missing.push("precio");
  if (s.iva === null) missing.push("IVA");
  const hasFabric = p.fabric_w_cm !== null && p.fabric_h_cm !== null;
  if (hasFabric && s.precio_tela_m2 === null) missing.push("precio de la tela");

  const area = hasFabric ? (p.fabric_w_cm! * p.fabric_h_cm!) / 10_000 : 0;
  const reprint = 1 + pctOr0(s.reimpresion);
  const fabric = area * (s.precio_tela_m2 ?? 0) * (1 + pctOr0(s.merma_tela)) * reprint;
  const ink = area * (s.tinta_m2 ?? 0) * reprint;
  const materials = (fabric + ink + (p.support_cost ?? 0) + (p.packaging_cost ?? 0)) * (1 + pctOr0(s.roturas));

  const perOrder = (v: number | null) => (v !== null && s.unidades_por_pedido ? v / s.unidades_por_pedido : null);
  if (s.comision_pct === null) partial.push("comisiones");
  const fees = (p.price ?? 0) * pctOr0(s.comision_pct) + (perOrder(s.comision_fija_pedido) ?? 0);
  const shippingPerUnit = perOrder(s.envio_neto_pedido);
  if (shippingPerUnit === null) partial.push("envío");
  const shipping = shippingPerUnit ?? 0;

  const base = { missing, partial, fabric, ink, materials, fees, shipping };
  if (missing.length) {
    return { ...base, status: "incomplete", price_net: null, contribution: null, contribution_pct: null, labour: null, structure: null, full: null, full_pct: null };
  }
  const priceNet = p.price! / (1 + s.iva!);
  const contribution = priceNet - materials - fees - shipping;
  const pct = (v: number) => (priceNet > 0 ? v / priceNet : null);
  const labour = pm && p.minutes !== null ? p.minutes * pm.personal : null;
  const structure = pm && p.minutes !== null ? p.minutes * pm.estructura : null;
  const full = labour !== null && structure !== null ? contribution - labour - structure : null;
  return {
    ...base, status: "ok", price_net: priceNet, contribution, contribution_pct: pct(contribution),
    labour, structure, full, full_pct: full === null ? null : pct(full),
  };
}
