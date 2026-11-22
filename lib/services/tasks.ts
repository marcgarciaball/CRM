import type { Q } from "../db/types";
import type { Priority, TaskStatus } from "../labels";
import { AppError } from "../errors";
import { LIST_LIMIT, updateVersioned } from "./core";

export type Task = {
  id: string; client_id: string; client_name: string; title: string; description: string; status: TaskStatus; priority: Priority;
  assignee_id: string | null; assignee_name: string | null; created_by_name: string | null;
  due_date: string | null;
  campaign_id: string | null; deliverable_id: string | null; deliverable_title: string | null;
  /** Campaña efectiva: la propia o, si cuelga de un entregable, la de ese entregable. */
  effective_campaign_id: string | null; campaign_name: string | null;
  archived_at: Date | null; version: number; created_at: Date;
  /** Orden manual dentro del cliente (menor = más arriba). */
  position: number;
};

const SELECT = `
  select t.id, t.client_id, cl.name as client_name, t.title, t.description, t.status, t.priority, t.assignee_id, a.display_name as assignee_name,
         cr.display_name as created_by_name, t.due_date, t.campaign_id, t.deliverable_id, d.title as deliverable_title,
         coalesce(t.campaign_id, d.campaign_id) as effective_campaign_id, c.name as campaign_name,
         t.archived_at, t.version, t.created_at, t.position
    from tasks t
    join clients cl on cl.id = t.client_id
    left join deliverables d on d.id = t.deliverable_id
    left join campaigns c on c.id = coalesce(t.campaign_id, d.campaign_id)
    left join profiles a on a.id = t.assignee_id
    left join profiles cr on cr.id = t.created_by`;

export type TaskFilters = {
  client?: string; assignee?: string; status?: string; priority?: string; campaign?: string; deliverable?: string;
  from?: string; to?: string; unplanned?: boolean; open?: boolean; archived?: boolean;
  /** Solo de clientes no archivados (inicio con todos los clientes). */
  activeClients?: boolean;
  /** Orden manual del cliente (lista de «Trabajo»); a igual posición, por urgencia. */
  manual?: boolean;
};

const URGENCY = `t.due_date asc nulls last, case t.priority when 'high' then 0 when 'medium' then 1 else 2 end, t.created_at desc`;
/** Orden de la lista de «Trabajo»: las hechas al final y, dentro de cada grupo, la posición manual. */
const MANUAL = `(t.status = 'done'), t.position, ${URGENCY}`;

/** Por defecto, orden por urgencia: primero con fecha más próxima, luego prioridad. */
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
        and ($12::boolean is not true or cl.archived_at is null)
      order by ${f.manual ? MANUAL : `(t.status = 'done'), ${URGENCY}`}
      limit ${LIST_LIMIT}`,
    [!!f.archived, f.assignee ?? null, f.status ?? null, f.priority ?? null, f.campaign ?? null, f.deliverable ?? null,
     f.from ?? null, f.to ?? null, f.unplanned ?? null, f.open ?? null, f.client ?? null, f.activeClients ?? null],
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
    // Las nuevas, arriba del todo de la lista del cliente.
    `insert into tasks (client_id, title, description, assignee_id, due_date, priority, campaign_id, deliverable_id, position)
     values ($1, $2, $3, $4, $5, $6, $7, $8, (select coalesce(min(position), 0) - 1024 from tasks where client_id = $1)) returning id`,
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

const STEP = 1024;

/**
 * Coloca una tarea entre `prev` (la que queda encima) y `next` (la que queda debajo) de la lista visible.
 * Basta con los vecinos: con filtros activos, las tareas ocultas conservan su sitio. Si no hay hueco entre
 * ambos (posiciones iguales o demasiado juntas), renumera antes las del cliente en su orden actual.
 */
export async function moveTask(q: Q, id: string, prev: string | null, next: string | null) {
  const task = (await q<{ client_id: string }>(`select client_id from tasks where id = $1`, [id]))[0];
  if (!task) throw new AppError("No se ha encontrado la tarea.", "not_found");
  const positions = async () => {
    const rows = await q<{ id: string; position: number }>(
      `select id, position from tasks where client_id = $1 and id = any($2::uuid[])`, [task.client_id, [prev, next].filter(Boolean)]);
    const at = (x: string | null) => (x ? rows.find((r) => r.id === x)?.position ?? null : null);
    return { p: at(prev), n: at(next) };
  };
  let { p, n } = await positions();
  if (p !== null && n !== null && !(n - p > 1e-6)) {
    await q(
      `update tasks set position = r.rn * ${STEP}
         from (select t.id, row_number() over (order by ${MANUAL}) as rn from tasks t where t.client_id = $1) r
        where tasks.id = r.id`,
      [task.client_id]);
    ({ p, n } = await positions());
  }
  const position = p !== null && n !== null ? (p + n) / 2 : p !== null ? p + STEP : n !== null ? n - STEP : null;
  if (position === null) return;
  await updateVersioned(q, "tasks", id, null, { position });
}
