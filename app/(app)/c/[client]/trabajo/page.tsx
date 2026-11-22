import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { DeliverableItem, DueDate, TaskItem } from "@/components/rows";
import { Avatar, Empty, colorOf, PageHeader, PriorityBadge, Tabs, options } from "@/components/ui";
import { Draggable, DropZone, TaskStatusSelect } from "@/components/quick";
import { SortableTasks } from "@/components/sortable-tasks";
import { todayMadrid } from "@/lib/dates";
import { CHANNELS, CHANNEL_LABEL, DELIVERABLE_STATUSES, DELIVERABLE_STATUS_LABEL, PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, personName } from "@/lib/labels";
import { formOptions, loadClient } from "@/lib/load";
import { clientPath, taskPath } from "@/lib/paths";
import { enumParam, one, uuidParam, type SearchParams } from "@/lib/params";
import { listDeliverables } from "@/lib/services/deliverables";
import { listTasks } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Trabajo" };

export default async function WorkPage({ params, searchParams }: { params: Promise<{ client: string }>; searchParams: SearchParams }) {
  const sp = await searchParams;
  const tab = one(sp.tab) === "entregables" ? "entregables" : "tareas";
  const view = one(sp.vista) === "kanban" ? "kanban" : "lista";
  const archived = one(sp.archivo) === "1";
  const person = uuidParam(sp.persona), campaign = uuidParam(sp.campana);
  const today = todayMadrid();

  const { opts, tasks, deliverables, user, client } = await loadClient((await params).client, async (q, _user, client) => ({
    opts: await formOptions(q, client.id),
    tasks: tab === "tareas"
      ? await listTasks(q, { client: client.id, assignee: person, campaign, archived, status: enumParam(sp.estado, TASK_STATUSES), priority: enumParam(sp.prioridad, PRIORITIES), manual: true })
      : [],
    deliverables: tab === "entregables"
      ? await listDeliverables(q, { client: client.id, owner: person, campaign, archived, status: enumParam(sp.estado, DELIVERABLE_STATUSES), channel: enumParam(sp.canal, CHANNELS) })
      : [],
  }));

  const base = clientPath(client.id, "trabajo");
  const readOnly = !!client.archived_at;
  // Conserva todos los filtros activos al cambiar uno (persona, vista…).
  const current = { tab, vista: view, persona: person, campana: campaign, estado: one(sp.estado), prioridad: one(sp.prioridad), canal: one(sp.canal), archivo: archived ? "1" : undefined };
  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) if (v && !(k === "vista" && v === "lista") && !(k === "tab" && v === "tareas")) next.set(k, v);
    const s = next.toString();
    return s ? `${base}?${s}` : base;
  };
  const people = opts.people.map((p) => ({ id: p.id, label: p.display_name, color: p.color }));
  // Botones de persona: tú primero; el resto en el orden del equipo.
  const peopleChips = [...people.filter((p) => p.id === user.id), ...people.filter((p) => p.id !== user.id)];
  const chip = (active: boolean) =>
    `inline-flex min-h-8 items-center gap-1.5 border border-ink py-1 pr-2.5 pl-1 text-[13px] font-semibold whitespace-nowrap ${active ? "bg-ink text-white" : "bg-surface text-ink hover:bg-subtle"}`;
  const campaigns = opts.campaigns.map((c) => ({ id: c.id, label: c.name }));

  return (
    <>
      <PageHeader title="Trabajo" />
      <Tabs current={tab} tabs={[{ key: "tareas", label: "Tareas", href: base }, { key: "entregables", label: "Entregables", href: `${base}?tab=entregables` }]} />

      {tab === "tareas" ? (
        <>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <nav aria-label="Tareas de" className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow mr-1">De</span>
              <Link href={qs({ persona: undefined })} aria-current={!person ? "true" : undefined} className={`${chip(!person)} pl-2.5`}>Todo el equipo</Link>
              {peopleChips.map((p) => (
                <Link key={p.id} href={qs({ persona: person === p.id ? undefined : p.id })} aria-current={person === p.id ? "true" : undefined} className={chip(person === p.id)}>
                  {/* Sobre el botón activo (negro), filo blanco para que la inicial en tinta no desaparezca. */}
                  <span className={`inline-flex ${person === p.id ? "outline outline-white" : ""}`}><Avatar name={p.label} color={p.color} size="xs" /></span>
                  {p.id === user.id ? `${p.label} (tú)` : p.label}
                </Link>
              ))}
            </nav>
            <div className="inline-flex border border-ink" role="group" aria-label="Vista">
              {(["lista", "kanban"] as const).map((v) => (
                <Link key={v} href={qs({ vista: v })} aria-current={view === v ? "true" : undefined}
                  className={`px-3 py-1 text-[13px] font-semibold ${view === v ? "bg-ink text-white" : "text-ink hover:bg-subtle"}`}>{v === "lista" ? "Lista" : "Kanban"}</Link>
              ))}
            </div>
          </div>
          <FilterBar filters={[
            // En el tablero el estado ya son las columnas.
            ...(view === "lista" ? [{ name: "estado", label: "Estado", options: options(TASK_STATUS_LABEL) }] : []),
            { name: "prioridad", label: "Prioridad", options: options(PRIORITY_LABEL, PRIORITIES) },
            { name: "campana", label: "Campaña", options: campaigns },
          ]} />
          {tasks.length === 0 ? (
            <div className="border-y border-ink py-2"><Empty>No hay tareas con estos filtros.</Empty></div>
          ) : view === "lista" ? (
            <div className="border-y border-ink">
              {readOnly ? <ul>{tasks.map((t) => <TaskItem key={t.id} task={t} today={today} readOnly />)}</ul> : (
                <SortableTasks items={tasks.map((t) => ({
                  id: t.id, label: t.title, group: t.status === "done" ? "done" : "open",
                  node: <TaskItem task={t} today={today} bare />,
                }))} />
              )}
            </div>
          ) : (
            <>
              {!readOnly && <p className="mb-2 text-xs text-muted">Arrastra una tarjeta a otra columna para cambiar su estado (o usa el selector de la tarjeta).</p>}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {TASK_STATUSES.map((status) => {
                  const column = tasks.filter((t) => t.status === status);
                  return (
                    <DropZone key={status} set={{ task: { field: "status", value: status } }} className="border-t-2 border-ink bg-subtle p-2">
                      <section aria-label={TASK_STATUS_LABEL[status]}>
                        <h2 className="px-1 py-1.5 text-sm font-extrabold tracking-tight">{TASK_STATUS_LABEL[status]} <span className="ml-1 font-mono text-xs font-medium text-muted">{column.length}</span></h2>
                        <ul className="min-h-16 space-y-2">
                          {column.map((t) => (
                            <li key={t.id}>
                              <Draggable kind="task" id={t.id} className="card p-3" disabled={readOnly}>
                                <Link href={taskPath(t)} className={`text-sm font-medium hover:underline ${t.status === "done" ? "text-muted line-through" : ""}`}>{t.title}</Link>
                                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <DueDate date={t.due_date} today={today} done={t.status === "done"} />
                                  <PriorityBadge priority={t.priority} />
                                </p>
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                                  <span className={`inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold ${t.assignee_id ? "" : "text-muted"}`}>
                                    <Avatar name={t.assignee_id ? personName(t.assignee_id, t.assignee_name, "") : null} color={colorOf(people, t.assignee_id)} />
                                    <span className="truncate">{personName(t.assignee_id, t.assignee_name, "Sin asignar")}</span>
                                  </span>
                                  {!readOnly && <TaskStatusSelect id={t.id} value={t.status} label={`Mover «${t.title}» a otro estado`} />}
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
          <div className="border-y border-ink">
            {deliverables.length === 0 ? <div className="py-2"><Empty>No hay entregables con estos filtros.</Empty></div> : (
              <ul>{deliverables.map((d) => <DeliverableItem key={d.id} d={d} today={today} readOnly={readOnly} />)}</ul>
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
