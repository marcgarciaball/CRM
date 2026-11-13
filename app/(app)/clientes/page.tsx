import type { Metadata } from "next";
import Link from "next/link";
import { archiveClientAction, createClientAction } from "@/app/actions/clients";
import { ActionButton, ActionForm } from "@/components/action-form";
import { Empty, Field, PageHeader, Section } from "@/components/ui";
import { CLIENT_ROLE_LABEL } from "@/lib/labels";
import { load } from "@/lib/load";
import { clientPath } from "@/lib/paths";
import { listMyClients, type Client } from "@/lib/services/clients";

export const metadata: Metadata = { title: "Clientes" };

function ClientList({ clients, archived }: { clients: Client[]; archived?: boolean }) {
  return (
    <ul className="-my-1">
      {clients.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5 last:border-b-0">
          <div className="min-w-0 flex-1">
            <Link href={clientPath(c.id)} className="font-extrabold tracking-tight break-words uppercase hover:underline">{c.name}</Link>
            <span className="font-mono text-xs text-muted uppercase"> · {CLIENT_ROLE_LABEL[c.my_role]}</span>
            {c.description && <p className="text-[13px] break-words text-muted">{c.description}</p>}
          </div>
          {archived && c.my_role === "owner" && (
            <ActionButton action={archiveClientAction} fields={{ client_id: c.id, archived: "0" }}>Restaurar</ActionButton>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Clientes de la persona: los activos, crear uno nuevo y los archivados (la propiedad puede restaurarlos). */
export default async function ClientsPage() {
  const { active, archived } = await load(async (q) => ({
    active: await listMyClients(q),
    archived: await listMyClients(q, { archived: true }),
  }));
  return (
    <div className="max-w-3xl">
      <PageHeader title="Clientes" />
      <Section title="Activos" count={active.length}>
        {active.length === 0 ? <Empty>Todavía no perteneces a ningún cliente activo.</Empty> : <ClientList clients={active} />}
      </Section>
      <Section title="Nuevo cliente" id="nuevo">
        <ActionForm action={createClientAction} submitLabel="Crear cliente" pendingLabel="Creando…">
          <div className="grid gap-3">
            <Field label="Nombre" htmlFor="nc-name"><input id="nc-name" name="name" required maxLength={120} className="field" /></Field>
            <Field label="Descripción (opcional)" htmlFor="nc-description">
              <textarea id="nc-description" name="description" maxLength={2000} rows={3} className="field" />
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted">Serás su propiedad: podrás añadir a otras personas desde los ajustes del cliente.</p>
        </ActionForm>
      </Section>
      {archived.length > 0 && (
        <Section title="Archivados" count={archived.length}>
          <ClientList clients={archived} archived />
        </Section>
      )}
    </div>
  );
}
