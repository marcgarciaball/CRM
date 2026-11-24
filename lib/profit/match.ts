import type { Product } from "./types";

/** Comparación tolerante: minúsculas, espacios simples y «*» como «x» (Shopify usa «15*21cm» y «15x21cm»). */
export const normalize = (s: string) => s.toLowerCase().replace(/\*/g, "x").replace(/\s+/g, " ").trim();

/**
 * El producto del escandallo que corresponde a una variante de Shopify: el primero (por posición), activo, con el mismo
 * título de Shopify y cuyo texto de variante, si lo tiene, aparece en la variante.
 */
export function matchProduct(products: Product[], title: string, variant: string): Product | null {
  const t = normalize(title);
  const v = normalize(variant);
  return [...products]
    .sort((a, b) => a.position - b.position)
    .find((p) => p.active && p.shopify_title !== null && normalize(p.shopify_title) === t
      && (!p.variant_match || v.includes(normalize(p.variant_match)))) ?? null;
}
