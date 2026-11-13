import type { Metadata } from "next";
import Link from "next/link";
import { createTaskAction } from "@/app/actions/work";
import { ActionForm } from "@/components/action-form";
import { TaskFields } from "@/components/forms";
import { PageHeader } from "@/components/ui";
import { formOptions, loadClient } from "@/lib/load";
import { clientPath } from "@/lib/paths";
import { redirect } from "next/navigation";
import { uuidParam, type SearchParams } from "@/lib/params";
import { deliverableOptions } from "@/lib/services/deliverables";

export const metadata: Metadata = { title: "Nueva tarea" };

export default async function NewTaskPage({ params, searchParams }: { params: Promise<{ client: string }>; searchParams: SearchParams }) {
  const sp = await searchParams;
  const { opts, deliverables, user, client } = await loadClient((await params).client, async (q, _user, client) => ({
    opts: await formOptions(q, client.id), deliverables: await deliverableOptions(q, client.id),
  }));
  // En un cliente archivado no se crea nada.
  if (client.archived_at) redirect(clientPath(client.id, "trabajo"));
  const deliverable = uuidParam(sp.entregable);
  return (
    <div className="max-w-2xl">
      <PageHeader title="Nueva tarea" eyebrow="Trabajo" />
      <div className="border-t-2 border-ink pt-4">
        <ActionForm action={createTaskAction} submitLabel="Crear tarea" pendingLabel="Creando…" warnUnsaved
          secondary={<Link href={clientPath(client.id, "trabajo")} className="btn btn-ghost">Cancelar</Link>}>
          <TaskFields clientId={client.id} opts={opts} deliverables={deliverables}
            defaults={{ deliverable_id: deliverable, campaign_id: deliverable ? undefined : uuidParam(sp.campana), assignee_id: user.id }} />
        </ActionForm>
      </div>
    </div>
  );
}
