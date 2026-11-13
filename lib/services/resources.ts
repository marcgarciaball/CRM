import type { Q } from "../db/types";
import { AppError } from "../errors";
import { guessCategory, type Category } from "../labels";
import { LIST_LIMIT, updateVersioned } from "./core";

export type TargetType = "campaign" | "deliverable" | "task";
export type Target = { type: TargetType; id: string };

/** Un recurso tal y como se usa en un registro concreto (asociación + datos del recurso compartido). */
export type Material = {
  link_id: string; resource_id: string; title: string; url: string; category: Category; description: string;
  is_primary: boolean; requires_approval: boolean; content_updated_at: Date | null; resource_version: number;
  added_by_name: string | null; created_at: Date;
  campaign_id: string | null; deliverable_id: string | null; task_id: string | null;
};
export type Usage = { resource_id: string; type: TargetType; id: string; label: string };

const MATERIAL_SELECT = `
  select rl.id as link_id, r.id as resource_id, r.title, r.url, r.category, r.description,
         rl.is_primary, rl.requires_approval, r.content_updated_at, r.version as resource_version,
         p.display_name as added_by_name, rl.created_at, rl.campaign_id, rl.deliverable_id, rl.task_id
    from resource_links rl
    join resources r on r.id = rl.resource_id
    left join profiles p on p.id = rl.created_by`;

/** Enlaces de varios registros a la vez (para listas y calendario). Principales primero. */
export function bulkMaterials(q: Q, ids: { campaigns?: string[]; deliverables?: string[]; tasks?: string[] }): Promise<Material[]> {
  return q<Material>(
    `${MATERIAL_SELECT}
      where rl.campaign_id = any($1::uuid[]) or rl.deliverable_id = any($2::uuid[]) or rl.task_id = any($3::uuid[])
      order by rl.is_primary desc, rl.created_at asc
      limit 2000`,
    [ids.campaigns ?? [], ids.deliverables ?? [], ids.tasks ?? []],
  );
}

/** Registros en los que se usa cada recurso. */
export async function usagesFor(q: Q, resourceIds: string[]): Promise<Usage[]> {
  if (resourceIds.length === 0) return [];
  return q<Usage>(
    `select rl.resource_id,
            case when rl.campaign_id is not null then 'campaign' when rl.deliverable_id is not null then 'deliverable' else 'task' end as type,
            coalesce(rl.campaign_id, rl.deliverable_id, rl.task_id) as id,
            coalesce(c.name, d.title, t.title) as label
       from resource_links rl
       left join campaigns c on c.id = rl.campaign_id
       left join deliverables d on d.id = rl.deliverable_id
       left join tasks t on t.id = rl.task_id
      where rl.resource_id = any($1::uuid[])
      order by rl.created_at asc limit 2000`,
    [resourceIds],
  );
}

export type ContextualMaterials = {
  own: Material[];
  /** Solo tareas: enlaces del entregable del que cuelga. */
  fromDeliverable: Material[];
  fromCampaign: Material[];
  deliverable: { id: string; title: string } | null;
  campaign: { id: string; name: string } | null;
  usages: Usage[];
};

/**
 * Materiales de un registro en su contexto: primero los propios, después los del
 * entregable padre (tareas) y los de la campaña. No se copia nada y un mismo
 * recurso no aparece dos veces: gana el nivel más cercano.
 */
export async function getContextualMaterials(q: Q, target: Target): Promise<ContextualMaterials> {
  let deliverable: { id: string; title: string } | null = null;
  let campaign: { id: string; name: string } | null = null;
  if (target.type === "task") {
    const [row] = await q<{ d_id: string | null; d_title: string | null; c_id: string | null; c_name: string | null }>(
      `select d.id as d_id, d.title as d_title, c.id as c_id, c.name as c_name
         from tasks t left join deliverables d on d.id = t.deliverable_id
         left join campaigns c on c.id = coalesce(t.campaign_id, d.campaign_id) where t.id = $1`,
      [target.id],
    );
    if (row?.d_id) deliverable = { id: row.d_id, title: row.d_title! };
    if (row?.c_id) campaign = { id: row.c_id, name: row.c_name! };
  } else if (target.type === "deliverable") {
    const [row] = await q<{ c_id: string | null; c_name: string | null }>(
      `select c.id as c_id, c.name as c_name from deliverables d left join campaigns c on c.id = d.campaign_id where d.id = $1`,
      [target.id],
    );
    if (row?.c_id) campaign = { id: row.c_id, name: row.c_name! };
  }
  const all = await bulkMaterials(q, {
    campaigns: target.type === "campaign" ? [target.id] : campaign ? [campaign.id] : [],
    deliverables: target.type === "deliverable" ? [target.id] : deliverable ? [deliverable.id] : [],
    tasks: target.type === "task" ? [target.id] : [],
  });
  const own = all.filter((m) => m[`${target.type}_id`] === target.id);
  const seen = new Set(own.map((m) => m.resource_id));
  const pick = (list: Material[]) => list.filter((m) => !seen.has(m.resource_id) && (seen.add(m.resource_id), true));
  const fromDeliverable = target.type === "task" ? pick(all.filter((m) => m.deliverable_id)) : [];
  const fromCampaign = target.type !== "campaign" ? pick(all.filter((m) => m.campaign_id)) : [];
  const usages = await usagesFor(q, [...seen]);
  return { own, fromDeliverable, fromCampaign, deliverable, campaign, usages };
}

// ── Validación de URL (sin descargar nada) ─────────────────────────────────
export function parseHttpUrl(raw: string): string {
  const value = raw.trim();
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new AppError("La URL no es válida. Debe empezar por http:// o https://");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new AppError("Solo se admiten enlaces http:// o https://");
  if (u.username || u.password) throw new AppError("La URL no debe incluir usuario ni contraseña.");
  return u.toString();
}
const urlKey = (url: string) => url.toLowerCase().replace(/\/+$/, "");

export type Resource = {
  id: string; client_id: string; client_name: string; title: string; url: string; category: Category; description: string;
  created_by: string | null; created_by_name: string | null; created_at: Date; content_updated_at: Date | null; version: number;
};
const RESOURCE_SELECT = `
  select r.id, r.client_id, cl.name as client_name, r.title, r.url, r.category, r.description,
         r.created_by, p.display_name as created_by_name, r.created_at, r.content_updated_at, r.version
    from resources r
    join clients cl on cl.id = r.client_id
    left join profiles p on p.id = r.created_by`;

/** Recursos del mismo cliente con la misma URL. */
export function findDuplicates(q: Q, clientId: string, url: string, excludeId?: string): Promise<Resource[]> {
  return q<Resource>(
    `${RESOURCE_SELECT}
      where r.client_id = $3 and regexp_replace(lower(r.url), '/+$', '') = $1 and ($2::uuid is null or r.id <> $2) limit 5`,
    [urlKey(url), excludeId ?? null, clientId],
  );
}

export type ResourceInput = { client_id: string; title: string; url: string; category?: Category | null; description?: string };

export async function createResource(q: Q, input: ResourceInput): Promise<string> {
  const url = parseHttpUrl(input.url);
  const rows = await q<{ id: string }>(
    "insert into resources (client_id, title, url, category, description) values ($1, $2, $3, $4, $5) returning id",
    [input.client_id, input.title, url, input.category || guessCategory(url), input.description ?? ""],
  );
  return rows[0].id;
}

export async function getResource(q: Q, id: string): Promise<Resource | null> {
  return (await q<Resource>(`${RESOURCE_SELECT} where r.id = $1`, [id]))[0] ?? null;
}

/** Editar un recurso compartido afecta a todos los registros que lo usan. El cliente no cambia. */
export async function updateResource(q: Q, id: string, version: number | null, input: Omit<ResourceInput, "client_id">) {
  await updateVersioned(q, "resources", id, version, {
    title: input.title, url: parseHttpUrl(input.url), category: input.category || "other", description: input.description ?? "",
  });
}

/** "Marcar material actualizado": el contenido externo cambió aunque la URL sea la misma. */
export async function markResourceUpdated(q: Q, id: string) {
  const rows = await q("update resources set content_updated_at = clock_timestamp() where id = $1 returning id", [id]);
  if (rows.length === 0) throw new AppError("No se ha encontrado el recurso.", "not_found");
}

/** A qué afecta un cambio en el recurso: usos totales y entregables cuya aprobación se invalidaría. */
export async function resourceImpact(q: Q, id: string): Promise<{ uses: number; approvals: { id: string; title: string; status: string }[] }> {
  const [{ uses }] = await q<{ uses: number }>("select count(*)::int as uses from resource_links where resource_id = $1", [id]);
  const approvals = await q<{ id: string; title: string; status: string }>(
    `select d.id, d.title, d.status from resource_links rl join deliverables d on d.id = rl.deliverable_id
      where rl.resource_id = $1 and rl.requires_approval and d.status in ('approved', 'scheduled', 'published') limit 50`,
    [id],
  );
  return { uses, approvals };
}

export type LinkFlags = { is_primary?: boolean; requires_approval?: boolean };

/** Asocia un recurso existente a un registro. No duplica el recurso. */
export async function attachResource(q: Q, target: Target, resourceId: string, flags: LinkFlags = {}): Promise<string> {
  const rows = await q<{ id: string }>(
    `insert into resource_links (resource_id, ${target.type}_id, is_primary, requires_approval) values ($1, $2, $3, $4) returning id`,
    [resourceId, target.id, !!flags.is_primary, target.type === "deliverable" && !!flags.requires_approval],
  );
  return rows[0].id;
}

/**
 * Crea un recurso nuevo y lo asocia en un solo paso (solo título y URL son obligatorios).
 * El recurso pertenece al mismo cliente que el registro al que se asocia.
 */
export async function addNewLink(q: Q, target: Target, input: Omit<ResourceInput, "client_id">, flags: LinkFlags = {}) {
  const table = { campaign: "campaigns", deliverable: "deliverables", task: "tasks" }[target.type];
  const [row] = await q<{ client_id: string }>(`select client_id from ${table} where id = $1`, [target.id]);
  if (!row) throw new AppError("No se ha encontrado el registro.", "not_found");
  const resourceId = await createResource(q, { ...input, client_id: row.client_id });
  await attachResource(q, target, resourceId, flags);
  return resourceId;
}

/** Quita el enlace de ESTE registro. El recurso y sus demás usos no se tocan. */
export async function unlink(q: Q, linkId: string) {
  await q("delete from resource_links where id = $1", [linkId]);
}

export async function updateLinkFlags(q: Q, linkId: string, flags: LinkFlags) {
  await q(
    `update resource_links set is_primary = coalesce($2, is_primary), requires_approval = coalesce($3, requires_approval) where id = $1`,
    [linkId, flags.is_primary ?? null, flags.requires_approval ?? null],
  );
}

export type ResourceFilters = { client?: string; search?: string; category?: string; campaign?: string };

/** Biblioteca: los mismos recursos que se ven en cada registro. */
export function listResources(q: Q, f: ResourceFilters = {}): Promise<Resource[]> {
  return q<Resource>(
    `${RESOURCE_SELECT}
      where ($1::text is null or position(lower($1) in lower(r.title)) > 0 or position(lower($1) in lower(r.url)) > 0)
        and ($2::text is null or r.category = $2)
        and ($3::uuid is null or exists (
              select 1 from resource_links rl
                left join deliverables d on d.id = rl.deliverable_id
                left join tasks t on t.id = rl.task_id
                left join deliverables td on td.id = t.deliverable_id
               where rl.resource_id = r.id
                 and coalesce(rl.campaign_id, d.campaign_id, t.campaign_id, td.campaign_id) = $3))
        and ($4::uuid is null or r.client_id = $4)
      order by r.created_at desc limit ${LIST_LIMIT}`,
    [f.search?.trim() || null, f.category ?? null, f.campaign ?? null, f.client ?? null],
  );
}
