import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { DeliverableItem, DueDate, TaskItem } from "@/components/rows";
import { Empty, PageHeader, PriorityBadge, Tabs, options } from "@/components/ui";
import { Draggable, DropZone, QuickSelect } from "@/components/quick";
import { todayMadrid } from "@/lib/dates";
import { CHANNELS, CHANNEL_LABEL, DELIVERABLE_STATUSES, DELIVERABLE_STATUS_LABEL, PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL } from "@/lib/labels";
import { formOptions, load } from "@/lib/load";
import { enumParam, one, uuidParam, type SearchParams } from "@/lib/params";
import { listDeliverables } from "@/lib/services/deliverables";
import { listTasks } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Trabajo" };

export default async function WorkPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tab = one(sp.tab) === "entregables" ? "entregables" : "tareas";
  const view = one(sp.vista) === "kanban" ? "kanban" : "lista";
  const archived = one(sp.archivo) === "1";
  const person = uuidParam(sp.persona), campaign = uuidParam(sp.campana);
  const today = todayMadrid();

  const { opts, tasks, deliverables, user } = await load(async (q) => ({
    opts: await formOptions(q),
    tasks: tab === "tareas"
      ? await listTasks(q, { assignee: person, campaign, archived, status: enumParam(sp.estado, TASK_STATUSES), priority: enumParam(sp.prioridad, PRIORITIES) })
      : [],
    deliverables: tab === "entregables"
      ? await listDeliverables(q, { owner: person, campaign, archived, status: enumParam(sp.estado, DELIVERABLE_STATUSES), channel: enumParam(sp.canal, CHANNELS) })
      : [],
  }));

  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab, vista: view, persona: person, campana: campaign, ...patch })) if (v && !(k === "vista" && v === "lista") && !(k === "tab" && v === "tareas")) next.set(k, v);
    const s = next.toString();
    return s ? `/trabajo?${s}` : "/trabajo";
  };
  const people = opts.people.map((p) => ({ id: p.id, label: p.display_name }));
  const campaigns = opts.campaigns.map((c) => ({ id: c.id, label: c.name }));
  const mine = person === user.id;

  return (
    <>
      <PageHeader title="Trabajo" />
      <Tabs current={tab} tabs={[{ key: "tareas", label: "Tareas", href: "/trabajo" }, { key: "entregables", label: "Entregables", href: "/trabajo?tab=entregables" }]} />

      {tab === "tareas" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Link href={qs({ persona: mine ? undefined : user.id })} aria-pressed={mine} className={`btn btn-sm ${mine ? "btn-primary" : "btn-secondary"}`}>Mis tareas</Link>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <Link href={qs({ vista: "lista" })} aria-current={view === "lista" ? "true" : undefined} className={`btn btn-sm ${view === "lista" ? "btn-primary" : "btn-secondary"}`}>Lista</Link>
            <Link href={qs({ vista: "kanban" })} aria-current={view === "kanban" ? "true" : undefined} className={`btn btn-sm ${view === "kanban" ? "btn-primary" : "btn-secondary"}`}>Kanban</Link>
          </div>
          <FilterBar filters={[
            { name: "persona", label: "Asignada a", options: people },
            { name: "estado", label: "Estado", options: options(TASK_STATUS_LABEL) },
            { name: "prioridad", label: "Prioridad", options: options(PRIORITY_LABEL, PRIORITIES) },
            { name: "campana", label: "Campaña", options: campaigns },
          ]} />
          {tasks.length === 0 ? (
            <div className="card p-4"><Empty>No hay tareas con estos filtros.</Empty></div>
          ) : view === "lista" ? (
            <div className="card px-4 py-1"><ul>{tasks.map((t) => <TaskItem key={t.id} task={t} today={today} />)}</ul></div>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted">Arrastra una tarjeta a otra columna para cambiar su estado (o usa el selector de la tarjeta).</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {TASK_STATUSES.map((status) => {
                  const column = tasks.filter((t) => t.status === status);
                  return (
                    <DropZone key={status} set={{ task: { field: "status", value: status } }} className="rounded-xl bg-st-neutral-bg/60 p-2">
                      <section aria-label={TASK_STATUS_LABEL[status]}>
                        <h2 className="px-2 py-1.5 text-sm font-semibold">{TASK_STATUS_LABEL[status]} <span className="font-normal text-muted">{column.length}</span></h2>
                        <ul className="min-h-16 space-y-2">
                          {column.map((t) => (
                            <li key={t.id}>
                              <Draggable kind="task" id={t.id} className="card p-3 shadow-sm">
                                <Link href={`/trabajo/tareas/${t.id}`} className="text-sm font-medium hover:underline">{t.title}</Link>
                                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                                  <DueDate date={t.due_date} today={today} done={t.status === "done"} />
                                  <span>{t.assignee_name ?? "Sin asignar"}</span>
                                  <PriorityBadge priority={t.priority} />
                                </p>
                                <div className="mt-1 -ml-1.5">
                                  <QuickSelect kind="task" id={t.id} field="status" value={t.status} options={options(TASK_STATUS_LABEL)} label={`Mover «${t.title}» a otro estado`} />
                                </div>
                              </Draggable>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </DropZone>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <FilterBar filters={[
            { name: "persona", label: "Responsable", options: people },
            { name: "canal", label: "Canal", options: options(CHANNEL_LABEL, CHANNELS) },
            { name: "estado", label: "Estado", options: options(DELIVERABLE_STATUS_LABEL, DELIVERABLE_STATUSES) },
            { name: "campana", label: "Campaña", options: campaigns },
          ]} />
          <div className="card px-4 py-1">
            {deliverables.length === 0 ? <div className="py-4"><Empty>No hay entregables con estos filtros.</Empty></div> : (
              <ul>{deliverables.map((d) => <DeliverableItem key={d.id} d={d} today={today} />)}</ul>
            )}
          </div>
        </>
      )}
      <p className="mt-4 text-sm">
        <Link href={archived ? qs({}) : qs({ archivo: "1" })} className="link">{archived ? "Volver al trabajo activo" : "Ver archivados"}</Link>
      </p>
    </>
  );
}
