import { isLocalDate, isYearMonth } from "../dates";
import { AppError } from "../errors";
import { IGNORED_MONTHLY, MONTHLY_FIELDS, type MetaAdRow, type MonthlyField, type MonthlyRow } from "./columns";
import { parseCsv } from "./csv";

export type ParsedFile =
  | { kind: "monthly"; rows: MonthlyRow[]; warnings: string[] }
  | { kind: "meta"; rows: MetaAdRow[]; warnings: string[] };

const NUMBER = /^-?\d+(\.\d+)?$/;

/** Número del CSV (punto decimal). Vacío → null; cualquier otra cosa es un error de la fila. */
function num(cell: string | undefined, line: number, column: string): number | null {
  const v = (cell ?? "").trim();
  if (!v) return null;
  if (!NUMBER.test(v)) throw new AppError(`Fila ${line}: ${column} no es un número («${v}»).`);
  return Number(v);
}

/**
 * Lee un CSV de resultados: el histórico mensual (columna «mes») o el informe de Meta Ads por campaña, anuncio y mes.
 * Lanza AppError con un mensaje para la persona si el archivo no es válido; nunca devuelve datos a medias.
 */
export function parseResultsCsv(text: string): ParsedFile {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new AppError("El archivo está vacío.");
  const header = rows[0].map((h) => h.trim());
  if (header.includes("mes")) return parseMonthly(header, rows.slice(1));
  if (header.includes("Nombre de la campaña") && header.includes("Importe gastado (EUR)")) return parseMeta(header, rows.slice(1));
  if (header.length === 1 && header[0].includes(";")) {
    throw new AppError("El archivo está separado por punto y coma: expórtalo con comas (CSV estándar).");
  }
  throw new AppError("No reconozco el archivo. Sube el histórico mensual (columna «mes») o el informe de Meta Ads (columna «Nombre de la campaña»).");
}

function parseMonthly(header: string[], body: string[][]): ParsedFile {
  const known = new Set<string>(["mes", "datos_hasta", ...MONTHLY_FIELDS, ...IGNORED_MONTHLY]);
  const unknown = header.filter((h) => !known.has(h));
  if (unknown.length) throw new AppError(`Columnas desconocidas: ${unknown.join(", ")}.`);
  if (body.length === 0) throw new AppError("El archivo no tiene filas.");
  const col = (name: string) => header.indexOf(name);
  const present = MONTHLY_FIELDS.filter((f) => col(f) >= 0);
  const warnings: string[] = [];
  const absent = MONTHLY_FIELDS.filter((f) => col(f) < 0);
  if (absent.length) warnings.push(`Faltan columnas (quedan sin dato): ${absent.join(", ")}.`);
  const seen = new Set<string>();
  const out = body.map((cells, i) => {
    const line = i + 2;
    const month = (cells[col("mes")] ?? "").trim();
    if (!isYearMonth(month)) throw new AppError(`Fila ${line}: mes no válido («${month}»). Usa AAAA-MM.`);
    if (seen.has(month)) throw new AppError(`El mes ${month} aparece dos veces.`);
    seen.add(month);
    const until = col("datos_hasta") >= 0 ? (cells[col("datos_hasta")] ?? "").trim() : "";
    if (until && (!isLocalDate(until) || until.slice(0, 7) !== month)) {
      throw new AppError(`Fila ${line}: datos_hasta no es de ${month} («${until}»).`);
    }
    const row = { month, data_until: until || null } as MonthlyRow;
    for (const f of MONTHLY_FIELDS) row[f as MonthlyField] = present.includes(f) ? num(cells[col(f)], line, f) : null;
    return row;
  });
  return { kind: "monthly", rows: out.sort((a, b) => a.month.localeCompare(b.month)), warnings };
}

const META_COLUMNS = {
  campaign_name: "Nombre de la campaña", ad_name: "Nombre del anuncio", month: "Mes",
  reach: "Alcance", clicks: "Clics (todos)", impressions: "Impresiones", spend: "Importe gastado (EUR)", purchases: "Compras",
} as const;
const META_NUMBERS = ["reach", "impressions", "clicks", "spend", "purchases"] as const;

function parseMeta(header: string[], body: string[][]): ParsedFile {
  const missing = Object.values(META_COLUMNS).filter((c) => !header.includes(c));
  if (missing.length) throw new AppError(`Al informe de Meta le faltan columnas: ${missing.join(", ")}.`);
  const col = (k: keyof typeof META_COLUMNS) => header.indexOf(META_COLUMNS[k]);
  const byKey = new Map<string, MetaAdRow>();
  body.forEach((cells, i) => {
    const line = i + 2;
    const campaign = (cells[col("campaign_name")] ?? "").trim();
    if (!campaign) return; // fila de totales del informe
    const month = (cells[col("month")] ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0]?.slice(0, 7);
    if (!month || !isYearMonth(month)) throw new AppError(`Fila ${line}: mes no válido («${cells[col("month")] ?? ""}»).`);
    const row: MetaAdRow = {
      month, campaign_name: campaign.slice(0, 300), ad_name: (cells[col("ad_name")] ?? "").trim().slice(0, 300),
      reach: null, impressions: null, clicks: null, spend: null, purchases: null,
    };
    for (const k of META_NUMBERS) row[k] = num(cells[col(k)], line, META_COLUMNS[k]);
    const key = `${row.month}\u0000${row.campaign_name}\u0000${row.ad_name}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, row);
    else for (const k of META_NUMBERS) prev[k] = prev[k] === null && row[k] === null ? null : (prev[k] ?? 0) + (row[k] ?? 0);
  });
  if (byKey.size === 0) throw new AppError("El archivo no tiene filas.");
  return { kind: "meta", rows: [...byKey.values()], warnings: [] };
}
