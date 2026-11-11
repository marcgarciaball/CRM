import Link from "next/link";
import { DeliverableItem, TaskItem, groupMaterials } from "@/components/rows";
import { Empty, PageHeader, Section } from "@/components/ui";
import { addDays, formatDayLong, todayMadrid } from "@/lib/dates";
import { load } from "@/lib/load";
import { listDeliverables } from "@/lib/services/deliverables";
import { bulkMaterials } from "@/lib/services/resources";
import { listTasks } from "@/lib/services/tasks";

export default async function HomePage() {
  const today = todayMadrid();
  const data = await load(async (q, user) => {
    const myTasks = await listTasks(q, { assignee: user.id, open: true });
    const overdueTasks = (await listTasks(q, { open: true, to: addDays(today, -1) })).filter((t) => t.assignee_id !== user.id);
    const dated = await listDeliverables(q, { to: addDays(today, 30) });
    const open = dated.filter((d) => d.status !== "published" && d.status !== "discarded");
    const lateDeliverables = open.filter((d) => d.planned_date! < today);
    const upcoming = open.filter((d) => d.planned_date! >= today);
    const inReview = await listDeliverables(q, { status: "in_review" });
    const ids = [...new Set([...lateDeliverables, ...upcoming, ...inReview].map((d) => d.id))];
    const materials = groupMaterials(await bulkMaterials(q, { deliverables: ids, tasks: myTasks.map((t) => t.id) }));
    return { myTasks, overdueTasks, lateDeliverables, upcoming, inReview, materials };
  });
  const { user, materials } = data;
  return (
    <>
      <PageHeader title={`Hola, ${user.display_name}`} eyebrow={formatDayLong(today)} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <Section title="Mis tareas abiertas" count={data.myTasks.length}>
            {data.myTasks.length === 0 ? <Empty>No tienes tareas abiertas.</Empty> : (
              <ul className="-my-2.5">{data.myTasks.map((t) => <TaskItem key={t.id} task={t} today={today} showAssignee={false} materials={materials} />)}</ul>
            )}
          </Section>
          <Section title="Atrasado en el equipo" count={data.overdueTasks.length + data.lateDeliverables.length}>
            {data.overdueTasks.length + data.lateDeliverables.length === 0 ? <Empty>Nada atrasado.</Empty> : (
              <ul className="-my-2.5">
                {data.lateDeliverables.map((d) => <DeliverableItem key={d.id} d={d} today={today} />)}
                {data.overdueTasks.map((t) => <TaskItem key={t.id} task={t} today={today} />)}
              </ul>
            )}
          </Section>
        </div>
        <div className="min-w-0">
          <Section title="Esperando revisión" count={data.inReview.length}>
            {data.inReview.length === 0 ? <Empty>Nada esperando revisión.</Empty> : (
              <ul className="-my-2.5">{data.inReview.map((d) => <DeliverableItem key={d.id} d={d} today={today} materials={materials} />)}</ul>
            )}
          </Section>
          <Section title="Próximas publicaciones" count={data.upcoming.length} actions={<Link href="/calendario" className="link text-sm">Ver calendario</Link>}>
            {data.upcoming.length === 0 ? <Empty>No hay publicaciones previstas.</Empty> : (
              <ul className="-my-2.5">{data.upcoming.map((d) => <DeliverableItem key={d.id} d={d} today={today} materials={materials} />)}</ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
