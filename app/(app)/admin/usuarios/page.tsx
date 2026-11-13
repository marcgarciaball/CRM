import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminUpdateUserAction } from "@/app/actions/account";
import { ActionForm } from "@/components/action-form";
import { Field, PageHeader, Section, SelectField, options } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/labels";
import { load } from "@/lib/load";
import type { Profile } from "@/lib/services/core";

export const metadata: Metadata = { title: "Administración" };

export default async function UsersPage() {
  // Solo administración de plataforma. Ve todos los perfiles (RLS) y nada de los clientes: ni nombres, ni membresías, ni recuentos.
  const { people, user } = await load(async (q) => ({
    people: await q<Profile>("select id, display_name, role, active from profiles order by display_name limit 100"),
  }));
  if (user.role !== "admin") redirect("/");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Personas y accesos" eyebrow="Administración de plataforma" />
      <Section title="Personas" count={people.length}>
        <ul className="-mt-3">
          {people.map((p) => (
            <li key={p.id} className="border-b border-line py-3">
              <ActionForm action={adminUpdateUserAction} submitLabel="Guardar" submitClassName="btn btn-secondary btn-sm">
                <input type="hidden" name="id" value={p.id} />
                <div className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto]">
                  <Field label="Nombre" htmlFor={`n-${p.id}`}><input id={`n-${p.id}`} name="display_name" required maxLength={80} defaultValue={p.display_name} className="field" /></Field>
                  <SelectField id={`r-${p.id}`} label="Rol en la plataforma" name="role" options={options(ROLE_LABEL, ["member", "admin"])} value={p.role} />
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={p.active} /> Con acceso{p.id === user.id && " (tú)"}
                  </label>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Quitar el acceso conserva todo el trabajo de la persona. Siempre debe quedar al menos una administración de plataforma activa. No se puede quitar el acceso a quien es la única Propiedad de un cliente: la base de datos lo rechaza y lo indica aquí.</p>
      </Section>
    </div>
  );
}
