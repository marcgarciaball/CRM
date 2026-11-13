import Link from "next/link";
import { DeliverableItem, TaskItem, groupMaterials } from "@/components/rows";
import { Empty, PageHeader, Section } from "@/components/ui";
import { addDays, formatDayLong, todayMadrid } from "@/lib/dates";
import { loadClient } from "@/lib/load";
import { clientPath } from "@/lib/paths";
import { listDeliverables } from "@/lib/services/deliverables";
import { bulkMaterials } from "@/lib/services/resources";
import { listTasks } from "@/lib/services/tasks";

/** Resumen de un cliente: lo mío, lo atrasado, lo que espera revisión y lo próximo, solo de este cliente. */
export default async function ClientHomePage({ params }: { params: Promise<{ client: string }> }) {
  const today = todayMadrid();
  const data = await loadClient((await params).client, async (q, user, client) => {
    const myTasks = await listTasks(q, { client: client.id, assignee: user.id, open: true });
    const overdueTasks = (await listTasks(q, { client: client.id, open: true, to: addDays(today, -1) })).filter((t) => t.assignee_id !== user.id);
    const dated = await listDeliverables(q, { client: client.id, to: addDays(today, 30) });
    const open = dated.filter((d) => d.status !== "published" && d.status !== "discarded");
    const lateDeliverables = open.filter((d) => d.planned_date! < today);
    const upcoming = open.filter((d) => d.planned_date! >= today);
    const inReview = await listDeliverables(q, { client: client.id, status: "in_review" });
    const ids = [...new Set([...lateDeliverables, ...upcoming, ...inReview].map((d) => d.id))];
    const materials = groupMaterials(await bulkMaterials(q, { deliverables: ids, tasks: myTasks.map((t) => t.id) }));
    return { myTasks, overdueTasks, lateDeliverables, upcoming, inReview, materials };
  });
  const { user, client, materials } = data;
  const readOnly = !!client.archived_at;
  return (
    <>
      <PageHeader title={`Hola, ${user.display_name}`} eyebrow={`${client.name} · ${formatDayLong(today)}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <Section title="Mis tareas abiertas" count={data.myTasks.length}>
            {data.myTasks.length === 0 ? <Empty>No tienes tareas abiertas.</Empty> : (
              <ul className="-my-2.5">{data.myTasks.map((t) => <TaskItem key={t.id} task={t} today={today} showAssignee={false} materials={materials} readOnly={readOnly} />)}</ul>
            )}
          </Section>
          <Section title="Atrasado en el equipo" count={data.overdueTasks.length + data.lateDeliverables.length}>
            {data.overdueTasks.length + data.lateDeliverables.length === 0 ? <Empty>Nada atrasado.</Empty> : (
              <ul className="-my-2.5">
                {data.lateDeliverables.map((d) => <DeliverableItem key={d.id} d={d} today={today} readOnly={readOnly} />)}
                {data.overdueTasks.map((t) => <TaskItem key={t.id} task={t} today={today} readOnly={readOnly} />)}
              </ul>
            )}
          </Section>
        </div>
        <div className="min-w-0">
          <Section title="Esperando revisión" count={data.inReview.length}>
            {data.inReview.length === 0 ? <Empty>Nada esperando revisión.</Empty> : (
              <ul className="-my-2.5">{data.inReview.map((d) => <DeliverableItem key={d.id} d={d} today={today} materials={materials} readOnly={readOnly} />)}</ul>
            )}
          </Section>
          <Section title="Próximas publicaciones" count={data.upcoming.length} actions={<Link href={clientPath(client.id, "calendario")} className="link text-sm">Ver calendario</Link>}>
            {data.upcoming.length === 0 ? <Empty>No hay publicaciones previstas.</Empty> : (
              <ul className="-my-2.5">{data.upcoming.map((d) => <DeliverableItem key={d.id} d={d} today={today} materials={materials} readOnly={readOnly} />)}</ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
