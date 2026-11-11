import type { Q } from "../db/types";
import { AppError, ConflictError } from "../errors";

export const LIST_LIMIT = 500;

export type Profile = { id: string; display_name: string; role: "admin" | "member"; active: boolean };

export async function getProfile(q: Q, id: string): Promise<Profile | null> {
  const rows = await q<Profile>("select id, display_name, role, active from profiles where id = $1", [id]);
  return rows[0] ?? null;
}
/** Personas de un cliente (vacío si quien consulta no es miembro). Por defecto, solo las activas. */
export function listProfiles(q: Q, clientId: string, onlyActive = true): Promise<Profile[]> {
  return q<Profile>(
    `select p.id, p.display_name, p.role, p.active
       from client_members m join profiles p on p.id = m.user_id
      where m.client_id = $1 and ($2::boolean is false or p.active)
      order by p.display_name limit 100`,
    [clientId, onlyActive],
  );
}

type Versioned = "campaigns" | "deliverables" | "tasks" | "resources";

/**
 * UPDATE con control de concurrencia optimista: si `version` no coincide con la
 * guardada, lanza ConflictError. `version = null` fuerza la sobrescritura.
 * Las claves de `patch` son siempre nombres de columna fijos del código, nunca entrada de usuario.
 */
export async function updateVersioned(q: Q, table: Versioned, id: string, version: number | null, patch: Record<string, unknown>) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
  const rows = await q(
    `update ${table} set ${sets} where id = $1 and ($2::int is null or version = $2) returning id`,
    [id, version, ...keys.map((k) => patch[k])],
  );
  if (rows.length === 0) {
    const exists = await q(`select 1 from ${table} where id = $1`, [id]);
    if (exists.length === 0) throw new AppError("No se ha encontrado el registro.", "not_found");
    throw new ConflictError();
  }
}

export async function setArchived(q: Q, table: "campaigns" | "deliverables" | "tasks", id: string, archived: boolean) {
  await q(`update ${table} set archived_at = case when $2 then now() else null end where id = $1`, [id, archived]);
}

/** Eliminación definitiva: RLS solo la permite a administración. */
export async function deletePermanently(q: Q, table: Versioned, id: string) {
  const rows = await q(`delete from ${table} where id = $1 returning id`, [id]);
  if (rows.length === 0) throw new AppError("Solo administración puede eliminar definitivamente.", "forbidden");
}

// ── Comentarios e historial ────────────────────────────────────────────────
export type Comment = { id: string; body: string; created_at: Date; created_by: string | null; author_name: string | null };
export type Activity = { id: string; action: string; detail: Record<string, string | number | null>; created_at: Date; actor_name: string | null };
export type EntityType = "deliverable" | "task";

export function listComments(q: Q, type: EntityType, id: string): Promise<Comment[]> {
  return q<Comment>(
    `select c.id, c.body, c.created_at, c.created_by, p.display_name as author_name
       from comments c left join profiles p on p.id = c.created_by
      where c.${type}_id = $1 order by c.created_at asc limit 300`,
    [id],
  );
}
export async function addComment(q: Q, type: EntityType, id: string, body: string) {
  await q(`insert into comments (${type}_id, body) values ($1, $2)`, [id, body]);
}
export async function deleteComment(q: Q, id: string) {
  const rows = await q("delete from comments where id = $1 returning id", [id]);
  if (rows.length === 0) throw new AppError("Solo puedes borrar tus propios comentarios.", "forbidden");
}
export function listActivity(q: Q, type: EntityType, id: string): Promise<Activity[]> {
  return q<Activity>(
    `select a.id::text, a.action, a.detail, a.created_at, p.display_name as actor_name
       from activity_log a left join profiles p on p.id = a.actor_id
      where a.entity_type = $1 and a.entity_id = $2 order by a.created_at desc, a.id desc limit 100`,
    [type, id],
  );
}
