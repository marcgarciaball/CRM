import type { Metadata } from "next";
import Link from "next/link";
import { createTaskAction } from "@/app/actions/work";
import { ActionForm } from "@/components/action-form";
import { TaskFields } from "@/components/forms";
import { PageHeader } from "@/components/ui";
import { firstClientId, formOptions, load } from "@/lib/load";
import { uuidParam, type SearchParams } from "@/lib/params";
import { deliverableOptions } from "@/lib/services/deliverables";

export const metadata: Metadata = { title: "Nueva tarea" };

export default async function NewTaskPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { opts, deliverables, user } = await load(async (q) => {
    const clientId = await firstClientId(q); // TODO(Task 5)
    return { opts: await formOptions(q), deliverables: clientId ? await deliverableOptions(q, clientId) : [] };
  });
  const deliverable = uuidParam(sp.entregable);
  return (
    <div className="max-w-2xl">
      <PageHeader title="Nueva tarea" eyebrow="Trabajo" />
      <div className="card p-4">
        <ActionForm action={createTaskAction} submitLabel="Crear tarea" pendingLabel="Creando…" warnUnsaved
          secondary={<Link href="/trabajo" className="btn btn-ghost">Cancelar</Link>}>
          <TaskFields opts={opts} deliverables={deliverables}
            defaults={{ deliverable_id: deliverable, campaign_id: deliverable ? undefined : uuidParam(sp.campana), assignee_id: user.id }} />
        </ActionForm>
      </div>
    </div>
  );
}
