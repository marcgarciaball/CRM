import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Empty, PageHeader, Section } from "@/components/ui";
import { addDays, formatDate, formatDayLong, todayMadrid } from "@/lib/dates";
import { CLIENT_ROLE_LABEL } from "@/lib/labels";
import { load } from "@/lib/load";
import { clientPath, deliverablePath, newClientPath, taskPath } from "@/lib/paths";
import { clientSummaries, listMyClients } from "@/lib/services/clients";
import { listDeliverables } from "@/lib/services/deliverables";
import { listTasks } from "@/lib/services/tasks";

type Row = { key: string; href: string; title: string; client: string; date: string | null };

function Rows({ rows, empty, today }: { rows: Row[]; empty: string; today: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="-my-1">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line py-2 last:border-b-0">
          <Link href={r.href} className="min-w-0 font-medium break-words hover:underline">{r.title}</Link>
          <span className="text-[13px] text-muted">{r.client}{r.date && <> · <span className="font-mono">{formatDate(r.date, today)}</span></>}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Inicio: sin clientes, invitar a crear el primero (o, si todos están archivados, ir a ellos); con uno, directamente a él; con varios, lo que necesita a la
 * persona en todos ellos (cada fila dice de qué cliente es) y un bloque por cliente con su resumen.
 */
export default async function HomePage() {
  const today = todayMadrid();
  const data = await load(async (q, user) => {
    const clients = await clientSummaries(q, today);
    if (clients.length === 0) return { clients, archived: (await listMyClients(q, { archived: true })).length, mine: [], overdue: [], review: [] };
    if (clients.length === 1) return { clients, archived: 0, mine: [], overdue: [], review: [] };
    // Solo los clientes activos (los archivados no piden nada), filtrado en la consulta para que el límite no los cuente.
    const mine = await listTasks(q, { assignee: user.id, open: true, activeClients: true });
    const overdue = (await listTasks(q, { open: true, to: addDays(today, -1), activeClients: true })).filter((t) => t.assignee_id !== user.id);
    const review = await listDeliverables(q, { status: "in_review", activeClients: true, ownedClients: true });
    return { clients, archived: 0, mine, overdue, review };
  });
  const { user, clients } = data;
  if (clients.length === 1) redirect(clientPath(clients[0].id));
  if (clients.length === 0) {
    return (
      <div className="max-w-2xl">
        <PageHeader title={`Hola, ${user.display_name}`} />
        <div className="card p-6 text-center">
          {data.archived > 0 ? (
            <>
              <p className="mb-4 text-sm text-muted">Todos tus clientes están archivados. Puedes consultarlos o, si eres su propiedad, restaurarlos.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/clientes" className="btn btn-secondary">Ver mis clientes</Link>
                <Link href={newClientPath()} className="btn btn-primary">Nuevo cliente</Link>
              </div>
            </>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted">Todavía no perteneces a ningún cliente. Crea uno o pide a su propiedad que te añada.</p>
              <Link href={newClientPath()} className="btn btn-primary">Crea tu primer cliente</Link>
            </>
          )}
        </div>
      </div>
    );
  }
  const task = (t: (typeof data.mine)[number]): Row => ({ key: `t-${t.id}`, href: taskPath(t), title: t.title, client: t.client_name, date: t.due_date });
  return (
    <>
      <PageHeader title={`Hola, ${user.display_name}`} eyebrow={`Todos los clientes · ${formatDayLong(today)}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Mis tareas abiertas" count={data.mine.length}>
          <Rows rows={data.mine.map(task)} empty="No tienes tareas abiertas." today={today} />
        </Section>
        <Section title="Atrasado" count={data.overdue.length}>
          <Rows rows={data.overdue.map(task)} empty="Nada atrasado." today={today} />
        </Section>
        <Section title="Esperando tu revisión" count={data.review.length}>
          <Rows rows={data.review.map((d) => ({ key: `d-${d.id}`, href: deliverablePath(d), title: d.title, client: d.client_name, date: d.planned_date }))}
            empty="Nada esperando tu revisión." today={today} />
        </Section>
      </div>
      <Section title="Clientes" count={clients.length}>
        <ul className="-mt-3">
          {clients.map((c) => (
            <li key={c.id} className="grid items-center gap-x-6 gap-y-2 border-b border-line py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={clientPath(c.id)} className="text-lg font-extrabold tracking-tight uppercase hover:underline">{c.name}</Link>
                  {c.my_role === "owner" && <Badge tone="outline">{CLIENT_ROLE_LABEL.owner}</Badge>}
                </div>
                <p className="mt-0.5 text-[13px] text-muted">
                  {c.next_publication ? <>Próxima publicación: <span className="font-mono">{formatDate(c.next_publication, today)}</span></> : "Sin publicaciones previstas"}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-6 text-sm">
                <div><dt className="eyebrow">Abiertas</dt><dd className="font-mono text-lg">{c.open_tasks}</dd></div>
                <div><dt className="eyebrow">Vencidas</dt><dd className={`font-mono text-lg ${c.overdue > 0 ? "font-medium text-st-danger-fg" : ""}`}>{c.overdue}</dd></div>
                <div><dt className="eyebrow">En revisión</dt><dd className="font-mono text-lg">{c.in_review}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
