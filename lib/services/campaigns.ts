import type { Q } from "../db/types";
import type { CampaignStatus } from "../labels";
import { LIST_LIMIT, updateVersioned } from "./core";
import { createDeliverable } from "./deliverables";
import { createTask } from "./tasks";

export type Campaign = {
  id: string; client_id: string; client_name: string; name: string; objective: string; description: string;
  start_date: string | null; end_date: string | null; status: CampaignStatus;
  owner_id: string | null; owner_name: string | null;
  archived_at: Date | null; archived_by_name: string | null; version: number;
  deliverables_total: number; deliverables_published: number; tasks_total: number; tasks_done: number;
};

const SELECT = `
  select c.id, c.client_id, cl.name as client_name, c.name, c.objective, c.description, c.start_date, c.end_date, c.status,
         c.owner_id, o.display_name as owner_name, c.archived_at, ab.display_name as archived_by_name, c.version,
         (select count(*)::int from deliverables d where d.campaign_id = c.id and d.archived_at is null and d.status <> 'discarded') as deliverables_total,
         (select count(*)::int from deliverables d where d.campaign_id = c.id and d.archived_at is null and d.status = 'published') as deliverables_published,
         (select count(*)::int from tasks t left join deliverables d on d.id = t.deliverable_id
           where coalesce(t.campaign_id, d.campaign_id) = c.id and t.archived_at is null) as tasks_total,
         (select count(*)::int from tasks t left join deliverables d on d.id = t.deliverable_id
           where coalesce(t.campaign_id, d.campaign_id) = c.id and t.archived_at is null and t.status = 'done') as tasks_done
    from campaigns c
    join clients cl on cl.id = c.client_id
    left join profiles o on o.id = c.owner_id
    left join profiles ab on ab.id = c.archived_by`;

/** Progreso calculado con registros reales: tareas hechas + entregables publicados sobre el total. */
export function campaignProgress(c: Pick<Campaign, "deliverables_total" | "deliverables_published" | "tasks_total" | "tasks_done">) {
  const total = c.deliverables_total + c.tasks_total;
  const done = c.deliverables_published + c.tasks_done;
  return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function listCampaigns(q: Q, f: { archived?: boolean; client?: string } = {}): Promise<Campaign[]> {
  return q<Campaign>(
    `${SELECT} where (c.archived_at is not null) = $1 and ($2::uuid is null or c.client_id = $2)
      order by c.start_date desc nulls last, c.created_at desc limit ${LIST_LIMIT}`,
    [!!f.archived, f.client ?? null],
  );
}

/** Opciones para selectores (campañas no archivadas del cliente). */
export function campaignOptions(q: Q, clientId: string): Promise<{ id: string; name: string }[]> {
  return q("select id, name from campaigns where client_id = $1 and archived_at is null order by created_at desc limit 200", [clientId]);
}

export async function getCampaign(q: Q, id: string): Promise<Campaign | null> {
  return (await q<Campaign>(`${SELECT} where c.id = $1`, [id]))[0] ?? null;
}

/**
 * Campañas de un mes: su rango de fechas se solapa con el mes, o contienen
 * entregables/tareas fechados dentro de él. La campaña sigue siendo un único registro.
 */
export function campaignsForRange(q: Q, clientId: string, first: string, last: string): Promise<Campaign[]> {
  return q<Campaign>(
    `${SELECT}
      where c.client_id = $3 and c.archived_at is null and (
        (coalesce(c.start_date, c.end_date) <= $2::date and coalesce(c.end_date, c.start_date) >= $1::date)
        or exists (select 1 from deliverables d where d.campaign_id = c.id and d.archived_at is null and d.planned_date between $1 and $2)
        or exists (select 1 from tasks t left join deliverables d on d.id = t.deliverable_id
                    where coalesce(t.campaign_id, d.campaign_id) = c.id and t.archived_at is null and t.due_date between $1 and $2))
      order by c.start_date asc nulls last, c.name limit 100`,
    [first, last, clientId],
  );
}

export type CampaignInput = {
  client_id: string; name: string; objective?: string; description?: string;
  start_date: string | null; end_date: string | null; owner_id: string | null; status?: CampaignStatus;
};

export async function createCampaign(q: Q, input: CampaignInput): Promise<string> {
  const rows = await q<{ id: string }>(
    `insert into campaigns (client_id, name, objective, description, start_date, end_date, owner_id, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [input.client_id, input.name, input.objective ?? "", input.description ?? "", input.start_date, input.end_date, input.owner_id, input.status ?? "planned"],
  );
  return rows[0].id;
}

/** El cliente de una campaña no se cambia al editarla. */
export async function updateCampaign(q: Q, id: string, version: number | null, patch: Partial<Omit<CampaignInput, "client_id">>) {
  const allowed: Record<string, unknown> = {};
  for (const k of ["name", "objective", "description", "start_date", "end_date", "owner_id", "status"] as const) {
    if (k in patch) allowed[k] = patch[k];
  }
  await updateVersioned(q, "campaigns", id, version, allowed);
}

/** Personas implicadas: responsable de campaña, de entregables y de tareas. */
export function campaignPeople(q: Q, id: string): Promise<{ id: string; display_name: string }[]> {
  return q(
    `select p.id, p.display_name from profiles p where p.id in (
       select owner_id from campaigns where id = $1
       union select owner_id from deliverables where campaign_id = $1 and archived_at is null
       union select t.assignee_id from tasks t left join deliverables d on d.id = t.deliverable_id
              where coalesce(t.campaign_id, d.campaign_id) = $1 and t.archived_at is null)
     order by p.display_name`,
    [id],
  );
}

// ── Plantilla: campaña de newsletter ───────────────────────────────────────
/** Tareas sugeridas. Las personas y las fechas las confirma quien crea la campaña: aquí no se inventan plazos. */
export const NEWSLETTER_TEMPLATE_TASKS = [
  { key: "copy", title: "Redactar el copy de la newsletter", suggestedAssignee: "Sara" },
  { key: "design", title: "Diseñar la newsletter en Figma", suggestedAssignee: "Ainhoa" },
  { key: "review", title: "Revisar y aprobar la newsletter", suggestedAssignee: "Maite" },
  { key: "launch", title: "Preparar y programar el envío", suggestedAssignee: "Elisa" },
] as const;

export type TemplateInput = {
  /** El entregable y las tareas se crean en el cliente de la campaña. */
  campaign: CampaignInput;
  deliverable: { title: string; planned_date: string | null; owner_id: string | null };
  tasks: { title: string; assignee_id: string | null; due_date: string | null }[];
};

export async function createNewsletterCampaign(q: Q, input: TemplateInput): Promise<string> {
  const campaignId = await createCampaign(q, input.campaign);
  const client_id = input.campaign.client_id;
  const deliverableId = await createDeliverable(q, {
    client_id, title: input.deliverable.title, channel: "newsletter", campaign_id: campaignId,
    owner_id: input.deliverable.owner_id, planned_date: input.deliverable.planned_date,
  });
  for (const t of input.tasks) {
    await createTask(q, {
      client_id, title: t.title, assignee_id: t.assignee_id, due_date: t.due_date, priority: "medium",
      campaign_id: null, deliverable_id: deliverableId,
    });
  }
  return campaignId;
}
