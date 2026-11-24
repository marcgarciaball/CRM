import { AppError } from "../errors";

const THOUSANDS = /^-?[1-9]\d{0,2}(\.\d{3})+$/;

/**
 * Número escrito a mano, en formato español o con punto decimal: «1.234,5», «1234,5», «1234.5» y «1.234» (miles).
 * Vacío → null (sin dato).
 */
export function parseDecimal(raw: string, label: string): number | null {
  const v = raw.trim().replace(/\s|€|%/g, "");
  if (!v) return null;
  let normalized: string;
  if (v.includes(",")) normalized = v.replace(/\./g, "").replace(",", ".");
  else if (THOUSANDS.test(v)) normalized = v.replace(/\./g, "");
  else normalized = v;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) throw new AppError(`${label[0].toUpperCase()}${label.slice(1)} no es un número («${raw.trim()}»).`);
  return Number(normalized);
}

export function decimal(fd: FormData, key: string, label: string): number | null {
  const v = fd.get(key);
  return parseDecimal(typeof v === "string" ? v : "", label);
}

/** Porcentaje escrito como «35» → 0,35. */
export function percent(fd: FormData, key: string, label: string): number | null {
  const n = decimal(fd, key, label);
  return n === null ? null : n / 100;
}
