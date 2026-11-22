"use server";

import { run, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import type { Q } from "@/lib/db";
import { AppError, toAppError } from "@/lib/errors";
import { text, uuid } from "@/lib/form";
import { parseResultsCsv, type ParsedFile } from "@/lib/results/parse";
import { getClient } from "@/lib/services/clients";
import { clearResults, replaceMetaAds, upsertMonthly } from "@/lib/services/results";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** Las acciones de servidor admiten 1 MB por petición; los archivos reales pesan unos pocos KB. */
const MAX_RESULTS_FILE = 512 * 1024;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** El cliente existe para la persona y admite cambios. */
async function writableClient(q: Q, clientId: string) {
  const client = await getClient(q, clientId);
  if (!client) throw new AppError("No tienes acceso a este cliente.", "forbidden");
  if (client.archived_at) throw new AppError("Este cliente está archivado: solo lectura.");
  return client;
}

async function readFile(fd: FormData): Promise<ParsedFile> {
  const file = fd.get("file");
  if (!(file instanceof File) || !file.name) throw new AppError("Elige un archivo.");
  if (!file.name.toLowerCase().endsWith(".csv")) throw new AppError("Sube un archivo .csv.");
  if (file.size > MAX_RESULTS_FILE) throw new AppError("El archivo pesa más de 512 KB.");
  if (file.size === 0) throw new AppError("El archivo está vacío.");
  return parseResultsCsv(await file.text());
}

/** Importa el histórico mensual o el informe de Meta. El archivo se lee entero antes de escribir nada. */
export const importResultsAction: Action = async (_prev, fd) => {
  await requireUser();
  let clientId: string;
  let parsed: ParsedFile;
  try {
    clientId = uuid(fd, "client_id");
    parsed = await readFile(fd);
  } catch (e) {
    return { error: toAppError(e).message };
  }
  return run(async (q) => {
    await writableClient(q, clientId);
    const warning = parsed.warnings.join(" ") || undefined;
    if (parsed.kind === "monthly") {
      const { added, replaced } = await upsertMonthly(q, clientId, parsed.rows);
      const notice = `Histórico mensual: ${plural(parsed.rows.length, "mes", "meses")} (${plural(added, "nuevo", "nuevos")}, ${plural(replaced, "sustituido", "sustituidos")}).`;
      return { state: { ok: true, notice, warning } };
    }
    const { rows, months } = await replaceMetaAds(q, clientId, parsed.rows);
    return { state: { ok: true, notice: `Meta Ads: ${plural(rows, "fila", "filas")} en ${plural(months, "mes", "meses")}.`, warning } };
  });
};

/** Borra todos los resultados del cliente. Solo la Propiedad, escribiendo «BORRAR». */
export const clearResultsAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const client = await writableClient(q, uuid(fd, "client_id"));
    if (client.my_role !== "owner") throw new AppError("Solo la Propiedad puede borrar los resultados.", "forbidden");
    if (text(fd, "confirm", "la confirmación") !== "BORRAR") throw new AppError("Escribe BORRAR para confirmar.");
    await clearResults(q, client.id);
    return { state: { ok: true, notice: "Resultados borrados." } };
  });
