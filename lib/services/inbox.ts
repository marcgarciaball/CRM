import type { Q } from "../db/types";

export type Notice = {
  created_at: Date; type: "task" | "deliverable"; id: string; title: string;
  action: string; detail: Record<string, string | number | null>; actor: string | null; unread: boolean;
};

/**
 * Novedades para una persona (últimos 30 días, hechas por otras personas):
 * tareas que le asignan, comentarios y cambios en su trabajo y, si es administradora,
 * entregables que esperan su revisión. Se calculan a partir del historial: no hay copias.
 */
export function listNotices(q: Q, userId: string, isAdmin: boolean): Promise<Notice[]> {
  return q<Notice>(
    `select n.*, n.created_at > (select notifications_seen_at from profiles where id = $1) as unread from (
       select a.created_at, 'deliverable' as type, d.id, d.title, a.action, a.detail, p.display_name as actor
         from activity_log a
         join deliverables d on d.id = a.entity_id and a.entity_type = 'deliverable'
         left join profiles p on p.id = a.actor_id
        where a.actor_id is distinct from $1 and d.archived_at is null
          and a.action in ('status', 'material_changed', 'creative_changed', 'copy_changed')
          and (d.owner_id = $1 or d.created_by = $1 or ($2 and a.action = 'status' and a.detail ->> 'to' = 'in_review'))
       union all
       select a.created_at, 'task', t.id, t.title, a.action, a.detail, p.display_name
         from activity_log a
         join tasks t on t.id = a.entity_id and a.entity_type = 'task'
         left join profiles p on p.id = a.actor_id
        where a.actor_id is distinct from $1 and t.archived_at is null
          and ((a.action = 'assignee' and a.detail ->> 'to' = $1::text)
            or (a.action = 'created' and t.assignee_id = $1)
            or (a.action = 'status' and t.created_by = $1))
       union all
       select c.created_at, case when c.task_id is not null then 'task' else 'deliverable' end,
              coalesce(c.task_id, c.deliverable_id), coalesce(t.title, d.title), 'comment',
              jsonb_build_object('body', left(c.body, 140)), p.display_name
         from comments c
         left join tasks t on t.id = c.task_id
         left join deliverables d on d.id = c.deliverable_id
         left join profiles p on p.id = c.created_by
        where c.created_by is distinct from $1
          and (t.assignee_id = $1 or t.created_by = $1 or d.owner_id = $1 or d.created_by = $1)
     ) n
     where n.created_at > now() - interval '30 days'
     order by n.created_at desc limit 50`,
    [userId, isAdmin],
  );
}

export async function markNoticesSeen(q: Q, userId: string) {
  await q("update profiles set notifications_seen_at = clock_timestamp() where id = $1", [userId]);
}

export type SearchHit = { type: "task" | "deliverable" | "campaign" | "resource"; id: string; title: string; extra: string | null; url: string | null };

/** Búsqueda global por texto en tareas, entregables, campañas y enlaces. */
export function searchAll(q: Q, term: string): Promise<SearchHit[]> {
  return q<SearchHit>(
    `select * from (
       (select 'task' as type, id, title, null as extra, null as url, created_at from tasks
         where archived_at is null and position(lower($1) in lower(title || ' ' || description)) > 0 order by created_at desc limit 15)
       union all
       (select 'deliverable', id, title, null, null, created_at from deliverables
         where archived_at is null and position(lower($1) in lower(title || ' ' || brief || ' ' || copy)) > 0 order by created_at desc limit 15)
       union all
       (select 'campaign', id, name, null, null, created_at from campaigns
         where archived_at is null and position(lower($1) in lower(name || ' ' || objective)) > 0 order by created_at desc limit 15)
       union all
       (select 'resource', id, title, url, url, created_at from resources
         where position(lower($1) in lower(title || ' ' || url || ' ' || description)) > 0 order by created_at desc limit 15)
     ) s order by created_at desc`,
    [term],
  );
}
