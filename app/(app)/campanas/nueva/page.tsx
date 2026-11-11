import type { Metadata } from "next";
import Link from "next/link";
import { createCampaignAction } from "@/app/actions/work";
import { ActionForm } from "@/components/action-form";
import { CampaignFields } from "@/components/forms";
import { TemplateFields } from "@/components/template-fields";
import { PageHeader } from "@/components/ui";
import { firstClientPeople, load } from "@/lib/load";
import { NEWSLETTER_TEMPLATE_TASKS } from "@/lib/services/campaigns";

export const metadata: Metadata = { title: "Nueva campaña" };

export default async function NewCampaignPage() {
  const { people, user } = await load(async (q) => ({ people: await firstClientPeople(q) })); // TODO(Task 5)
  // La sugerencia de persona solo se preselecciona si hay alguien con ese nombre en el equipo.
  const byName = (name: string) => people.find((p) => p.display_name.trim().toLowerCase().startsWith(name.toLowerCase()))?.id ?? null;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nueva campaña" eyebrow="Campañas" />
      <div className="card p-4">
        <ActionForm action={createCampaignAction} submitLabel="Crear campaña" pendingLabel="Creando…" warnUnsaved
          secondary={<Link href="/campanas" className="btn btn-ghost">Cancelar</Link>}>
          <CampaignFields people={people} defaultOwner={user.id} />
          <TemplateFields
            people={people.map((p) => ({ id: p.id, label: p.display_name }))}
            defaultOwner={byName("Elisa") ?? undefined}
            tasks={NEWSLETTER_TEMPLATE_TASKS.map((t) => ({ key: t.key, title: t.title, suggestedAssignee: t.suggestedAssignee, suggestedAssigneeId: byName(t.suggestedAssignee) }))} />
        </ActionForm>
      </div>
    </div>
  );
}
