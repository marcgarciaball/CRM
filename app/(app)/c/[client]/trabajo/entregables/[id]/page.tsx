import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateDeliverableAction } from "@/app/actions/work";
import { ActionForm } from "@/components/action-form";
import { ArchiveControls } from "@/components/danger-zone";
import { Comments, History } from "@/components/discussion";
import { DeliverableFields } from "@/components/forms";
import { MaterialsSection } from "@/components/materials";
import { CreativePanel, Linkified, SlideMeta } from "@/components/slide";
import { NextStep } from "@/components/next-step";
import { QuickDate, QuickSelect } from "@/components/quick";
import { TaskItem } from "@/components/rows";
import { Badge, ChannelBadge, Collapsed, Empty, Field, PageHeader, Section } from "@/components/ui";
import { formatDate, formatInstant, todayMadrid } from "@/lib/dates";
import { isUuid } from "@/lib/form";
import { personName } from "@/lib/labels";
import { formOptions, loadClient } from "@/lib/load";
import { campaignPath, clientPath } from "@/lib/paths";
import { listAssets } from "@/lib/services/assets";
import { listActivity, listComments, listProfiles } from "@/lib/services/core";
import { getDeliverable, listPublications } from "@/lib/services/deliverables";
import { getContextualMaterials } from "@/lib/services/resources";
import { listTasks } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Entregable" };

export default async function DeliverablePage({ params }: { params: Promise<{ client: string; id: string }> }) {
  const { client: clientParam, id } = await params;
  if (!isUuid(id)) notFound();
  const { d, opts, everyone, tasks, comments, activity, publications, assets, links, user, client } = await loadClient(clientParam, async (q, _user, client) => ({
    d: await getDeliverable(q, id),
    opts: await formOptions(q, client.id),
    everyone: await listProfiles(q, client.id, false),
    tasks: await listTasks(q, { deliverable: id }),
    comments: await listComments(q, "deliverable", id),
    activity: await listActivity(q, "deliverable", id),
    publications: await listPublications(q, id),
    assets: await listAssets(q, id),
    links: (await getContextualMaterials(q, { type: "deliverable", id })).own,
  }));
  // Un entregable de otro cliente no existe en este.
  if (!d || d.client_id !== client.id) notFound();
  const readOnly = !!client.archived_at;
  const isOwner = client.my_role === "owner";
  const today = todayMadrid();
  const locked = ["approved", "scheduled", "published"].includes(d.status);
  const people = opts.people.map((p) => ({ id: p.id, label: p.display_name }));
  if (d.owner_id && !people.some((p) => p.id === d.owner_id)) people.push({ id: d.owner_id, label: personName(d.owner_id, d.owner_name, "") });
  return (
    <>
      <PageHeader title={d.title} eyebrow={<Link href={`${clientPath(client.id, "trabajo")}?tab=entregables`} className="hover:underline">← Entregables</Link>}>
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
          <ChannelBadge channel={d.channel} />
          {d.archived_at && <Badge tone="neutral">Archivado</Badge>}
          {readOnly ? (
            <>
              <span>{personName(d.owner_id, d.owner_name, "Sin responsable")}</span>
              <span className="text-muted">Publicación prevista: <span className="font-mono">{formatDate(d.planned_date, today)}</span></span>
            </>
          ) : (
            <>
              <QuickSelect kind="deliverable" id={id} field="owner_id" value={d.owner_id} options={people} empty="Sin responsable" label="Responsable" />
              <span className="text-muted">Publicación prevista:</span>
              <QuickDate kind="deliverable" id={id} field="planned_date" value={d.planned_date} label="Fecha prevista de publicación" />
            </>
          )}
          {d.campaign_id && <Link className="link ml-1" href={campaignPath({ client_id: client.id, id: d.campaign_id })}>{d.campaign_name}</Link>}
        </div>
      </PageHeader>
      <NextStep d={d} isOwner={isOwner} today={today} readOnly={readOnly} />
      {/* La diapositiva: a la izquierda, la información y el copy out; a la derecha, sobre gris, la creatividad. */}
      <div className="card mb-4 grid overflow-hidden lg:grid-cols-2">
        <section className="min-w-0 p-4 sm:p-5" aria-label="Información y copy out">
          <SlideMeta d={d} />
          <h2 className="mt-3 mb-2 text-[15px] font-extrabold tracking-tight">Copy out</h2>
          {readOnly ? (d.copy ? <Linkified text={d.copy} /> : <p className="text-sm text-muted">Sin copy todavía.</p>) : (
          <ActionForm action={updateDeliverableAction} version={d.version} warnUnsaved submitLabel="Guardar cambios">
              <input type="hidden" name="id" value={id} />
              <label className="sr-only" htmlFor="f-copy">Copy out</label>
              <textarea id="f-copy" name="copy" rows={14} maxLength={50000} defaultValue={d.copy} className="field" placeholder="El texto que acompaña a la publicación: asunto, titular, descripción, hashtags…" />
              {locked && <p className="mt-1 bg-st-warn-bg px-2 py-1 text-xs text-st-warn-fg">Este contenido está validado: si cambias el copy, volverá a «En revisión».</p>}
              <details className="mt-3">
                <summary className="more">Brief y datos del entregable</summary>
                <div className="mt-3 space-y-3">
                  <Field label="Brief" htmlFor="f-brief" hint="Qué hay que contar y para quién.">
                    <textarea id="f-brief" name="brief" rows={4} maxLength={20000} defaultValue={d.brief} className="field" />
                  </Field>
                  <DeliverableFields clientId={client.id} d={d} opts={opts} />
                </div>
              </details>
          </ActionForm>
          )}
        </section>
        <section className="min-w-0 border-t border-ink bg-subtle p-4 sm:p-5 lg:border-t-0 lg:border-l" aria-label="Creatividad">
          <CreativePanel d={d} assets={assets} links={links} readOnly={readOnly} />
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <MaterialsSection target={{ type: "deliverable", id }} clientId={client.id} readOnly={readOnly} />
          <Comments type="deliverable" id={id} comments={comments} user={user} isOwner={isOwner} readOnly={readOnly} />
        </div>
        <div className="min-w-0">
          {d.brief && (
            <Section title="Brief"><p className="text-sm break-words whitespace-pre-wrap">{d.brief}</p></Section>
          )}
          <Section title="Tareas" count={tasks.length}
            actions={!readOnly && <Link href={`${clientPath(client.id, "trabajo", "tareas", "nueva")}?entregable=${id}`} className="btn btn-secondary btn-sm">+ Tarea</Link>}>
            {tasks.length === 0 ? <Empty>Sin tareas. Crea una para el copy, el diseño o el lanzamiento.</Empty> : (
              <ul className="-my-2.5">{tasks.map((t) => <TaskItem key={t.id} task={{ ...t, deliverable_title: null, campaign_name: null }} today={today} readOnly={readOnly} />)}</ul>
            )}
          </Section>
          {publications.length > 0 && (
            <Section title="Publicaciones registradas" count={publications.length}>
              <ul className="text-sm">
                {publications.map((p) => (
                  <li key={p.id} className="border-b border-line py-1.5 last:border-b-0">
                    <span className="font-mono font-medium">{formatDate(p.published_on, today)}</span> · revisión <span className="font-mono">{p.revision}</span>
                    <span className="text-muted"> · lo registró {personName(p.recorded_by, p.recorded_by_name, "alguien")} el <span className="font-mono">{formatInstant(p.recorded_at)}</span></span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Collapsed title="Historial" count={activity.length}><History type="deliverable" activity={activity} people={everyone} /></Collapsed>
          {!readOnly && <ArchiveControls type="deliverable" id={id} archivedAt={d.archived_at} isOwner={isOwner} />}
        </div>
      </div>
    </>
  );
}
