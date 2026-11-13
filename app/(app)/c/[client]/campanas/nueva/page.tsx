import type { Metadata } from "next";
import Link from "next/link";
import { createCampaignAction } from "@/app/actions/work";
import { ActionForm } from "@/components/action-form";
import { CampaignFields } from "@/components/forms";
import { TemplateFields } from "@/components/template-fields";
import { PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import { loadClient } from "@/lib/load";
import { clientPath } from "@/lib/paths";
import { listProfiles } from "@/lib/services/core";
import { NEWSLETTER_TEMPLATE_TASKS } from "@/lib/services/campaigns";

export const metadata: Metadata = { title: "Nueva campaña" };

export default async function NewCampaignPage({ params }: { params: Promise<{ client: string }> }) {
  const { people, user, client } = await loadClient((await params).client, async (q, _user, client) => ({ people: await listProfiles(q, client.id) }));
  // En un cliente archivado no se crea nada.
  if (client.archived_at) redirect(clientPath(client.id, "campanas"));
  // La sugerencia de persona solo se preselecciona si hay alguien con ese nombre en el cliente.
  const byName = (name: string) => people.find((p) => p.display_name.trim().toLowerCase().startsWith(name.toLowerCase()))?.id ?? null;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nueva campaña" eyebrow="Campañas" />
      <div className="border-t-2 border-ink pt-4">
        <ActionForm action={createCampaignAction} submitLabel="Crear campaña" pendingLabel="Creando…" warnUnsaved
          secondary={<Link href={clientPath(client.id, "campanas")} className="btn btn-ghost">Cancelar</Link>}>
          <CampaignFields clientId={client.id} people={people} defaultOwner={user.id} />
          <TemplateFields
            people={people.map((p) => ({ id: p.id, label: p.display_name }))}
            defaultOwner={byName("Elisa") ?? undefined}
            tasks={NEWSLETTER_TEMPLATE_TASKS.map((t) => ({ key: t.key, title: t.title, suggestedAssignee: t.suggestedAssignee, suggestedAssigneeId: byName(t.suggestedAssignee) }))} />
        </ActionForm>
      </div>
    </div>
  );
}
