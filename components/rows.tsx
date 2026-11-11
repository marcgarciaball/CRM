import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { TASK_STATUS_LABEL } from "@/lib/labels";
import type { Deliverable } from "@/lib/services/deliverables";
import type { Material } from "@/lib/services/resources";
import type { Task } from "@/lib/services/tasks";
import { MaterialChip } from "./materials";
import { peopleOptions } from "@/lib/people";
import { QuickDate, QuickSelect } from "./quick";
import { ChannelBadge, DeliverableStatusBadge, PriorityBadge, options } from "./ui";

const TASK_STATUS_OPTIONS = options(TASK_STATUS_LABEL);

/** Materiales agrupados por registro, para listas y calendario. */
export function groupMaterials(materials: Material[]) {
  const by = { campaign: new Map<string, Material[]>(), deliverable: new Map<string, Material[]>(), task: new Map<string, Material[]>() };
  for (const m of materials) {
    const [map, key] = m.campaign_id ? [by.campaign, m.campaign_id] : m.deliverable_id ? [by.deliverable, m.deliverable_id] : [by.task, m.task_id!];
    map.set(key, [...(map.get(key) ?? []), m]);
  }
  return by;
}
export type GroupedMaterials = ReturnType<typeof groupMaterials>;

/** Enlaces principales a la vista y el resto desplegable, sin salir de la lista. */
export function InlineMaterials({ own, inherited = [], inheritedLabel }: { own: Material[]; inherited?: Material[]; inheritedLabel?: string }) {
  const seen = new Set(own.map((m) => m.resource_id));
  const extra = inherited.filter((m) => !seen.has(m.resource_id));
  const primary = own.filter((m) => m.is_primary);
  const total = own.length + extra.length;
  if (total === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {primary.length > 0 && <div className="flex flex-wrap gap-1.5">{primary.map((m) => <MaterialChip key={m.link_id} m={m} />)}</div>}
      {total > primary.length && (
        <details>
          <summary className="more">Todos los materiales ({total})</summary>
          <div className="mt-1.5 flex flex-wrap gap-1.5">{own.map((m) => <MaterialChip key={m.link_id} m={m} />)}</div>
          {extra.length > 0 && (
            <>
              <p className="eyebrow mt-2 mb-1">{inheritedLabel ?? "De la campaña"}</p>
              <div className="flex flex-wrap gap-1.5">{extra.map((m) => <MaterialChip key={m.link_id} m={{ ...m, is_primary: false }} />)}</div>
            </>
          )}
        </details>
      )}
    </div>
  );
}

export function DueDate({ date, today, done }: { date: string | null; today: string; done?: boolean }) {
  const overdue = !!date && !done && date < today;
  return (
    <span className={`text-[13px] whitespace-nowrap ${overdue ? "font-medium text-st-danger-fg" : "text-muted"}`}>
      {formatDate(date, today)}{overdue && " · vencida"}
    </span>
  );
}

/** Fila de tarea: estado, persona y fecha se cambian aquí mismo, sin abrir la tarea. */
export async function TaskItem({ task, today, materials, showAssignee = true }: { task: Task; today: string; materials?: GroupedMaterials; showAssignee?: boolean }) {
  const people = await peopleOptions();
  const done = task.status === "done";
  const context = [task.deliverable_title, task.campaign_name].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line py-2.5 last:border-b-0">
      <QuickSelect kind="task" id={task.id} field="status" value={task.status} options={TASK_STATUS_OPTIONS} label={`Estado de «${task.title}»`} />
      <div className="min-w-48 flex-1">
        <Link href={`/trabajo/tareas/${task.id}`} className={`font-medium hover:underline ${done ? "text-muted line-through" : ""}`}>{task.title}</Link>
        {task.priority === "high" && <span className="ml-2"><PriorityBadge priority={task.priority} /></span>}
        {context && <p className="truncate text-[13px] text-muted">{context}</p>}
        {materials && (
          <div className="mt-1">
            <InlineMaterials own={materials.task.get(task.id) ?? []}
              inherited={[...(task.deliverable_id ? materials.deliverable.get(task.deliverable_id) ?? [] : []), ...(task.effective_campaign_id ? materials.campaign.get(task.effective_campaign_id) ?? [] : [])]}
              inheritedLabel="Del entregable y la campaña" />
          </div>
        )}
      </div>
      {showAssignee && <QuickSelect kind="task" id={task.id} field="assignee_id" value={task.assignee_id} options={people} empty="Sin asignar" label={`Persona asignada a «${task.title}»`} />}
      <QuickDate kind="task" id={task.id} field="due_date" value={task.due_date} label={`Fecha límite de «${task.title}»`} danger={!!task.due_date && !done && task.due_date < today} />
    </li>
  );
}

/** Fila de entregable: fecha prevista y responsable editables; el estado cambia desde su ficha. */
export async function DeliverableItem({ d, today, materials }: { d: Deliverable; today: string; materials?: GroupedMaterials; showDate?: boolean }) {
  const people = await peopleOptions();
  const late = !!d.planned_date && d.planned_date < today && d.status !== "published" && d.status !== "discarded";
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line py-2.5 last:border-b-0">
      <DeliverableStatusBadge status={d.status} />
      <div className="min-w-48 flex-1">
        <Link href={`/trabajo/entregables/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
          <ChannelBadge channel={d.channel} />
          {d.campaign_name && <Link href={`/campanas/${d.campaign_id}`} className="truncate hover:underline">{d.campaign_name}</Link>}
          {d.published_on && <span>Publicado el {formatDate(d.published_on, today)}</span>}
          {late && <span className="font-medium text-st-danger-fg">Atrasado</span>}
        </p>
        {materials && (
          <div className="mt-1">
            <InlineMaterials own={materials.deliverable.get(d.id) ?? []} inherited={d.campaign_id ? materials.campaign.get(d.campaign_id) ?? [] : []} />
          </div>
        )}
      </div>
      <QuickSelect kind="deliverable" id={d.id} field="owner_id" value={d.owner_id} options={people} empty="Sin responsable" label={`Responsable de «${d.title}»`} />
      <QuickDate kind="deliverable" id={d.id} field="planned_date" value={d.planned_date} label={`Fecha prevista de «${d.title}»`} danger={late} />
    </li>
  );
}
