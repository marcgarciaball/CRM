import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCampaignAction } from "@/app/actions/work";
import { ActionForm } from "@/components/action-form";
import { ArchiveControls } from "@/components/danger-zone";
import { CampaignFields } from "@/components/forms";
import { ProgressBar } from "@/components/progress";
import { MaterialsSection } from "@/components/materials";
import { DeliverableItem, TaskItem, groupMaterials } from "@/components/rows";
import { Badge, CampaignStatusBadge, Collapsed, Empty, PageHeader, Section } from "@/components/ui";
import { formatDate, todayMadrid } from "@/lib/dates";
import { isUuid } from "@/lib/form";
import { personName } from "@/lib/labels";
import { loadClient } from "@/lib/load";
import { clientPath } from "@/lib/paths";
import { campaignPeople, getCampaign } from "@/lib/services/campaigns";
import { listProfiles } from "@/lib/services/core";
import { listDeliverables } from "@/lib/services/deliverables";
import { bulkMaterials } from "@/lib/services/resources";
import { listTasks } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Campaña" };

export default async function CampaignPage({ params }: { params: Promise<{ client: string; id: string }> }) {
  const { client: clientParam, id } = await params;
  if (!isUuid(id)) notFound();
  const { c, people, involved, deliverables, tasks, materials, client } = await loadClient(clientParam, async (q, _user, client) => {
    const deliverables = await listDeliverables(q, { client: client.id, campaign: id });
    const tasks = await listTasks(q, { client: client.id, campaign: id });
    const c = await getCampaign(q, id);
    return {
      c, people: await listProfiles(q, client.id), involved: await campaignPeople(q, id), deliverables, tasks,
      materials: groupMaterials(await bulkMaterials(q, { deliverables: deliverables.map((d) => d.id), tasks: tasks.map((t) => t.id) })),
    };
  });
  // Una campaña de otro cliente no existe en este.
  if (!c || c.client_id !== client.id) notFound();
  const readOnly = !!client.archived_at;
  const isOwner = client.my_role === "owner";
  const today = todayMadrid();
  return (
    <>
      <PageHeader title={c.name} eyebrow={<Link href={clientPath(client.id, "campanas")} className="hover:underline">← Campañas</Link>}>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <CampaignStatusBadge status={c.status} />
          {c.archived_at && <Badge tone="neutral">Archivada{c.archived_by ? ` por ${personName(c.archived_by, c.archived_by_name, "")}` : ""}</Badge>}
          <span className="font-mono text-muted">{c.start_date || c.end_date ? `${formatDate(c.start_date, today)} → ${formatDate(c.end_date, today)}` : "Sin fechas"}</span>
          <span>Responsable: {personName(c.owner_id, c.owner_name, "sin asignar")}</span>
        </p>
        {c.objective && <p className="mt-2 max-w-3xl text-sm"><span className="font-medium">Objetivo:</span> {c.objective}</p>}
        {involved.length > 0 && <p className="mt-1 text-sm text-muted">Participan: {involved.map((p) => p.display_name).join(", ")}</p>}
        <div className="mt-3 max-w-md"><ProgressBar c={c} /></div>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <MaterialsSection target={{ type: "campaign", id }} clientId={client.id} readOnly={readOnly} />
          <Section title="Entregables" count={deliverables.length}
            actions={!readOnly && <Link href={`${clientPath(client.id, "trabajo", "entregables", "nuevo")}?campana=${id}`} className="btn btn-secondary btn-sm">+ Entregable</Link>}>
            {deliverables.length === 0 ? <Empty>Sin entregables: newsletters, anuncios, publicaciones o landings de esta campaña.</Empty> : (
              <ul className="-my-2.5">{deliverables.map((d) => <DeliverableItem key={d.id} d={{ ...d, campaign_name: null }} today={today} materials={materials} readOnly={readOnly} />)}</ul>
            )}
          </Section>
          <Section title="Tareas" count={tasks.length}
            actions={!readOnly && <Link href={`${clientPath(client.id, "trabajo", "tareas", "nueva")}?campana=${id}`} className="btn btn-secondary btn-sm">+ Tarea</Link>}>
            {tasks.length === 0 ? <Empty>Sin tareas en esta campaña.</Empty> : (
              <ul className="-my-2.5">{tasks.map((t) => <TaskItem key={t.id} task={{ ...t, campaign_name: null }} today={today} readOnly={readOnly} />)}</ul>
            )}
          </Section>
        </div>
        <div className="min-w-0">
          {c.description && <Section title="Descripción"><p className="text-sm break-words whitespace-pre-wrap">{c.description}</p></Section>}
          {!readOnly && (
            <>
              <Collapsed title="Editar la campaña">
                <ActionForm action={updateCampaignAction} version={c.version} warnUnsaved submitLabel="Guardar cambios">
                  <input type="hidden" name="id" value={id} />
                  <CampaignFields clientId={client.id} c={c} people={people} />
                </ActionForm>
              </Collapsed>
              <ArchiveControls type="campaign" id={id} archivedAt={c.archived_at} isOwner={isOwner} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
