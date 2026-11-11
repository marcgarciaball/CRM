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
import { Badge, Collapsed, PageHeader, PriorityBadge, Section, options } from "@/components/ui";
import { todayMadrid } from "@/lib/dates";
import { isUuid } from "@/lib/form";
import { TASK_STATUS_LABEL } from "@/lib/labels";
import { formOptions, load } from "@/lib/load";
import { listActivity, listComments } from "@/lib/services/core";
import { deliverableOptions } from "@/lib/services/deliverables";
import { getTask } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Tarea" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { task, opts, deliverables, comments, activity, user } = await load(async (q) => {
    const task = await getTask(q, id);
    return {
      task,
      opts: await formOptions(q),
      deliverables: task ? await deliverableOptions(q, task.client_id) : [], // TODO(Task 5)
      comments: await listComments(q, "task", id),
      activity: await listActivity(q, "task", id),
    };
  });
  if (!task) notFound();
  const today = todayMadrid();
  const people = opts.people.map((p) => ({ id: p.id, label: p.display_name }));
  return (
    <>
      <PageHeader title={task.title} eyebrow={<Link href="/trabajo" className="hover:underline">← Tareas</Link>}>
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
          <QuickSelect kind="task" id={id} field="status" value={task.status} options={options(TASK_STATUS_LABEL)} label="Estado" />
          <QuickSelect kind="task" id={id} field="assignee_id" value={task.assignee_id} options={people} empty="Sin asignar" label="Asignada a" />
          <span className="text-muted">Fecha límite:</span>
          <QuickDate kind="task" id={id} field="due_date" value={task.due_date} label="Fecha límite" danger={!!task.due_date && task.status !== "done" && task.due_date < today} />
          <PriorityBadge priority={task.priority} />
          {task.archived_at && <Badge tone="neutral">Archivada</Badge>}
        </div>
        {(task.deliverable_id || task.effective_campaign_id) && (
          <p className="mt-1 text-sm text-muted">
            {task.deliverable_id && <>Para el entregable <Link className="link" href={`/trabajo/entregables/${task.deliverable_id}`}>{task.deliverable_title}</Link></>}
            {task.deliverable_id && task.effective_campaign_id && " · "}
            {task.effective_campaign_id && <>Campaña <Link className="link" href={`/campanas/${task.effective_campaign_id}`}>{task.campaign_name}</Link></>}
          </p>
        )}
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <MaterialsSection target={{ type: "task", id }} />
          <Section title="Descripción y datos">
            {task.description && <p className="mb-3 text-sm break-words whitespace-pre-wrap">{task.description}</p>}
            <details open={!task.description}>
              <summary className="more">Editar la tarea</summary>
              <div className="mt-3">
                <ActionForm action={updateTaskAction} version={task.version} warnUnsaved submitLabel="Guardar cambios">
                  <input type="hidden" name="id" value={id} />
                  <TaskFields t={task} opts={opts} deliverables={deliverables} />
                </ActionForm>
              </div>
            </details>
          </Section>
        </div>
        <div className="min-w-0">
          <Comments type="task" id={id} comments={comments} user={user} />
          <Collapsed title="Historial" count={activity.length}><History type="task" activity={activity} people={opts.people} /></Collapsed>
          <ArchiveControls type="task" id={id} archivedAt={task.archived_at} isAdmin={user.role === "admin"} />
        </div>
      </div>
    </>
  );
}
