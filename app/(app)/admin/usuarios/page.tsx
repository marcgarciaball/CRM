import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminUpdateUserAction, inviteUserAction } from "@/app/actions/account";
import { ActionForm } from "@/components/action-form";
import { Field, PageHeader, Section, SelectField, options } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/labels";
import { load } from "@/lib/load";
import type { Profile } from "@/lib/services/core";

export const metadata: Metadata = { title: "Administración" };

export default async function UsersPage() {
  const { people, user } = await load(async (q) => ({ // TODO(Task 5): todos los perfiles (administración de plataforma los ve todos por RLS).
    people: await q<Profile>("select id, display_name, role, active from profiles order by display_name limit 100"),
  }));
  if (user.role !== "admin") redirect("/");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Personas y accesos" eyebrow="Administración" />
      <Section title="Invitar a una persona">
        <ActionForm action={inviteUserAction} submitLabel="Enviar invitación" pendingLabel="Enviando…" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Email" htmlFor="i-email"><input id="i-email" name="email" type="email" required maxLength={254} className="field" /></Field>
            <Field label="Nombre" htmlFor="i-name"><input id="i-name" name="display_name" required maxLength={80} className="field" /></Field>
            <SelectField id="i-role" label="Rol" name="role" options={options(ROLE_LABEL, ["member", "admin"])} value="member" />
          </div>
          <p className="mt-2 text-xs text-muted">Recibirá un email para elegir su propia contraseña. El registro público está desactivado.</p>
        </ActionForm>
      </Section>
      <Section title="Equipo" count={people.length}>
        <ul className="space-y-3">
          {people.map((p) => (
            <li key={p.id} className="border border-line p-3">
              <ActionForm action={adminUpdateUserAction} submitLabel="Guardar" submitClassName="btn btn-secondary btn-sm">
                <input type="hidden" name="id" value={p.id} />
                <div className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto]">
                  <Field label="Nombre" htmlFor={`n-${p.id}`}><input id={`n-${p.id}`} name="display_name" required maxLength={80} defaultValue={p.display_name} className="field" /></Field>
                  <SelectField id={`r-${p.id}`} label="Rol" name="role" options={options(ROLE_LABEL, ["member", "admin"])} value={p.role} />
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={p.active} /> Con acceso{p.id === user.id && " (tú)"}
                  </label>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Quitar el acceso conserva todo el trabajo de la persona. Siempre debe quedar al menos una persona administradora.</p>
      </Section>
    </div>
  );
}
