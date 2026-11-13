import Link from "next/link";
import { markUpdatedAction, setLinkFlagAction, unlinkAction } from "@/app/actions/materials";
import { requireUser } from "@/lib/auth";
import { formatInstant } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { CATEGORY_LABEL } from "@/lib/labels";
import { campaignPath, deliverablePath, resourcePath, taskPath } from "@/lib/paths";
import { getContextualMaterials, listResources, type Material, type Target, type Usage } from "@/lib/services/resources";
import { ActionButton } from "./action-form";
import { AddLinkForm } from "./add-link-form";
import { Badge, ExternalLink, Section } from "./ui";

const USAGE_PATH = { campaign: campaignPath, deliverable: deliverablePath, task: taskPath } as const;
const USAGE_LABEL = { campaign: "Campaña", deliverable: "Entregable", task: "Tarea" } as const;

/** Registros que usan un recurso; todos son del cliente del recurso (`clientId`). */
export function UsageList({ usages, clientId, exclude }: { usages: Usage[]; clientId: string; exclude?: Target }) {
  const others = usages.filter((u) => !(exclude && u.type === exclude.type && u.id === exclude.id));
  if (others.length === 0) return null;
  return (
    <span>
      {exclude ? "También en: " : "Se usa en: "}
      {others.map((u, i) => (
        <span key={`${u.type}-${u.id}`}>
          {i > 0 && ", "}
          <Link href={USAGE_PATH[u.type]({ client_id: clientId, id: u.id })} className="link">{USAGE_LABEL[u.type]} «{u.label}»</Link>
        </span>
      ))}
    </span>
  );
}

/** Enlace compacto (listas y calendario). */
export function MaterialChip({ m }: { m: Pick<Material, "title" | "url" | "category" | "is_primary"> }) {
  return (
    <ExternalLink href={m.url} className={`inline-flex max-w-56 items-center gap-1.5 border border-ink px-2 py-0.5 text-xs ${m.is_primary ? "bg-accent text-accent-ink hover:bg-ink hover:text-white" : "bg-surface text-ink hover:bg-subtle"}`}>
      <span className={`font-mono text-[10px] font-medium uppercase ${m.is_primary ? "" : "text-muted"}`}>{CATEGORY_LABEL[m.category]}</span>
      <span className="truncate">{m.title}</span>
    </ExternalLink>
  );
}

function MaterialRow({ m, target, clientId, usages, editable }: { m: Material; target: Target; clientId: string; usages: Usage[]; editable: boolean }) {
  const mine = usages.filter((u) => u.resource_id === m.resource_id);
  const shared = mine.length > 1;
  return (
    <li className="border-b border-line py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <ExternalLink href={m.url} className="link font-medium break-all">{m.title}</ExternalLink>
        <Badge tone="outline">{CATEGORY_LABEL[m.category]}</Badge>
        {editable && m.is_primary && <Badge tone="warn">Principal</Badge>}
        {editable && m.requires_approval && <Badge tone="info">Requiere aprobación</Badge>}
        {editable && (
          <details className="ml-auto">
            <summary className="more" aria-label={`Opciones de «${m.title}»`}>Opciones</summary>
            <div className="mt-2 flex w-full flex-wrap items-start gap-2">
              <ActionButton action={setLinkFlagAction} fields={{ link_id: m.link_id, flag: "is_primary", value: m.is_primary ? "0" : "1" }}>
                {m.is_primary ? "Dejar como referencia" : "Fijar como principal"}
              </ActionButton>
              {target.type === "deliverable" && (
                <ActionButton action={setLinkFlagAction} fields={{ link_id: m.link_id, flag: "requires_approval", value: m.requires_approval ? "0" : "1" }}
                  confirm="Cambiar si este material requiere aprobación crea una nueva revisión: si el entregable estaba aprobado, volverá a revisión. ¿Continuar?">
                  {m.requires_approval ? "No requiere aprobación" : "Requiere aprobación"}
                </ActionButton>
              )}
              <ActionButton action={markUpdatedAction} fields={{ resource_id: m.resource_id }}
                confirm={`Se registrará que el contenido de «${m.title}» ha cambiado${shared ? ` en sus ${mine.length} usos` : ""}. Todos los entregables aprobados que lo usan como material con aprobación volverán a revisión. ¿Continuar?`}>
                Marcar material actualizado
              </ActionButton>
              <Link href={resourcePath({ client_id: clientId, id: m.resource_id })} className="btn btn-secondary btn-sm">Editar{shared ? " (compartido)" : ""}</Link>
              <ActionButton action={unlinkAction} fields={{ link_id: m.link_id }} className="btn btn-danger btn-sm"
                confirm={`Se quitará «${m.title}» solo de aquí. El recurso seguirá en Recursos${shared ? " y en sus otros usos" : ""}.${m.requires_approval ? " Al ser un material con aprobación, el entregable volverá a revisión." : ""} ¿Continuar?`}>
                Quitar de aquí
              </ActionButton>
            </div>
          </details>
        )}
      </div>
      {m.description && <p className="mt-0.5 text-sm text-muted">{m.description}</p>}
      {(mine.length > (editable ? 1 : 0) || m.content_updated_at) && (
        <p className="mt-0.5 text-xs text-muted">
          {m.content_updated_at && <>Actualizado el <span className="font-mono">{formatInstant(m.content_updated_at)}</span>. </>}
          <UsageList usages={mine} clientId={clientId} exclude={editable ? target : undefined} />
        </p>
      )}
    </li>
  );
}

/**
 * "Enlaces y materiales" de un registro: primero los propios; después, sin copiarlos,
 * los del entregable del que cuelga (tareas) y los de su campaña. `clientId` es el cliente del registro;
 * `readOnly` (cliente archivado) quita las opciones y el formulario para añadir.
 */
export async function MaterialsSection({ target, clientId, readOnly = false }: { target: Target; clientId: string; readOnly?: boolean }) {
  const user = await requireUser();
  const { ctx, library } = await withUser(user.id, async (q) => ({
    ctx: await getContextualMaterials(q, target),
    library: readOnly ? [] : await listResources(q, { client: clientId }),
  }));
  const own = new Set(ctx.own.map((m) => m.resource_id));
  const existing = library.filter((r) => !own.has(r.id)).slice(0, 200).map((r) => ({ id: r.id, title: r.title, url: r.url }));
  const inherited = [
    ctx.deliverable && { title: `Del entregable «${ctx.deliverable.title}»`, href: deliverablePath({ client_id: clientId, id: ctx.deliverable.id }), list: ctx.fromDeliverable },
    ctx.campaign && { title: `De la campaña «${ctx.campaign.name}»`, href: campaignPath({ client_id: clientId, id: ctx.campaign.id }), list: ctx.fromCampaign },
  ].filter((x): x is { title: string; href: string; list: Material[] } => !!x);

  return (
    <Section id="materiales" title="Enlaces y materiales" count={ctx.own.length}>
      {ctx.own.length > 0 && (
        <ul className="-mt-2 mb-2">
          {ctx.own.map((m) => <MaterialRow key={m.link_id} m={m} target={target} clientId={clientId} usages={ctx.usages} editable={!readOnly} />)}
        </ul>
      )}
      {readOnly ? ctx.own.length === 0 && <p className="text-sm text-muted">Sin enlaces propios.</p> : (
        <details open={ctx.own.length === 0}>
          <summary className="btn btn-secondary btn-sm inline-flex">+ Añadir enlace</summary>
          <AddLinkForm clientId={clientId} target={target} existing={existing} idPrefix={`add-${target.type}`} />
        </details>
      )}
      {inherited.filter((g) => g.list.length > 0).map((group) => (
        <details key={group.href} className="mt-3 border-t border-line pt-3" open>
          <summary className="text-sm font-medium">
            {group.title} <span className="font-mono text-xs text-muted">({group.list.length})</span>
          </summary>
          <ul>
            {group.list.map((m) => <MaterialRow key={m.link_id} m={m} target={target} clientId={clientId} usages={ctx.usages} editable={false} />)}
          </ul>
        </details>
      ))}
    </Section>
  );
}
