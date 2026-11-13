import { addCommentAction, deleteCommentAction } from "@/app/actions/work";
import { formatDate, formatInstant } from "@/lib/dates";
import { DELIVERABLE_STATUS_LABEL, FORMER_MEMBER, TASK_STATUS_LABEL, personName } from "@/lib/labels";
import type { Activity, Comment, EntityType, Profile } from "@/lib/services/core";
import { ActionButton, ActionForm } from "./action-form";
import { Empty, Section } from "./ui";

/** `isOwner`: la propiedad del cliente puede borrar cualquier comentario; `readOnly` (cliente archivado): sin borrar ni comentar. */
export function Comments({ type, id, comments, user, isOwner, readOnly = false }: {
  type: EntityType; id: string; comments: Comment[]; user: Profile; isOwner: boolean; readOnly?: boolean;
}) {
  return (
    <Section id="comentarios" title="Comentarios" count={comments.length}>
      {comments.length === 0 ? <Empty>Sin comentarios todavía.</Empty> : (
        <ul className="mb-3">
          {comments.map((c) => (
            <li key={c.id} className="border-b border-line py-2.5 first:pt-0">
              <p className="text-xs text-muted">
                <span className="font-semibold text-ink">{personName(c.created_by, c.author_name, "Alguien")}</span> · <span className="font-mono">{formatInstant(c.created_at)}</span>
              </p>
              <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.body}</p>
              {!readOnly && (c.created_by === user.id || isOwner) && (
                <ActionButton action={deleteCommentAction} fields={{ id: c.id }} confirm="¿Borrar este comentario?" className="mt-1 text-xs text-muted underline">
                  Borrar
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <ActionForm action={addCommentAction} submitLabel="Comentar" pendingLabel="Enviando…" resetOnSuccess>
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="id" value={id} />
          <label className="label" htmlFor={`comment-${id}`}>Nuevo comentario</label>
          <textarea id={`comment-${id}`} name="body" required maxLength={5000} rows={3} className="field" />
        </ActionForm>
      )}
    </Section>
  );
}

const MATERIAL_REASON: Record<string, string> = {
  material_added: "se añadió el material con aprobación",
  material_removed: "se quitó el material con aprobación",
  material_approval_flag: "cambió si requiere aprobación el material",
  material_url_changed: "cambió la URL del material",
  material_marked_updated: "se marcó como actualizado el material",
};

const CREATIVE_REASON: Record<string, string> = {
  asset_added: "se subió a la creatividad final el archivo",
  asset_removed: "se quitó de la creatividad final el archivo",
};

function describe(a: Pick<Activity, "action" | "detail"> & Partial<Activity>, type: EntityType, people: Map<string, string>): string {
  const d = a.detail;
  const status = (s: unknown) => (type === "task" ? TASK_STATUS_LABEL : DELIVERABLE_STATUS_LABEL)[s as never] ?? String(s);
  // Sin lista de personas (novedades) no se sabe quién es; con ella, quien no está es un antiguo miembro.
  const person = (v: unknown) => (v ? people.get(String(v)) ?? (people.size > 0 ? FORMER_MEMBER.toLowerCase() : "otra persona") : "nadie");
  const date = (v: unknown) => (v ? formatDate(String(v)) : "sin fecha");
  switch (a.action) {
    case "created": return "creó el registro";
    case "status": return `cambió el estado: ${status(d.from)} → ${status(d.to)}${d.revision ? ` (revisión ${d.revision})` : ""}`;
    case "copy_changed": return `cambió el copy (revisión ${d.revision})`;
    case "material_changed": return `nueva revisión: ${MATERIAL_REASON[String(d.reason)] ?? "cambió un material"} «${d.resource}»`;
    case "creative_changed": return `nueva revisión: ${CREATIVE_REASON[String(d.reason)] ?? "cambió la creatividad final"} «${d.file}»`;
    case "planned_date": return `cambió la fecha prevista: ${date(d.from)} → ${date(d.to)}`;
    case "due_date": return `cambió la fecha límite: ${date(d.from)} → ${date(d.to)}`;
    case "owner": case "assignee": return `cambió la persona responsable: ${person(d.from)} → ${person(d.to)}`;
    case "campaign": return "cambió la campaña";
    case "archived": return "archivó el registro";
    case "restored": return "recuperó el registro del archivo";
    default: return a.action;
  }
}

export { describe as describeActivity };

/** `people`: todas las personas del cliente, también las desactivadas; quien no esté es un antiguo miembro. */
export function History({ type, activity, people }: { type: EntityType; activity: Activity[]; people: Profile[] }) {
  const names = new Map(people.map((p) => [p.id, p.display_name]));
  if (activity.length === 0) return <Empty>Sin cambios registrados.</Empty>;
  return (
    <ol className="space-y-1.5 text-sm">
      {activity.map((a) => (
        <li key={a.id}>
          <span className="font-mono text-xs text-muted">{formatInstant(a.created_at)} · </span>
          <span className="font-medium">{personName(a.actor_id, a.actor_name, "Sistema")}</span> {describe(a, type, names)}
        </li>
      ))}
    </ol>
  );
}
