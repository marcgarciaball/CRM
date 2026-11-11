import type { AssetKind, AssetMime } from "../assets";
import type { Q } from "../db/types";
import { AppError } from "../errors";

/** Archivo de la creatividad final de un entregable (imagen o vídeo), en el orden en que se publica. */
export type Asset = {
  id: string; deliverable_id: string; sort_order: number; kind: AssetKind;
  storage_path: string; file_name: string; mime_type: AssetMime; size_bytes: number; created_at: Date;
};

const SELECT = "select id, deliverable_id, sort_order, kind, storage_path, file_name, mime_type, size_bytes, created_at from deliverable_assets";
const ORDER = "order by sort_order, created_at, id";

export function listAssets(q: Q, deliverableId: string): Promise<Asset[]> {
  return q<Asset>(`${SELECT} where deliverable_id = $1 ${ORDER}`, [deliverableId]);
}

/** Archivos de varios entregables a la vez (vista de diapositivas), agrupados por entregable. */
export async function assetsByDeliverable(q: Q, deliverableIds: string[]): Promise<Map<string, Asset[]>> {
  const by = new Map<string, Asset[]>();
  if (deliverableIds.length === 0) return by;
  for (const a of await q<Asset>(`${SELECT} where deliverable_id = any($1::uuid[]) ${ORDER}`, [deliverableIds])) {
    by.set(a.deliverable_id, [...(by.get(a.deliverable_id) ?? []), a]);
  }
  return by;
}

export async function getAsset(q: Q, id: string): Promise<Asset | null> {
  return (await q<Asset>(`${SELECT} where id = $1`, [id]))[0] ?? null;
}

/**
 * Cliente del entregable si la persona puede subirle archivos (miembro y cliente no archivado);
 * si no, error. Se comprueba antes de firmar una subida.
 */
export async function uploadTarget(q: Q, deliverableId: string): Promise<{ client_id: string; count: number }> {
  const rows = await q<{ client_id: string; count: number }>(
    `select d.client_id, (select count(*)::int from deliverable_assets a where a.deliverable_id = d.id) as count
       from deliverables d where d.id = $1 and public.can_write_client(d.client_id)`,
    [deliverableId],
  );
  if (rows.length === 0) throw new AppError("No puedes subir archivos a este entregable.", "forbidden");
  return rows[0];
}

export type AssetInput = { deliverable_id: string; kind: AssetKind; storage_path: string; file_name: string; mime_type: AssetMime; size_bytes: number };

/** Registra un archivo ya subido. Se añade al final; la base de datos valida la ruta y el límite. */
export async function addAsset(q: Q, input: AssetInput): Promise<string> {
  const rows = await q<{ id: string }>(
    `insert into deliverable_assets (deliverable_id, kind, storage_path, file_name, mime_type, size_bytes)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [input.deliverable_id, input.kind, input.storage_path, input.file_name, input.mime_type, input.size_bytes],
  );
  return rows[0].id;
}

/** Quita un archivo y devuelve su ruta para borrarlo del almacén. */
export async function removeAsset(q: Q, id: string): Promise<string> {
  const rows = await q<{ storage_path: string }>("delete from deliverable_assets where id = $1 returning storage_path", [id]);
  if (rows.length === 0) throw new AppError("No se ha encontrado el archivo.", "not_found");
  return rows[0].storage_path;
}

/** Mueve un archivo una posición hacia delante (-1) o hacia atrás (+1) dentro de su entregable. */
export async function moveAsset(q: Q, id: string, direction: -1 | 1) {
  const asset = await getAsset(q, id);
  if (!asset) throw new AppError("No se ha encontrado el archivo.", "not_found");
  const all = await listAssets(q, asset.deliverable_id);
  const order = all.map((a) => a.id);
  const from = order.indexOf(id), to = from + direction;
  if (to < 0 || to >= order.length) return;
  [order[from], order[to]] = [order[to], order[from]];
  // Se renumera todo el entregable: el orden queda siempre 1..n aunque antes hubiera huecos o empates.
  const rows = await q(
    `update deliverable_assets a set sort_order = o.n::int
       from unnest($1::uuid[]) with ordinality as o(id, n)
      where a.id = o.id returning a.id`,
    [order],
  );
  if (rows.length !== order.length) throw new AppError("No tienes permiso para realizar esta acción.", "forbidden");
}

export async function assetPaths(q: Q, deliverableId: string): Promise<string[]> {
  return (await q<{ storage_path: string }>("select storage_path from deliverable_assets where deliverable_id = $1", [deliverableId])).map((r) => r.storage_path);
}
