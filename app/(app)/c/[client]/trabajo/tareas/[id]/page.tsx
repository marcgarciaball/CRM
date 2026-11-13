import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateTaskAction } from "@/app/actions/work";
import { ActionForm } from "@/components/action-form";
import { ArchiveControls } from "@/components/danger-zone";
import { Comments, History } from "@/components/discussion";
import { TaskFields } from "@/components/forms";
import { MaterialsSection } from "@/components/materials";
import { QuickDate, QuickSelect } from "@/components/quick";
import { DueDate } from "@/components/rows";
import { Badge, Collapsed, PageHeader, PriorityBadge, Section, options } from "@/components/ui";
import { todayMadrid } from "@/lib/dates";
import { isUuid } from "@/lib/form";
import { TASK_STATUS_LABEL, personName } from "@/lib/labels";
import { formOptions, loadClient } from "@/lib/load";
import { campaignPath, clientPath, deliverablePath } from "@/lib/paths";
import { listActivity, listComments, listProfiles } from "@/lib/services/core";
import { deliverableOptions } from "@/lib/services/deliverables";
import { getTask } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Tarea" };

export default async function TaskPage({ params }: { params: Promise<{ client: string; id: string }> }) {
  const { client: clientParam, id } = await params;
  if (!isUuid(id)) notFound();
  const { task, opts, everyone, deliverables, comments, activity, user, client } = await loadClient(clientParam, async (q, _user, client) => ({
    task: await getTask(q, id),
    opts: await formOptions(q, client.id),
    everyone: await listProfiles(q, client.id, false),
    deliverables: await deliverableOptions(q, client.id),
    comments: await listComments(q, "task", id),
    activity: await listActivity(q, "task", id),
  }));
  // Una tarea de otro cliente no existe en este.
  if (!task || task.client_id !== client.id) notFound();
  const readOnly = !!client.archived_at;
  const isOwner = client.my_role === "owner";
  const today = todayMadrid();
  const people = opts.people.map((p) => ({ id: p.id, label: p.display_name }));
  if (task.assignee_id && !people.some((p) => p.id === task.assignee_id)) people.push({ id: task.assignee_id, label: personName(task.assignee_id, task.assignee_name, "") });
  return (
    <>
      <PageHeader title={task.title} eyebrow={<Link href={clientPath(client.id, "trabajo")} className="hover:underline">← Tareas</Link>}>
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
          {readOnly ? (
            <>
              <Badge tone="neutral">{TASK_STATUS_LABEL[task.status]}</Badge>
              <span>{personName(task.assignee_id, task.assignee_name, "Sin asignar")}</span>
              <span className="text-muted">Fecha límite:</span> <DueDate date={task.due_date} today={today} done={task.status === "done"} />
            </>
          ) : (
            <>
              <QuickSelect kind="task" id={id} field="status" value={task.status} options={options(TASK_STATUS_LABEL)} label="Estado" />
              <QuickSelect kind="task" id={id} field="assignee_id" value={task.assignee_id} options={people} empty="Sin asignar" label="Asignada a" />
              <span className="text-muted">Fecha límite:</span>
              <QuickDate kind="task" id={id} field="due_date" value={task.due_date} label="Fecha límite" danger={!!task.due_date && task.status !== "done" && task.due_date < today} />
            </>
          )}
          <PriorityBadge priority={task.priority} />
          {task.archived_at && <Badge tone="neutral">Archivada</Badge>}
        </div>
        {(task.deliverable_id || task.effective_campaign_id) && (
          <p className="mt-1 text-sm text-muted">
            {task.deliverable_id && <>Para el entregable <Link className="link" href={deliverablePath({ client_id: client.id, id: task.deliverable_id })}>{task.deliverable_title}</Link></>}
            {task.deliverable_id && task.effective_campaign_id && " · "}
            {task.effective_campaign_id && <>Campaña <Link className="link" href={campaignPath({ client_id: client.id, id: task.effective_campaign_id })}>{task.campaign_name}</Link></>}
          </p>
        )}
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <MaterialsSection target={{ type: "task", id }} clientId={client.id} readOnly={readOnly} />
          <Section title="Descripción y datos">
            {task.description && <p className="mb-3 text-sm break-words whitespace-pre-wrap">{task.description}</p>}
            {readOnly ? !task.description && <p className="text-sm text-muted">Sin descripción.</p> : (
              <details open={!task.description}>
                <summary className="more">Editar la tarea</summary>
                <div className="mt-3">
                  <ActionForm action={updateTaskAction} version={task.version} warnUnsaved submitLabel="Guardar cambios">
                    <input type="hidden" name="id" value={id} />
                    <TaskFields clientId={client.id} t={task} opts={opts} deliverables={deliverables} />
                  </ActionForm>
                </div>
              </details>
            )}
          </Section>
        </div>
        <div className="min-w-0">
          <Comments type="task" id={id} comments={comments} user={user} isOwner={isOwner} readOnly={readOnly} />
          <Collapsed title="Historial" count={activity.length}><History type="task" activity={activity} people={everyone} /></Collapsed>
          {!readOnly && <ArchiveControls type="task" id={id} archivedAt={task.archived_at} isOwner={isOwner} />}
        </div>
      </div>
    </>
  );
}
