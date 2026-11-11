import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { Draggable, DropZone } from "@/components/quick";
import { DeliverableItem, TaskItem, groupMaterials } from "@/components/rows";
import { SlideCard } from "@/components/slide";
import { DELIVERABLE_TONE, Empty, PageHeader, Section, TONE_CLASS, Tabs, options } from "@/components/ui";
import {
  addDays, addMonths, formatDate, formatDayLong, formatMonth, formatRange, isLocalDate, isYearMonth, monthGrid, monthOf, monthRange, startOfWeek, todayMadrid,
} from "@/lib/dates";
import { CHANNELS, CHANNEL_LABEL, DELIVERABLE_STATUSES, DELIVERABLE_STATUS_LABEL } from "@/lib/labels";
import { firstClientId, formOptions, load } from "@/lib/load";
import { enumParam, one, uuidParam, type SearchParams } from "@/lib/params";
import { assetsByDeliverable } from "@/lib/services/assets";
import { campaignsForRange } from "@/lib/services/campaigns";
import { listDeliverables } from "@/lib/services/deliverables";
import { bulkMaterials } from "@/lib/services/resources";
import { listTasks } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Calendario" };
const VIEWS = ["mes", "lista", "diapositivas", "semana"] as const;
const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const today = todayMadrid();
  const view = enumParam(sp.vista, VIEWS) ?? "mes";
  const dayParam = one(sp.dia);
  const weekStart = startOfWeek(isLocalDate(dayParam) ? dayParam : today);
  const monthParam = one(sp.mes);
  const month = isYearMonth(monthParam) ? monthParam : view === "semana" ? monthOf(weekStart) : monthOf(today);
  const { first, last } = monthRange(month);
  const grid = monthGrid(month);
  // Rango consultado: la semana, o la rejilla del mes (incluye días de meses vecinos).
  const [from, to] = view === "semana" ? [weekStart, addDays(weekStart, 6)] : view === "mes" ? [grid[0][0], grid.at(-1)![6]] : [first, last];
  const person = uuidParam(sp.persona), campaign = uuidParam(sp.campana);
  const channel = enumParam(sp.canal, CHANNELS), status = enumParam(sp.estado, DELIVERABLE_STATUSES);
  const showTasks = one(sp.tareas) === "1";

  const { opts, deliverables, tasks, campaigns, unplannedD, unplannedT, materials, assets } = await load(async (q) => {
    const base = { owner: person, campaign, channel, status };
    const deliverables = await listDeliverables(q, { ...base, from, to });
    const tasks = await listTasks(q, { assignee: person, campaign, from, to });
    const unplannedD = await listDeliverables(q, { ...base, unplanned: true });
    const unplannedT = await listTasks(q, { assignee: person, campaign, unplanned: true, open: true });
    const clientId = await firstClientId(q); // TODO(Task 5)
    const campaigns = (clientId ? await campaignsForRange(q, clientId, view === "semana" ? from : first, view === "semana" ? to : last) : []).filter((c) => !campaign || c.id === campaign);
    const materials = groupMaterials(await bulkMaterials(q, {
      deliverables: [...deliverables, ...unplannedD].map((d) => d.id), tasks: [...tasks, ...unplannedT].map((t) => t.id),
      campaigns: [...new Set([...deliverables, ...unplannedD].map((d) => d.campaign_id).concat(tasks.map((t) => t.effective_campaign_id)).filter((x): x is string => !!x))],
    }));
    // Solo la vista de diapositivas enseña la creatividad final de cada pieza.
    const assets = await assetsByDeliverable(q, view === "diapositivas" ? deliverables.map((d) => d.id) : []);
    return { opts: await formOptions(q), deliverables, tasks, campaigns, unplannedD, unplannedT, materials, assets };
  });

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const all = { vista: view, mes: view === "semana" ? undefined : month, dia: view === "semana" ? weekStart : undefined, persona: person, campana: campaign, canal: channel, estado: status, tareas: showTasks ? "1" : undefined, ...patch };
    for (const [k, v] of Object.entries(all)) if (v) next.set(k, v);
    return `/calendario?${next}`;
  };
  const prev = view === "semana" ? href({ dia: addDays(weekStart, -7) }) : href({ mes: addMonths(month, -1) });
  const next = view === "semana" ? href({ dia: addDays(weekStart, 7) }) : href({ mes: addMonths(month, 1) });
  const title = view === "semana" ? `Semana del ${formatRange(weekStart, addDays(weekStart, 6))}` : formatMonth(month);
  const byDay = (d: string) => deliverables.filter((x) => x.planned_date === d);
  const tasksByDay = (d: string) => tasks.filter((x) => x.due_date === d);
  const unplannedCount = unplannedD.length + unplannedT.length;

  const renderDays = ({ days, empty, showEmpty }: { days: string[]; empty?: string; showEmpty?: boolean }) => {
    if (days.length === 0) return <div className="card mb-4 p-4"><Empty>{empty}</Empty></div>;
    return (
      <div className="mb-4 space-y-3">
        {days.map((day) => {
          const ds = byDay(day), ts = tasksByDay(day);
          if (!showEmpty && ds.length + ts.length === 0) return null;
          return (
            <section key={day} className={`card px-4 py-3 ${day === today ? "border-ink" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold first-letter:uppercase">{formatDayLong(day)}{day === today && <span className="ml-2 rounded-pill bg-highlight px-2 py-0.5 text-xs">Hoy</span>}</h2>
                <Link href={`/trabajo/entregables/nuevo?fecha=${day}`} className="more">+ Entregable</Link>
              </div>
              {ds.length + ts.length === 0 && <Empty>Nada previsto.</Empty>}
              {ds.length > 0 && <><p className="eyebrow pt-2">Se publica</p><ul>{ds.map((d) => <DeliverableItem key={d.id} d={d} today={today} materials={materials} />)}</ul></>}
              {ts.length > 0 && <><p className="eyebrow pt-2">Tareas que vencen</p><ul>{ts.map((t) => <TaskItem key={t.id} task={t} today={today} materials={materials} />)}</ul></>}
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <PageHeader title={title.charAt(0).toUpperCase() + title.slice(1)}
        actions={<>
          <Link href={prev} className="btn btn-secondary" aria-label={view === "semana" ? "Semana anterior" : "Mes anterior"}>←</Link>
          <Link href={href({ mes: monthOf(today), dia: view === "semana" ? today : undefined })} className="btn btn-secondary">Hoy</Link>
          <Link href={next} className="btn btn-secondary" aria-label={view === "semana" ? "Semana siguiente" : "Mes siguiente"}>→</Link>
        </>} />
      <div className="flex flex-wrap items-start justify-between gap-x-4">
        <Tabs current={view} tabs={[
          { key: "mes", label: "Mes", href: href({ vista: "mes", mes: month, dia: undefined }) },
          { key: "lista", label: "Lista", href: href({ vista: "lista", mes: month, dia: undefined }) },
          { key: "diapositivas", label: "Diapositivas", href: href({ vista: "diapositivas", mes: month, dia: undefined }) },
          { key: "semana", label: "Semana", href: href({ vista: "semana", mes: undefined, dia: month === monthOf(today) ? today : first }) },
        ]} />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {view !== "semana" && (
            <form action="/calendario" className="flex items-center gap-1">
              {Object.entries({ vista: view, persona: person, campana: campaign, canal: channel, estado: status, tareas: showTasks ? "1" : undefined }).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
              <label className="sr-only" htmlFor="pick-month">Ir a un mes y año</label>
              <input id="pick-month" type="month" name="mes" defaultValue={month} required className="field !min-h-9 !w-auto !py-1" />
              <button type="submit" className="btn btn-secondary btn-sm">Ir</button>
            </form>
          )}
          {view === "mes" && (
            <Link href={href({ tareas: showTasks ? undefined : "1" })} aria-pressed={showTasks} className={`btn btn-sm ${showTasks ? "btn-primary" : "btn-secondary"}`}>
              {showTasks ? "Ocultar tareas" : "Mostrar tareas"}
            </Link>
          )}
          <a href="#sin-planificar" className="btn btn-secondary btn-sm">Sin planificar ({unplannedCount})</a>
        </div>
      </div>
      <details className="mb-2" open={!!(person || campaign || channel || status)}>
        <summary className="more mb-2">Filtros{(person || campaign || channel || status) ? " (activos)" : ""}</summary>
        <FilterBar filters={[
          { name: "persona", label: "Persona", options: opts.people.map((p) => ({ id: p.id, label: p.display_name })) },
          { name: "canal", label: "Canal", options: options(CHANNEL_LABEL, CHANNELS) },
          { name: "campana", label: "Campaña", options: opts.campaigns.map((c) => ({ id: c.id, label: c.name })) },
          { name: "estado", label: "Estado", options: options(DELIVERABLE_STATUS_LABEL, DELIVERABLE_STATUSES) },
        ]} />
      </details>

      {campaigns.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label={view === "semana" ? "Campañas de esta semana" : "Campañas de este mes"}>
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/campanas/${c.id}`} className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1 text-sm hover:bg-bg">
                <span className="size-2 rounded-full bg-accent" aria-hidden />
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted">{c.start_date || c.end_date ? `${formatDate(c.start_date, today)} → ${formatDate(c.end_date, today)}` : "sin fechas propias"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {view === "mes" && (
        <>
          {/* Escritorio: rejilla con arrastrar y soltar. Móvil: la misma información como lista de días. */}
          <div className="card mb-2 hidden overflow-hidden md:block">
            <div className="grid grid-cols-7 border-b border-line bg-bg">
              {WEEKDAYS.map((d) => <div key={d} className="px-2 py-1.5 text-xs font-medium text-muted">{d}</div>)}
            </div>
            {grid.map((week) => (
              <div key={week[0]} className="grid grid-cols-7 border-b border-line last:border-b-0">
                {week.map((day) => {
                  const inMonth = monthOf(day) === month;
                  return (
                    <DropZone key={day} set={{ deliverable: { field: "planned_date", value: day }, task: { field: "due_date", value: day } }}
                      className={`group min-h-28 border-r border-line p-1.5 last:border-r-0 ${inMonth ? "" : "bg-bg/70"}`}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className={`flex size-6 items-center justify-center rounded-full text-xs ${day === today ? "bg-ink font-semibold text-white" : inMonth ? "" : "text-muted"}`}>
                          <span className="sr-only">{formatDayLong(day)}</span><span aria-hidden>{Number(day.slice(8))}</span>
                        </span>
                        <Link href={`/trabajo/entregables/nuevo?fecha=${day}`} className="rounded px-1.5 text-muted opacity-0 group-hover:opacity-100 hover:bg-bg focus:opacity-100" aria-label={`Nuevo entregable el ${formatDayLong(day)}`}>+</Link>
                      </div>
                      <ul className="space-y-1">
                        {byDay(day).map((d) => (
                          <li key={d.id}>
                            <Draggable kind="deliverable" id={d.id}>
                              <Link href={`/trabajo/entregables/${d.id}`} draggable={false} className={`block truncate rounded-md px-1.5 py-1 text-xs font-medium hover:opacity-80 ${TONE_CLASS[DELIVERABLE_TONE[d.status]]} ${d.status === "discarded" ? "line-through" : ""}`}
                                title={`${d.title} · ${CHANNEL_LABEL[d.channel]} · ${d.owner_name ?? "Sin responsable"} · ${DELIVERABLE_STATUS_LABEL[d.status]}`}>
                                {d.title}
                              </Link>
                            </Draggable>
                          </li>
                        ))}
                        {showTasks && tasksByDay(day).map((t) => (
                          <li key={t.id}>
                            <Draggable kind="task" id={t.id}>
                              <Link href={`/trabajo/tareas/${t.id}`} draggable={false} className={`block truncate rounded-md border border-dashed border-line px-1.5 py-0.5 text-xs hover:bg-bg ${t.status === "done" ? "text-muted line-through" : ""}`}
                                title={`Tarea: ${t.title} · ${t.assignee_name ?? "Sin asignar"}`}>
                                {t.title}
                              </Link>
                            </Draggable>
                          </li>
                        ))}
                      </ul>
                    </DropZone>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mb-4 hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted md:flex">
            <span>Arrastra una publicación a otro día para cambiar su fecha.</span>
            {(["in_preparation", "in_review", "changes_requested", "waiting_client", "approved", "published", "discarded"] as const).map((s) => (
              <span key={s} className={`rounded-md px-1.5 py-0.5 ${TONE_CLASS[DELIVERABLE_TONE[s]]} ${s === "discarded" ? "line-through" : ""}`}>
                {s === "approved" ? "Validado / programado" : s === "waiting_client" ? "Esperando (cliente o marketing)" : s === "in_preparation" ? "En preparación / en pausa" : DELIVERABLE_STATUS_LABEL[s]}
              </span>
            ))}
          </p>
          <div className="md:hidden">
            {renderDays({ days: grid.flat().filter((d) => monthOf(d) === month && (byDay(d).length > 0 || tasksByDay(d).length > 0)), empty: "Nada fechado este mes." })}
          </div>
        </>
      )}

      {view === "semana" && renderDays({ days: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), showEmpty: true })}

      {view === "diapositivas" && (
        <div className="mb-4">
          {deliverables.length === 0 ? <div className="card p-4"><Empty>No hay publicaciones previstas este mes.</Empty></div> : (
            <>
              <p className="mb-3 text-[13px] text-muted">
                {deliverables.length} {deliverables.length === 1 ? "pieza" : "piezas"} de este mes, por fecha de publicación. A la izquierda, la información y el copy out; a la derecha, la creatividad final o su propuesta.
              </p>
              {deliverables.map((d) => (
                <SlideCard key={d.id} d={d} assets={assets.get(d.id) ?? []} links={materials.deliverable.get(d.id) ?? []} />
              ))}
            </>
          )}
        </div>
      )}

      {view === "lista" && (
        <>
          <Section title="Publicaciones del mes" count={deliverables.length}>
            {deliverables.length === 0 ? <Empty>No hay publicaciones previstas este mes.</Empty> : grid.map((week) => {
              const days = week.filter((d) => monthOf(d) === month);
              const items = deliverables.filter((d) => days.includes(d.planned_date!));
              if (items.length === 0) return null;
              return (
                <div key={week[0]} className="mb-4 last:mb-0">
                  <h3 className="eyebrow">Semana del {formatRange(days[0], days.at(-1)!)}</h3>
                  <ul>{items.map((d) => <DeliverableItem key={d.id} d={d} today={today} materials={materials} />)}</ul>
                </div>
              );
            })}
          </Section>
          <Section title="Tareas que vencen este mes" count={tasks.length}>
            {tasks.length === 0 ? <Empty>Ninguna tarea vence este mes.</Empty> : (
              <ul className="-my-2.5">{tasks.map((t) => <TaskItem key={t.id} task={t} today={today} materials={materials} />)}</ul>
            )}
          </Section>
        </>
      )}

      <Section id="sin-planificar" title="Sin planificar" count={unplannedCount}>
        {unplannedCount === 0 ? <Empty>Todo tiene fecha.</Empty> : (
          <>
            <p className="mb-1 text-[13px] text-muted">Ponles fecha aquí mismo y pasarán a su mes.</p>
            {unplannedD.length > 0 && <><h3 className="eyebrow mt-2">Entregables sin fecha de publicación</h3>
              <ul>{unplannedD.map((d) => <DeliverableItem key={d.id} d={d} today={today} materials={materials} />)}</ul></>}
            {unplannedT.length > 0 && <><h3 className="eyebrow mt-3">Tareas abiertas sin fecha límite</h3>
              <ul>{unplannedT.map((t) => <TaskItem key={t.id} task={t} today={today} materials={materials} />)}</ul></>}
          </>
        )}
      </Section>
    </>
  );
}
