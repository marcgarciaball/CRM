import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { markUpdatedAction, updateResourceAction } from "@/app/actions/materials";
import { deleteAction } from "@/app/actions/work";
import { ActionButton, ActionForm } from "@/components/action-form";
import { UsageList } from "@/components/materials";
import { ExternalLink, Field, PageHeader, Section, SelectField, options } from "@/components/ui";
import { formatInstant } from "@/lib/dates";
import { isUuid } from "@/lib/form";
import { CATEGORIES, CATEGORY_LABEL, personName } from "@/lib/labels";
import { loadClient } from "@/lib/load";
import { clientPath } from "@/lib/paths";
import { getResource, resourceImpact, usagesFor } from "@/lib/services/resources";

export const metadata: Metadata = { title: "Recurso" };

export default async function ResourcePage({ params }: { params: Promise<{ client: string; id: string }> }) {
  const { client: clientParam, id } = await params;
  if (!isUuid(id)) notFound();
  const { r, usages, impact, client } = await loadClient(clientParam, async (q) => ({
    r: await getResource(q, id), usages: await usagesFor(q, [id]), impact: await resourceImpact(q, id),
  }));
  // Un recurso de otro cliente no existe en este.
  if (!r || r.client_id !== client.id) notFound();
  const readOnly = !!client.archived_at;
  return (
    <div className="max-w-2xl">
      <PageHeader title={r.title} eyebrow={<Link href={clientPath(client.id, "recursos")} className="hover:underline">Recursos</Link>}>
        <p className="mt-1 text-sm break-all"><ExternalLink href={r.url}>{r.url}</ExternalLink></p>
        <p className="mt-1 text-xs text-muted">
          Añadido por {personName(r.created_by, r.created_by_name, "alguien")} el <span className="font-mono">{formatInstant(r.created_at)}</span>
          {r.content_updated_at && <> · Material actualizado el <span className="font-mono">{formatInstant(r.content_updated_at)}</span></>}
        </p>
      </PageHeader>
      <div role="note" className="mb-4 border border-ink bg-st-warn-bg p-3 text-sm text-st-warn-fg">
        {impact.uses > 1
          ? <p className="font-medium">Recurso compartido: se usa en {impact.uses} registros. Lo que cambies aquí cambia en todos.</p>
          : <p className="font-medium">{impact.uses === 1 ? "Este recurso se usa en 1 registro." : "Recurso general: no está asociado a ningún registro."}</p>}
        {usages.length > 0 && <p className="mt-1"><UsageList usages={usages} clientId={client.id} /></p>}
        {impact.approvals.length > 0 && (
          <p className="mt-1">
            Si cambias la URL o lo marcas como actualizado, {impact.approvals.length === 1 ? "este entregable aprobado volverá" : `estos ${impact.approvals.length} entregables aprobados volverán`} a revisión:{" "}
            {impact.approvals.map((a) => `«${a.title}»`).join(", ")}.
          </p>
        )}
      </div>
      {!readOnly && <>
      <Section title="Editar recurso">
        <ActionForm action={updateResourceAction} version={r.version} warnUnsaved>
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Título" htmlFor="f-title"><input id="f-title" name="title" required maxLength={200} defaultValue={r.title} className="field" /></Field></div>
            <div className="sm:col-span-2"><Field label="URL" htmlFor="f-url"><input id="f-url" name="url" type="url" required maxLength={2048} defaultValue={r.url} className="field" /></Field></div>
            <SelectField label="Categoría" name="category" options={options(CATEGORY_LABEL, CATEGORIES)} value={r.category} />
            <Field label="Descripción breve" htmlFor="f-description"><input id="f-description" name="description" maxLength={1000} defaultValue={r.description} className="field" /></Field>
          </div>
        </ActionForm>
      </Section>
      <Section title="El contenido ha cambiado, pero la URL no">
        <p className="mb-3 text-sm text-muted">
          La herramienta no puede saber si alguien ha editado el archivo en Figma o Drive: que la URL sea la misma no significa que el contenido lo sea.
          Si ha cambiado, regístralo aquí.
        </p>
        <ActionButton action={markUpdatedAction} fields={{ resource_id: id }} className="btn btn-secondary"
          confirm={`Se registrará que el contenido ha cambiado.${impact.approvals.length > 0 ? ` ${impact.approvals.length} entregable(s) aprobado(s) volverán a revisión.` : ""} ¿Continuar?`}>
          Marcar material actualizado
        </ActionButton>
      </Section>
      {client.my_role === "owner" && (
        <ActionButton action={deleteAction} fields={{ type: "resource", id }} className="btn btn-danger btn-sm"
          confirm={`¿Eliminar definitivamente este recurso? Desaparecerá de sus ${impact.uses} uso(s) y no se puede deshacer.`}>
          Eliminar definitivamente
        </ActionButton>
      )}
      </>}
    </div>
  );
}
