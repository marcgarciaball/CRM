import type { Q } from "../db/types";
import type { Priority, TaskStatus } from "../labels";
import { LIST_LIMIT, updateVersioned } from "./core";

export type Task = {
  id: string; client_id: string; client_name: string; title: string; description: string; status: TaskStatus; priority: Priority;
  assignee_id: string | null; assignee_name: string | null; created_by_name: string | null;
  due_date: string | null;
  campaign_id: string | null; deliverable_id: string | null; deliverable_title: string | null;
  /** Campaña efectiva: la propia o, si cuelga de un entregable, la de ese entregable. */
  effective_campaign_id: string | null; campaign_name: string | null;
  archived_at: Date | null; version: number; created_at: Date;
};

const SELECT = `
  select t.id, t.client_id, cl.name as client_name, t.title, t.description, t.status, t.priority, t.assignee_id, a.display_name as assignee_name,
         cr.display_name as created_by_name, t.due_date, t.campaign_id, t.deliverable_id, d.title as deliverable_title,
         coalesce(t.campaign_id, d.campaign_id) as effective_campaign_id, c.name as campaign_name,
         t.archived_at, t.version, t.created_at
    from tasks t
    join clients cl on cl.id = t.client_id
    left join deliverables d on d.id = t.deliverable_id
    left join campaigns c on c.id = coalesce(t.campaign_id, d.campaign_id)
    left join profiles a on a.id = t.assignee_id
    left join profiles cr on cr.id = t.created_by`;

export type TaskFilters = {
  client?: string; assignee?: string; status?: string; priority?: string; campaign?: string; deliverable?: string;
  from?: string; to?: string; unplanned?: boolean; open?: boolean; archived?: boolean;
};

/** Orden por urgencia: primero con fecha más próxima, luego prioridad. */
export function listTasks(q: Q, f: TaskFilters = {}): Promise<Task[]> {
  return q<Task>(
    `${SELECT}
      where (t.archived_at is not null) = $1
        and ($2::uuid is null or t.assignee_id = $2)
        and ($3::text is null or t.status = $3)
        and ($4::text is null or t.priority = $4)
        and ($5::uuid is null or coalesce(t.campaign_id, d.campaign_id) = $5)
        and ($6::uuid is null or t.deliverable_id = $6)
        and ($7::date is null or t.due_date >= $7)
        and ($8::date is null or t.due_date <= $8)
        and ($9::boolean is not true or t.due_date is null)
        and ($10::boolean is not true or t.status <> 'done')
        and ($11::uuid is null or t.client_id = $11)
      order by (t.status = 'done'), t.due_date asc nulls last,
               case t.priority when 'high' then 0 when 'medium' then 1 else 2 end, t.created_at desc
      limit ${LIST_LIMIT}`,
    [!!f.archived, f.assignee ?? null, f.status ?? null, f.priority ?? null, f.campaign ?? null, f.deliverable ?? null,
     f.from ?? null, f.to ?? null, f.unplanned ?? null, f.open ?? null, f.client ?? null],
  );
}

export async function getTask(q: Q, id: string): Promise<Task | null> {
  return (await q<Task>(`${SELECT} where t.id = $1`, [id]))[0] ?? null;
}

export type TaskInput = {
  client_id: string; title: string; description?: string; assignee_id: string | null; due_date: string | null;
  priority: Priority; campaign_id: string | null; deliverable_id: string | null;
};

/** Si la tarea cuelga de un entregable, la campaña se resuelve a través de él (nunca dos campañas). */
function normalizeParent<T extends Partial<TaskInput>>(input: T): T {
  return input.deliverable_id ? { ...input, campaign_id: null } : input;
}

export async function createTask(q: Q, raw: TaskInput): Promise<string> {
  const input = normalizeParent(raw);
  const rows = await q<{ id: string }>(
    `insert into tasks (client_id, title, description, assignee_id, due_date, priority, campaign_id, deliverable_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [input.client_id, input.title, input.description ?? "", input.assignee_id, input.due_date, input.priority, input.campaign_id, input.deliverable_id],
  );
  return rows[0].id;
}

export async function updateTask(q: Q, id: string, version: number | null, raw: Partial<Omit<TaskInput, "client_id">> & { status?: TaskStatus }) {
  const patch = normalizeParent(raw);
  const allowed: Record<string, unknown> = {};
  for (const k of ["title", "description", "assignee_id", "due_date", "priority", "campaign_id", "deliverable_id", "status"] as const) {
    if (k in patch) allowed[k] = patch[k];
  }
  await updateVersioned(q, "tasks", id, version, allowed);
}

export const setTaskStatus = (q: Q, id: string, status: TaskStatus) => updateVersioned(q, "tasks", id, null, { status });
