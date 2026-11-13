import type { Q } from "../db/types";

export type Notice = {
  created_at: Date; type: "task" | "deliverable"; id: string; title: string;
  action: string; detail: Record<string, string | number | null>; actor_id: string | null; actor: string | null; unread: boolean;
  client_id: string; client_name: string;
};

/**
 * Novedades para una persona en todos los clientes a los que pertenece (últimos 30 días, hechas por otras
 * personas): tareas que le asignan, comentarios y cambios en su trabajo y, si es propietaria del cliente del
 * entregable, los entregables que esperan su revisión. Se calculan a partir del historial: no hay copias.
 *
 * «Sin leer» es `created_at >= notifications_seen_at`, con `>=` a propósito: `created_at` lo pone la base de
 * datos al empezar la transacción de quien actúa y `notifications_seen_at` al terminar la de quien mira, y los
 * relojes tienen resolución limitada (milisegundos en PGlite). Una novedad posterior al «visto» puede llevar
 * exactamente la misma marca; con `>` se perdía (los avisos desaparecían sin leerse). Con `>=` el peor caso
 * es mostrar como nueva una novedad anterior de ese mismo instante, nunca ocultar una nueva.
 */
export function listNotices(q: Q, userId: string): Promise<Notice[]> {
  return q<Notice>(
    `select n.*, n.created_at >= (select notifications_seen_at from profiles where id = $1) as unread from (
       select a.created_at, 'deliverable' as type, d.id, d.title, a.action, a.detail, a.actor_id, p.display_name as actor,
              d.client_id, cl.name as client_name
         from activity_log a
         join deliverables d on d.id = a.entity_id and a.entity_type = 'deliverable'
         join clients cl on cl.id = d.client_id
         left join profiles p on p.id = a.actor_id
        where a.actor_id is distinct from $1 and d.archived_at is null
          and a.action in ('status', 'material_changed', 'creative_changed', 'copy_changed')
          and (d.owner_id = $1 or d.created_by = $1
               or (a.action = 'status' and a.detail ->> 'to' = 'in_review'
                   and exists (select 1 from client_members m
                                where m.client_id = d.client_id and m.user_id = $1 and m.role = 'owner')))
       union all
       select a.created_at, 'task', t.id, t.title, a.action, a.detail, a.actor_id, p.display_name, t.client_id, cl.name
         from activity_log a
         join tasks t on t.id = a.entity_id and a.entity_type = 'task'
         join clients cl on cl.id = t.client_id
         left join profiles p on p.id = a.actor_id
        where a.actor_id is distinct from $1 and t.archived_at is null
          and ((a.action = 'assignee' and a.detail ->> 'to' = $1::text)
            or (a.action = 'created' and t.assignee_id = $1)
            or (a.action = 'status' and t.created_by = $1))
       union all
       select c.created_at, case when c.task_id is not null then 'task' else 'deliverable' end,
              coalesce(c.task_id, c.deliverable_id), coalesce(t.title, d.title), 'comment',
              jsonb_build_object('body', left(c.body, 140)), c.created_by, p.display_name,
              coalesce(t.client_id, d.client_id), cl.name
         from comments c
         left join tasks t on t.id = c.task_id
         left join deliverables d on d.id = c.deliverable_id
         join clients cl on cl.id = coalesce(t.client_id, d.client_id)
         left join profiles p on p.id = c.created_by
        where c.created_by is distinct from $1
          and (t.assignee_id = $1 or t.created_by = $1 or d.owner_id = $1 or d.created_by = $1)
     ) n
     where n.created_at > now() - interval '30 days'
     order by n.created_at desc limit 50`,
    [userId],
  );
}

export async function markNoticesSeen(q: Q, userId: string) {
  await q("update profiles set notifications_seen_at = clock_timestamp() where id = $1", [userId]);
}

export type SearchHit = {
  type: "task" | "deliverable" | "campaign" | "resource"; id: string; title: string; extra: string | null; url: string | null;
  client_id: string; client_name: string;
};

/** Búsqueda global por texto en tareas, entregables, campañas y enlaces de todos los clientes activos de la persona. */
export function searchAll(q: Q, term: string): Promise<SearchHit[]> {
  return q<SearchHit>(
    `select * from (
       (select 'task' as type, x.id, x.title, null as extra, null as url, x.created_at, x.client_id, cl.name as client_name
          from tasks x join clients cl on cl.id = x.client_id
         where x.archived_at is null and cl.archived_at is null
           and position(lower($1) in lower(x.title || ' ' || x.description)) > 0 order by x.created_at desc limit 15)
       union all
       (select 'deliverable', x.id, x.title, null, null, x.created_at, x.client_id, cl.name
          from deliverables x join clients cl on cl.id = x.client_id
         where x.archived_at is null and cl.archived_at is null
           and position(lower($1) in lower(x.title || ' ' || x.brief || ' ' || x.copy)) > 0 order by x.created_at desc limit 15)
       union all
       (select 'campaign', x.id, x.name, null, null, x.created_at, x.client_id, cl.name
          from campaigns x join clients cl on cl.id = x.client_id
         where x.archived_at is null and cl.archived_at is null
           and position(lower($1) in lower(x.name || ' ' || x.objective)) > 0 order by x.created_at desc limit 15)
       union all
       (select 'resource', x.id, x.title, x.url, x.url, x.created_at, x.client_id, cl.name
          from resources x join clients cl on cl.id = x.client_id
         where cl.archived_at is null
           and position(lower($1) in lower(x.title || ' ' || x.url || ' ' || x.description)) > 0 order by x.created_at desc limit 15)
     ) s order by created_at desc`,
    [term],
  );
}
