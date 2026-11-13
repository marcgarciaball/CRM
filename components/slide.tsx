import Link from "next/link";
import type { ReactNode } from "react";
import { moveAssetAction, removeAssetAction, updateCreativeAction } from "@/app/actions/assets";
import { formatBytes } from "@/lib/assets";
import { CHANNEL_LABEL, CREATIVE_FORMATS, CREATIVE_FORMAT_LABEL, personName } from "@/lib/labels";
import { campaignPath, deliverablePath } from "@/lib/paths";
import type { Asset } from "@/lib/services/assets";
import type { Deliverable } from "@/lib/services/deliverables";
import type { Material } from "@/lib/services/resources";
import { ActionButton, ActionForm } from "./action-form";
import { AssetUploader } from "./asset-uploader";
import { AssetViewer } from "./asset-viewer";
import { MaterialChip } from "./materials";
import { Badge, DeliverableStatusBadge, ExternalLink, Field, SelectField, options } from "./ui";

/** Texto libre con las direcciones http(s) convertidas en enlaces seguros. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {parts.map((part, i) => (i % 2 === 1 ? <ExternalLink key={i} href={part} className="link break-all">{part}</ExternalLink> : part))}
    </p>
  );
}

/** «18/11 → POST INSTAGRAM · 1080×1350»: día de publicación → canal y formatos necesarios. */
export function SlideMeta({ d }: { d: Pick<Deliverable, "planned_date" | "channel" | "formats"> }) {
  const day = d.planned_date ? `${d.planned_date.slice(8)}/${d.planned_date.slice(5, 7)}` : "Sin fecha";
  return (
    <p className="font-mono text-[13px] tracking-wide text-muted uppercase">
      {day} <span aria-hidden>→</span><span className="sr-only">:</span> {CHANNEL_LABEL[d.channel]}{d.formats && <> · {d.formats}</>}
    </p>
  );
}

const viewerItems = (assets: Asset[]) => assets.map((a) => ({ id: a.id, kind: a.kind, name: a.file_name }));
const formatBadge = (d: Pick<Deliverable, "creative_format">) =>
  d.creative_format ? <Badge tone="neutral">{CREATIVE_FORMAT_LABEL[d.creative_format]}</Badge> : null;

function Links({ links, children }: { links: Material[]; children?: ReactNode }) {
  if (links.length === 0 && !children) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {links.map((m) => <MaterialChip key={m.link_id} m={m} />)}
      {children}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <h3 className="eyebrow mb-1">{title}</h3>
      {children}
    </div>
  );
}

/**
 * Lado derecho de la diapositiva, editable. Mientras no hay creatividad final muestra la propuesta
 * (¿estático o dinámico?, inspo, copy in). Cuando se sube el archivo final, este ocupa su lugar
 * y la propuesta queda plegada debajo. `readOnly` (cliente archivado): la misma información, sin editar.
 */
export function CreativePanel({ d, assets, links, readOnly = false }: { d: Deliverable; assets: Asset[]; links: Material[]; readOnly?: boolean }) {
  const final = assets.length > 0;
  const locked = ["approved", "scheduled", "published"].includes(d.status);
  const proposal = readOnly ? (
    d.inspo || d.copy_in ? (
      <>
        {d.inspo && <Block title="Inspo"><Linkified text={d.inspo} /></Block>}
        {d.copy_in && <Block title="Copy in"><Linkified text={d.copy_in} /></Block>}
      </>
    ) : <p className="text-sm text-muted">Sin propuesta creativa todavía.</p>
  ) : (
    <ActionForm action={updateCreativeAction} version={d.version} warnUnsaved submitLabel="Guardar propuesta">
      <input type="hidden" name="id" value={d.id} />
      <div className="space-y-3">
        <SelectField label="¿Estático o dinámico?" name="creative_format" id="f-creative-format" value={d.creative_format}
          options={options(CREATIVE_FORMAT_LABEL, CREATIVE_FORMATS)} empty="Sin decidir" />
        <Field label="Inspo" htmlFor="f-inspo" hint="Referencias, ideas y enlaces de inspiración.">
          <textarea id="f-inspo" name="inspo" rows={4} maxLength={20000} defaultValue={d.inspo} className="field" />
        </Field>
        <Field label="Copy in" htmlFor="f-copy-in" hint="El texto que va dentro de la imagen o el vídeo.">
          <textarea id="f-copy-in" name="copy_in" rows={4} maxLength={20000} defaultValue={d.copy_in} className="field" />
          {locked && <p className="mt-1 bg-st-warn-bg px-2 py-1 text-xs text-st-warn-fg">Este contenido está validado: si cambias el copy in, volverá a «En revisión».</p>}
        </Field>
      </div>
    </ActionForm>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold tracking-tight">{final ? "Creatividad final" : "Propuesta creativa"}</h2>
        {formatBadge(d)}
      </div>

      {final && <AssetViewer items={viewerItems(assets)} label={`Creatividad final de «${d.title}»`} />}
      {final && d.creative_format === "carousel" && assets.length === 1 && (
        <p className="mt-2 bg-st-warn-bg px-2 py-1 text-xs text-st-warn-fg">Está marcado como carrusel y solo tiene un archivo. Sube el resto en el orden de publicación.</p>
      )}

      <Links links={links}>
        {!readOnly && <a href="#materiales" className="more">{links.length === 0 ? "+ Añadir enlace a Figma o Drive" : "+ Enlace"}</a>}
      </Links>

      {final && !readOnly && (
        <details className="mt-3" open={d.creative_format === "carousel" && assets.length > 1}>
          <summary className="more">Ordenar o quitar archivos (<span className="font-mono">{assets.length}</span>)</summary>
          <ol className="mt-2 border-t border-ink">
            {assets.map((a, i) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-2 py-1.5 text-sm">
                <span className="w-5 text-center font-mono text-xs font-medium text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{a.file_name} <span className="text-xs text-muted">· {a.kind === "video" ? "Vídeo" : "Imagen"} · <span className="font-mono">{formatBytes(a.size_bytes)}</span></span></span>
                {assets.length > 1 && (
                  <>
                    {i > 0 && <ActionButton action={moveAssetAction} fields={{ id: a.id, direction: "up" }} title="Mover antes"><span aria-hidden>↑</span><span className="sr-only">Mover «{a.file_name}» una posición antes</span></ActionButton>}
                    {i < assets.length - 1 && <ActionButton action={moveAssetAction} fields={{ id: a.id, direction: "down" }} title="Mover después"><span aria-hidden>↓</span><span className="sr-only">Mover «{a.file_name}» una posición después</span></ActionButton>}
                  </>
                )}
                <ActionButton action={removeAssetAction} fields={{ id: a.id }} className="btn btn-danger btn-sm"
                  confirm={`¿Quitar «${a.file_name}»? El archivo se borra y no se puede recuperar.${locked ? " Al estar validado, el entregable volverá a revisión." : ""}`}>
                  Quitar<span className="sr-only"> «{a.file_name}»</span>
                </ActionButton>
              </li>
            ))}
          </ol>
        </details>
      )}

      {!readOnly && <div className="mt-3">
        <AssetUploader deliverableId={d.id} count={assets.length} label={final ? "+ Añadir archivos" : "Subir la creatividad final"} />
        {locked && <p className="mt-1 bg-st-warn-bg px-2 py-1 text-xs text-st-warn-fg">Este contenido está validado: si subes o quitas archivos, volverá a «En revisión».</p>}
      </div>}

      {final ? (
        <details className="mt-4 border-t border-ink pt-3">
          <summary className="more">Propuesta creativa (inspo y copy in)</summary>
          <div className="mt-3">{proposal}</div>
        </details>
      ) : (
        <div className="mt-4 border-t border-ink pt-4">{proposal}</div>
      )}
    </div>
  );
}

/**
 * Diapositiva de solo lectura (vista «Diapositivas» del calendario): a la izquierda la información
 * y el copy out; a la derecha, sobre gris, la creatividad final o, si aún no existe, la propuesta.
 */
export function SlideCard({ d, assets, links, readOnly = false }: { d: Deliverable; assets: Asset[]; links: Material[]; readOnly?: boolean }) {
  const href = deliverablePath(d);
  const final = assets.length > 0;
  const hasProposal = !!(d.inspo || d.copy_in || d.creative_format);
  return (
    <article className={`card mb-4 grid overflow-hidden lg:grid-cols-2 ${d.status === "discarded" ? "opacity-60" : ""}`} aria-label={d.title}>
      <div className="min-w-0 p-4 sm:p-6">
        <SlideMeta d={d} />
        <h2 className="mt-1 text-xl font-extrabold tracking-tight break-words"><Link href={href} className="hover:underline">{d.title}</Link></h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <DeliverableStatusBadge status={d.status} />
          <span>{personName(d.owner_id, d.owner_name, "Sin responsable")}</span>
          {d.campaign_id && <Link href={campaignPath({ client_id: d.client_id, id: d.campaign_id })} className="hover:underline">{d.campaign_name}</Link>}
        </div>
        <div className="mt-5">
          <Block title="Copy out">
            {d.copy ? <Linkified text={d.copy} /> : <p className="text-sm text-muted">Sin copy todavía.</p>}
          </Block>
        </div>
        <p className="mt-5"><Link href={href} className="btn btn-secondary btn-sm">{readOnly ? "Abrir" : "Abrir y editar"}</Link></p>
      </div>
      <div className="min-w-0 border-t border-ink bg-subtle p-4 sm:p-6 lg:border-t-0 lg:border-l">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">{final ? "Creatividad final" : "Propuesta creativa"}</p>
          {formatBadge(d)}
        </div>
        {final ? (
          <AssetViewer items={viewerItems(assets)} label={`Creatividad final de «${d.title}»`} />
        ) : hasProposal ? (
          <>
            {d.inspo && <Block title="Inspo"><Linkified text={d.inspo} /></Block>}
            {d.copy_in && <Block title="Copy in"><Linkified text={d.copy_in} /></Block>}
          </>
        ) : (
          <p className="text-sm text-muted">Sin propuesta creativa todavía.</p>
        )}
        {final && d.copy_in && <div className="mt-3"><Block title="Copy in"><Linkified text={d.copy_in} /></Block></div>}
        <Links links={links} />
      </div>
    </article>
  );
}
