import type { Metadata } from "next";
import {
  addMemberAction, archiveClientAction, removeMemberAction, resendInvitationAction, setMemberRoleAction, updateClientAction,
} from "@/app/actions/clients";
import { ActionButton, ActionForm, ActionSelect } from "@/components/action-form";
import { Badge, Field, PageHeader, Section, SelectField, options } from "@/components/ui";
import { CLIENT_ROLE_LABEL } from "@/lib/labels";
import { loadClient } from "@/lib/load";
import { listClientPeople, type ClientPerson } from "@/lib/services/clients";

export const metadata: Metadata = { title: "Ajustes del cliente" };
const ROLE_OPTIONS = options(CLIENT_ROLE_LABEL, ["member", "owner"]);

/**
 * Ajustes de un cliente. La propiedad edita sus datos y gestiona a sus personas; el resto ve quién forma parte
 * (sin emails) y puede salir. En un cliente archivado todo es de solo lectura, salvo restaurarlo (la propiedad).
 */
export default async function ClientSettingsPage({ params }: { params: Promise<{ client: string }> }) {
  const { client, user, people } = await loadClient((await params).client, async (q, _user, client) => ({
    people: await listClientPeople(q, client.id),
  }));
  const owner = client.my_role === "owner";
  const archived = !!client.archived_at;
  const manage = owner && !archived;
  const ids = { client_id: client.id };

  const status = (p: ClientPerson) => (
    <>
      {p.pending && <Badge tone="warn">Pendiente</Badge>}
      {!p.active && <Badge tone="outline">Sin acceso</Badge>}
    </>
  );

  return (
    <div className="max-w-4xl">
      <PageHeader title="Ajustes del cliente" eyebrow={client.name} />

      {manage ? (
        <Section title="Datos del cliente">
          <ActionForm action={updateClientAction} version={client.version} warnUnsaved>
            <input type="hidden" name="client_id" value={client.id} />
            <div className="grid gap-3">
              <Field label="Nombre" htmlFor="cl-name"><input id="cl-name" name="name" required maxLength={120} defaultValue={client.name} className="field" /></Field>
              <Field label="Descripción" htmlFor="cl-description">
                <textarea id="cl-description" name="description" maxLength={2000} rows={3} defaultValue={client.description} className="field" />
              </Field>
            </div>
          </ActionForm>
        </Section>
      ) : client.description ? (
        <Section title="Descripción"><p className="text-sm whitespace-pre-line break-words">{client.description}</p></Section>
      ) : null}

      <Section title="Personas" count={people.length}>
        {owner ? (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-ink font-mono text-[11px] tracking-wider text-muted uppercase">
                <tr><th className="px-1 py-2 font-medium">Nombre</th><th className="px-1 py-2 font-medium">Email</th><th className="px-1 py-2 font-medium">Rol</th><th className="px-1 py-2"><span className="sr-only">Acciones</span></th></tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const me = p.user_id === user.id;
                  return (
                    <tr key={p.user_id} className="border-t border-line align-middle">
                      <td className="px-1 py-2">
                        <span className="font-medium">{p.display_name}</span>{me && <span className="text-muted"> (tú)</span>}
                        <span className="ml-2 inline-flex gap-1">{status(p)}</span>
                      </td>
                      <td className="px-1 py-2 font-mono text-[13px] break-all">{p.email}</td>
                      <td className="px-1 py-2">
                        {manage ? (
                          <ActionSelect action={setMemberRoleAction} fields={{ ...ids, user_id: p.user_id }} name="role" value={p.role}
                            options={ROLE_OPTIONS} label={`Rol de ${p.display_name}`} />
                        ) : CLIENT_ROLE_LABEL[p.role]}
                      </td>
                      <td className="px-1 py-2">
                        {manage && (
                          <div className="flex flex-wrap justify-end gap-2">
                            {p.pending && (
                              <ActionButton action={resendInvitationAction} fields={{ ...ids, user_id: p.user_id }}>Reenviar invitación</ActionButton>
                            )}
                            <ActionButton action={removeMemberAction} fields={{ ...ids, user_id: p.user_id }}
                              confirm={me ? `¿Salir de ${client.name}? Dejarás de ver su trabajo.` : `¿Quitar a ${p.display_name} de ${client.name}? Su trabajo abierto quedará sin responsable.`}>
                              {me ? "Salir" : "Quitar"}
                            </ActionButton>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="-my-1">
            {people.map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center gap-2 border-b border-line py-2 text-sm last:border-b-0">
                <span className="font-medium">{p.display_name}</span>{p.user_id === user.id && <span className="text-muted">(tú)</span>}
                <span className="font-mono text-xs text-muted uppercase">· {CLIENT_ROLE_LABEL[p.role]}</span>
                {status(p)}
              </li>
            ))}
          </ul>
        )}
        {!owner && !archived && (
          <div className="mt-4">
            <ActionButton action={removeMemberAction} fields={{ ...ids, user_id: user.id }} confirm={`¿Salir de ${client.name}? Dejarás de ver su trabajo.`}>
              Salir de este cliente
            </ActionButton>
          </div>
        )}
      </Section>

      {manage && (
        <Section title="Añadir una persona">
          <ActionForm action={addMemberAction} submitLabel="Añadir" pendingLabel="Añadiendo…" resetOnSuccess>
            <input type="hidden" name="client_id" value={client.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Email" htmlFor="am-email"><input id="am-email" name="email" type="email" required maxLength={254} className="field" /></Field>
              <Field label="Nombre" htmlFor="am-name" hint="Solo si aún no tiene cuenta.">
                <input id="am-name" name="display_name" maxLength={80} className="field" />
              </Field>
              <SelectField id="am-role" label="Rol" name="role" options={ROLE_OPTIONS} value="member" />
            </div>
            <p className="mt-2 text-xs text-muted">Si ya tiene cuenta, tendrá acceso al momento. Si no, recibirá un email para elegir su contraseña.</p>
          </ActionForm>
        </Section>
      )}

      {owner && (
        <Section title={archived ? "Cliente archivado" : "Archivar el cliente"}>
          {archived ? (
            <p className="mb-3 text-sm text-muted">Su trabajo y sus personas se pueden consultar, pero no modificar.</p>
          ) : (
            <p className="mb-3 text-sm text-muted">Al archivarlo, su trabajo queda en solo lectura para todas sus personas y desaparece del inicio. Se puede restaurar.</p>
          )}
          <ActionButton action={archiveClientAction} fields={{ ...ids, archived: archived ? "0" : "1" }}
            confirm={archived ? undefined : `¿Archivar ${client.name}?`} className={archived ? "btn btn-primary btn-sm" : "btn btn-danger btn-sm"}>
            {archived ? "Restaurar" : "Archivar"}
          </ActionButton>
        </Section>
      )}
    </div>
  );
}
