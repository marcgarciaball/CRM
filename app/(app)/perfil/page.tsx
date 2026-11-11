import type { Metadata } from "next";
import { updateOwnNameAction } from "@/app/actions/account";
import { ActionForm } from "@/components/action-form";
import { Field, PageHeader, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="max-w-md">
      <PageHeader title="Perfil" />
      <Section title="Tu nombre">
        <ActionForm action={updateOwnNameAction}>
          <Field label="Nombre visible para el equipo" htmlFor="f-name">
            <input id="f-name" name="display_name" required maxLength={80} defaultValue={user.display_name} className="field" />
          </Field>
        </ActionForm>
        <p className="mt-4 text-sm text-muted">Rol: {ROLE_LABEL[user.role]}. Solo administración puede cambiar roles.</p>
      </Section>
    </div>
  );
}
