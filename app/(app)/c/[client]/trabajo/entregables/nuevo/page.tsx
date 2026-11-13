import type { Metadata } from "next";
import Link from "next/link";
import { createDeliverableAction } from "@/app/actions/work";
import { ActionForm } from "@/components/action-form";
import { DeliverableFields } from "@/components/forms";
import { PageHeader } from "@/components/ui";
import { isLocalDate } from "@/lib/dates";
import { formOptions, loadClient } from "@/lib/load";
import { clientPath } from "@/lib/paths";
import { redirect } from "next/navigation";
import { one, uuidParam, type SearchParams } from "@/lib/params";

export const metadata: Metadata = { title: "Nuevo entregable" };

export default async function NewDeliverablePage({ params, searchParams }: { params: Promise<{ client: string }>; searchParams: SearchParams }) {
  const sp = await searchParams;
  const { opts, user, client } = await loadClient((await params).client, async (q, _user, client) => ({ opts: await formOptions(q, client.id) }));
  // En un cliente archivado no se crea nada.
  if (client.archived_at) redirect(`${clientPath(client.id, "trabajo")}?tab=entregables`);
  const date = one(sp.fecha);
  return (
    <div className="max-w-2xl">
      <PageHeader title="Nuevo entregable" eyebrow="Trabajo" />
      <div className="border-t-2 border-ink pt-4">
        <ActionForm action={createDeliverableAction} submitLabel="Crear entregable" pendingLabel="Creando…" warnUnsaved
          secondary={<Link href={`${clientPath(client.id, "trabajo")}?tab=entregables`} className="btn btn-ghost">Cancelar</Link>}>
          <DeliverableFields clientId={client.id} opts={opts} defaults={{ campaign_id: uuidParam(sp.campana), planned_date: isLocalDate(date) ? date : undefined, owner_id: user.id }} />
          <p className="mt-3 text-xs text-muted">Después podrás añadir el brief, el copy, los enlaces y las tareas.</p>
        </ActionForm>
      </div>
    </div>
  );
}
