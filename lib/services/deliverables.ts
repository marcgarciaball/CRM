import type { Q } from "../db/types";
import { AppError } from "../errors";
import type { Channel, CreativeFormat, DeliverableStatus } from "../labels";
import { LIST_LIMIT, updateVersioned } from "./core";

export type Deliverable = {
  id: string; client_id: string; client_name: string; title: string; channel: Channel; status: DeliverableStatus;
  campaign_id: string | null; campaign_name: string | null;
  owner_id: string | null; owner_name: string | null;
  brief: string; copy: string;
  /** Diapositiva: formatos necesarios, tipo de creatividad, inspiración y copy in (texto dentro de la pieza). */
  formats: string; creative_format: CreativeFormat | null; inspo: string; copy_in: string;
  planned_date: string | null; published_on: string | null;
  revision: number; approved_revision: number | null; approved_by: string | null; approved_by_name: string | null; approved_at: Date | null;
  archived_at: Date | null; version: number; updated_at: Date;
};

const SELECT = `
  select d.id, d.client_id, cl.name as client_name, d.title, d.channel, d.status, d.campaign_id, c.name as campaign_name,
         d.owner_id, o.display_name as owner_name, d.brief, d.copy, d.formats, d.creative_format, d.inspo, d.copy_in, d.planned_date, d.published_on,
         d.revision, d.approved_revision, d.approved_by, ap.display_name as approved_by_name, d.approved_at,
         d.archived_at, d.version, d.updated_at
    from deliverables d
    join clients cl on cl.id = d.client_id
    left join campaigns c on c.id = d.campaign_id
    left join profiles o on o.id = d.owner_id
    left join profiles ap on ap.id = d.approved_by`;

export type DeliverableFilters = {
  client?: string; owner?: string; channel?: string; campaign?: string; status?: string;
  from?: string; to?: string; unplanned?: boolean; archived?: boolean;
  /** Solo de clientes no archivados; solo de clientes en los que quien consulta es propietaria (inicio). */
  activeClients?: boolean; ownedClients?: boolean;
};

export function listDeliverables(q: Q, f: DeliverableFilters = {}): Promise<Deliverable[]> {
  return q<Deliverable>(
    `${SELECT}
      where (d.archived_at is not null) = $1
        and ($2::uuid is null or d.owner_id = $2)
        and ($3::text is null or d.channel = $3)
        and ($4::uuid is null or d.campaign_id = $4)
        and ($5::text is null or d.status = $5)
        and ($6::date is null or d.planned_date >= $6)
        and ($7::date is null or d.planned_date <= $7)
        and ($8::boolean is not true or d.planned_date is null)
        and ($9::uuid is null or d.client_id = $9)
        and ($10::boolean is not true or cl.archived_at is null)
        and ($11::boolean is not true or public.is_client_owner(d.client_id))
      order by d.planned_date asc nulls last, d.created_at desc
      limit ${LIST_LIMIT}`,
    [!!f.archived, f.owner ?? null, f.channel ?? null, f.campaign ?? null, f.status ?? null, f.from ?? null, f.to ?? null, f.unplanned ?? null, f.client ?? null, f.activeClients ?? null, f.ownedClients ?? null],
  );
}

export async function getDeliverable(q: Q, id: string): Promise<Deliverable | null> {
  return (await q<Deliverable>(`${SELECT} where d.id = $1`, [id]))[0] ?? null;
}

export type DeliverableInput = {
  client_id: string; title: string; channel: Channel; campaign_id: string | null; owner_id: string | null;
  planned_date: string | null; brief?: string; copy?: string;
  formats?: string; creative_format?: CreativeFormat | null; inspo?: string; copy_in?: string;
};

export async function createDeliverable(q: Q, input: DeliverableInput): Promise<string> {
  const rows = await q<{ id: string }>(
    `insert into deliverables (client_id, title, channel, campaign_id, owner_id, planned_date, brief, copy, formats, creative_format, inspo, copy_in)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
    [input.client_id, input.title, input.channel, input.campaign_id, input.owner_id, input.planned_date, input.brief ?? "", input.copy ?? "",
      input.formats ?? "", input.creative_format ?? null, input.inspo ?? "", input.copy_in ?? ""],
  );
  return rows[0].id;
}

/** Edita campos (no el estado). Cambiar el copy (out o in) crea una revisión nueva y, si estaba aprobado, lo devuelve a revisión. */
export async function updateDeliverable(q: Q, id: string, version: number | null, patch: Partial<Omit<DeliverableInput, "client_id">>) {
  const allowed: Record<string, unknown> = {};
  for (const k of ["title", "channel", "campaign_id", "owner_id", "planned_date", "brief", "copy", "formats", "creative_format", "inspo", "copy_in"] as const) {
    if (k in patch) allowed[k] = patch[k];
  }
  await updateVersioned(q, "deliverables", id, version, allowed);
}

/** Cambia el estado. Las reglas (quién, cuándo, con qué fechas) las aplica la base de datos. */
export async function transitionDeliverable(
  q: Q, id: string, to: DeliverableStatus, opts: { planned_date?: string | null; published_on?: string | null } = {},
) {
  const rows = await q(
    `update deliverables
        set status = $2,
            planned_date = coalesce($3::date, planned_date),
            published_on = case when $2 = 'published' then $4::date else published_on end
      where id = $1 returning id`,
    [id, to, opts.planned_date ?? null, opts.published_on ?? null],
  );
  if (rows.length === 0) throw new AppError("No se ha encontrado el entregable.", "not_found");
}

export type Publication = { id: string; revision: number; published_on: string; recorded_at: Date; recorded_by: string | null; recorded_by_name: string | null };
export function listPublications(q: Q, deliverableId: string): Promise<Publication[]> {
  return q<Publication>(
    `select pb.id, pb.revision, pb.published_on, pb.recorded_at, pb.recorded_by, p.display_name as recorded_by_name
       from publications pb left join profiles p on p.id = pb.recorded_by
      where pb.deliverable_id = $1 order by pb.recorded_at desc limit 50`,
    [deliverableId],
  );
}

/** Opciones para selectores (entregables no archivados del cliente, los más recientes primero). */
export function deliverableOptions(q: Q, clientId: string): Promise<{ id: string; title: string }[]> {
  return q("select id, title from deliverables where client_id = $1 and archived_at is null order by created_at desc limit 200", [clientId]);
}
