import { archiveAction, deleteAction } from "@/app/actions/work";
import { formatInstant } from "@/lib/dates";
import { ActionButton } from "./action-form";

const NOUN = { campaign: "la campaña", deliverable: "el entregable", task: "la tarea" } as const;

/** Archivar (cualquier miembro) y eliminar definitivamente (solo la propiedad del cliente, con confirmación). */
export function ArchiveControls({ type, id, archivedAt, isOwner }: {
  type: keyof typeof NOUN; id: string; archivedAt: Date | null; isOwner: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 px-1">
      {archivedAt ? (
        <>
          <span className="text-sm text-muted">Archivado el <span className="font-mono">{formatInstant(archivedAt)}</span>.</span>
          <ActionButton action={archiveAction} fields={{ type, id, archived: "0" }}>Recuperar del archivo</ActionButton>
        </>
      ) : (
        <ActionButton action={archiveAction} fields={{ type, id, archived: "1" }}
          confirm={`¿Archivar ${NOUN[type]}? Dejará de aparecer en las listas, pero se conserva con sus enlaces, comentarios e historial.`}>
          Archivar
        </ActionButton>
      )}
      {isOwner && (
        <ActionButton action={deleteAction} fields={{ type, id }} className="btn btn-danger btn-sm"
          confirm={`¿Eliminar definitivamente ${NOUN[type]}? Esta acción no se puede deshacer. Se borran sus comentarios y sus asociaciones con enlaces (los recursos siguen en Recursos). Si solo quieres retirarlo, usa «Archivar».`}>
          Eliminar definitivamente
        </ActionButton>
      )}
    </div>
  );
}
