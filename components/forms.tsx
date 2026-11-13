import { CAMPAIGN_STATUS_LABEL, CHANNEL_LABEL, PRIORITY_LABEL, TASK_STATUS_LABEL, CHANNELS, PRIORITIES, personName } from "@/lib/labels";
import type { Campaign } from "@/lib/services/campaigns";
import type { Profile } from "@/lib/services/core";
import type { Deliverable } from "@/lib/services/deliverables";
import type { Task } from "@/lib/services/tasks";
import { Field, SelectField, options } from "./ui";

export type FormOptions = { people: Profile[]; campaigns: { id: string; name: string }[] };
/** Personas del cliente; si quien figura ya no está entre ellas, se añade con su nombre (o «Antiguo miembro»). */
const peopleOptions = (people: Profile[], current?: { id: string | null; name: string | null }) => {
  const list = people.map((p) => ({ id: p.id, label: p.display_name }));
  return current?.id && !list.some((p) => p.id === current.id) ? [...list, { id: current.id, label: personName(current.id, current.name, "") }] : list;
};
/** Todo formulario de creación o edición indica el cliente en el que se está. */
const ClientField = ({ clientId }: { clientId: string }) => <input type="hidden" name="client_id" value={clientId} />;
const campaignOptions = (campaigns: FormOptions["campaigns"]) => campaigns.map((c) => ({ id: c.id, label: c.name }));

export function CampaignFields({ clientId, c, people, defaultOwner }: { clientId: string; c?: Campaign; people: Profile[]; defaultOwner?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ClientField clientId={clientId} />
      <div className="sm:col-span-2">
        <Field label="Nombre" htmlFor="f-name"><input id="f-name" name="name" required maxLength={160} defaultValue={c?.name} className="field" /></Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Objetivo" htmlFor="f-objective" hint="Qué se quiere conseguir, en una frase.">
          <input id="f-objective" name="objective" maxLength={2000} defaultValue={c?.objective} className="field" />
        </Field>
      </div>
      <Field label="Inicio" htmlFor="f-start"><input id="f-start" name="start_date" type="date" defaultValue={c?.start_date ?? ""} className="field" /></Field>
      <Field label="Fin" htmlFor="f-end"><input id="f-end" name="end_date" type="date" defaultValue={c?.end_date ?? ""} className="field" /></Field>
      <SelectField label="Responsable" name="owner_id" options={peopleOptions(people, c && { id: c.owner_id, name: c.owner_name })} value={c ? c.owner_id : defaultOwner} empty="Sin responsable" />
      {c && <SelectField label="Estado" name="status" options={options(CAMPAIGN_STATUS_LABEL)} value={c.status} />}
      {c && (
        <div className="sm:col-span-2">
          <Field label="Descripción" htmlFor="f-description">
            <textarea id="f-description" name="description" rows={4} maxLength={10000} defaultValue={c.description} className="field" />
          </Field>
        </div>
      )}
    </div>
  );
}

/** Campos esenciales de un entregable (creación y edición). */
export function DeliverableFields({ clientId, d, opts, defaults }: {
  clientId: string; d?: Deliverable; opts: FormOptions; defaults?: { campaign_id?: string; planned_date?: string; owner_id?: string };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ClientField clientId={clientId} />
      <div className="sm:col-span-2">
        <Field label="Título" htmlFor="f-title">
          <input id="f-title" name="title" required maxLength={200} defaultValue={d?.title} className="field" placeholder="Ej.: Newsletter regalos de boda" />
        </Field>
      </div>
      <SelectField label="Canal" name="channel" options={options(CHANNEL_LABEL, CHANNELS)} value={d?.channel ?? "newsletter"} required />
      <Field label="Fecha prevista de publicación" htmlFor="f-planned" hint={d ? "Cambiarla lo mueve de mes; no se pierde nada." : "Opcional: sin fecha queda en «Sin planificar»."}>
        <input id="f-planned" name="planned_date" type="date" defaultValue={d ? d.planned_date ?? "" : defaults?.planned_date ?? ""} className="field" />
      </Field>
      <SelectField label="Responsable" name="owner_id" options={peopleOptions(opts.people, d && { id: d.owner_id, name: d.owner_name })} value={d ? d.owner_id : defaults?.owner_id} empty="Sin responsable" />
      <SelectField label="Campaña" name="campaign_id" options={campaignOptions(opts.campaigns)} value={d ? d.campaign_id : defaults?.campaign_id} empty="Sin campaña" />
      <div className="sm:col-span-2">
        <Field label="Formatos necesarios" htmlFor="f-formats" hint="Opcional. Ej.: 1080×1350, Story 9:16, banner 1200×628.">
          <input id="f-formats" name="formats" maxLength={300} defaultValue={d?.formats} className="field" />
        </Field>
      </div>
    </div>
  );
}

/** Campos de una tarea. La campaña se hereda del entregable cuando la tarea cuelga de uno. */
export function TaskFields({ clientId, t, opts, deliverables, defaults }: {
  clientId: string; t?: Task; opts: FormOptions; deliverables: { id: string; title: string }[];
  defaults?: { campaign_id?: string; deliverable_id?: string; assignee_id?: string; due_date?: string };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ClientField clientId={clientId} />
      <div className="sm:col-span-2">
        <Field label="Título" htmlFor="f-title">
          <input id="f-title" name="title" required maxLength={200} defaultValue={t?.title} className="field" placeholder="Ej.: Redactar el copy" />
        </Field>
      </div>
      <SelectField label="Asignada a" name="assignee_id" options={peopleOptions(opts.people, t && { id: t.assignee_id, name: t.assignee_name })} value={t ? t.assignee_id : defaults?.assignee_id} empty="Sin asignar" />
      <Field label="Fecha límite" htmlFor="f-due" hint="Es la fecha de la tarea, no la de publicación.">
        <input id="f-due" name="due_date" type="date" defaultValue={t ? t.due_date ?? "" : defaults?.due_date ?? ""} className="field" />
      </Field>
      <SelectField label="Prioridad" name="priority" options={options(PRIORITY_LABEL, PRIORITIES)} value={t?.priority ?? "medium"} />
      {t && <SelectField label="Estado" name="status" options={options(TASK_STATUS_LABEL)} value={t.status} />}
      <SelectField label="Entregable" name="deliverable_id" options={deliverables.map((d) => ({ id: d.id, label: d.title }))}
        value={t ? t.deliverable_id : defaults?.deliverable_id} empty="Ninguno" />
      <div>
        <SelectField label="Campaña" name="campaign_id" options={campaignOptions(opts.campaigns)} value={t ? t.campaign_id : defaults?.campaign_id} empty="Sin campaña" />
        <p className="mt-1 text-xs text-muted">Si eliges un entregable, la tarea usa la campaña de ese entregable.</p>
      </div>
      {t && (
        <div className="sm:col-span-2">
          <Field label="Descripción" htmlFor="f-description">
            <textarea id="f-description" name="description" rows={4} maxLength={10000} defaultValue={t.description} className="field" />
          </Field>
        </div>
      )}
    </div>
  );
}
