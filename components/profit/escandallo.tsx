"use client";

import { Trash2 } from "lucide-react";
import {
  deleteFixedCostAction, deleteProductAction, saveFixedCostAction, saveProductAction, saveSettingsAction,
} from "@/app/actions/profit";
import { ActionButton, ActionForm } from "@/components/action-form";
import type { CostSettings, FixedCostTotals, Product } from "@/lib/profit/types";
import type { FixedCost } from "@/lib/services/profit";

/** Número para un campo de formulario, con coma decimal y sin miles («1234,5»); vacío si no hay dato. */
const show = (n: number | null | undefined, scale = 1) =>
  n === null || n === undefined ? "" : (n * scale).toLocaleString("es-ES", { maximumFractionDigits: 4, useGrouping: false });
const money = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const SETTINGS: { key: keyof CostSettings; label: string; pct?: boolean; hint?: string }[] = [
  { key: "iva", label: "IVA incluido en el PVP (%)", pct: true },
  { key: "horas_productivas_anuales", label: "Horas productivas al año (todo el equipo)" },
  { key: "precio_tela_m2", label: "Precio de la tela (€/m²)" },
  { key: "tinta_m2", label: "Tinta por m² impreso (€)", hint: "Vacío si la tinta es un coste fijo al mes (va en costes fijos)." },
  { key: "merma_tela", label: "Merma de tela (%)", pct: true },
  { key: "reimpresion", label: "Unidades que se reimprimen (%)", pct: true },
  { key: "roturas", label: "Roturas o reenvíos (%)", pct: true },
  { key: "comision_pct", label: "Comisiones Shopify + pasarela + PayPal (%)", pct: true, hint: "Vacío = sin dato: los márgenes salen sin comisiones." },
  { key: "comision_fija_pedido", label: "Comisión fija por pedido (€)" },
  { key: "envio_neto_pedido", label: "Envío por pedido, neto (€)", hint: "Lo que cuesta el envío menos lo que paga el cliente. Vacío = sin dato." },
  { key: "unidades_por_pedido", label: "Unidades medias por pedido" },
];

export function SettingsForm({ clientId, settings, readOnly }: { clientId: string; settings: CostSettings; readOnly: boolean }) {
  const fields = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {SETTINGS.map((f) => (
        <div key={f.key}>
          <label className="label" htmlFor={`s-${f.key}`}>{f.label}</label>
          <input id={`s-${f.key}`} name={f.key} inputMode="decimal" defaultValue={show(settings[f.key], f.pct ? 100 : 1)} className="field font-mono" disabled={readOnly} />
          {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
        </div>
      ))}
    </div>
  );
  if (readOnly) return fields;
  return (
    <ActionForm action={saveSettingsAction} submitLabel="Guardar supuestos" warnUnsaved>
      <input type="hidden" name="client_id" value={clientId} />
      {fields}
    </ActionForm>
  );
}

/** Costes fijos: la Propiedad ve y edita cada línea; el resto del equipo, solo los totales. */
export function FixedCosts({ clientId, isOwner, lines, totals, readOnly }: {
  clientId: string; isOwner: boolean; lines: FixedCost[]; totals: FixedCostTotals; readOnly: boolean;
}) {
  const summary = (
    <p className="mb-3 font-mono text-sm">
      Personal {money(totals.personal)}/mes · Estructura {money(totals.estructura)}/mes · Total {money(totals.personal + totals.estructura)}/mes
    </p>
  );
  if (!isOwner) {
    return <>{summary}<p className="text-xs text-muted">El detalle de cada línea (salarios incluidos) solo lo ve la Propiedad.</p></>;
  }
  return (
    <>
      {summary}
      <ul className="divide-y divide-line border-y border-line">
        {lines.map((c) => (
          <li key={c.id} className="py-2">
            {readOnly ? (
              <p className="text-sm">{c.group === "personal" ? "Personal" : "Estructura"} · {c.concept} · <span className="font-mono">{c.monthly_amount === null ? "sin dato" : money(c.monthly_amount)}</span></p>
            ) : (
              <ActionForm action={saveFixedCostAction} submitLabel="Guardar" submitClassName="btn btn-secondary btn-sm" className="grid gap-2 sm:grid-cols-[8rem_1fr_8rem_1fr] sm:items-end"
                secondary={<ActionButton action={deleteFixedCostAction} fields={{ client_id: clientId, id: c.id }} confirm={`¿Borrar «${c.concept}»?`} className="btn btn-ghost btn-sm"><Trash2 size={14} aria-hidden /> Borrar</ActionButton>}>
                <FixedCostFields clientId={clientId} cost={c} />
              </ActionForm>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-bold">Añadir coste fijo</summary>
          <ActionForm action={saveFixedCostAction} submitLabel="Añadir" resetOnSuccess className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr_8rem_1fr] sm:items-end">
            <FixedCostFields clientId={clientId} />
          </ActionForm>
        </details>
      )}
    </>
  );
}

function FixedCostFields({ clientId, cost }: { clientId: string; cost?: FixedCost }) {
  const id = cost?.id ?? "new";
  return (
    <>
      <input type="hidden" name="client_id" value={clientId} />
      {cost && <input type="hidden" name="id" value={cost.id} />}
      <div>
        <label className="label" htmlFor={`fc-g-${id}`}>Grupo</label>
        <select id={`fc-g-${id}`} name="group" defaultValue={cost?.group ?? "estructura"} className="field">
          <option value="personal">Personal</option><option value="estructura">Estructura</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`fc-c-${id}`}>Concepto</label>
        <input id={`fc-c-${id}`} name="concept" required maxLength={160} defaultValue={cost?.concept} className="field" />
      </div>
      <div>
        <label className="label" htmlFor={`fc-a-${id}`}>€ / mes</label>
        <input id={`fc-a-${id}`} name="monthly_amount" inputMode="decimal" defaultValue={show(cost?.monthly_amount)} className="field font-mono" />
      </div>
      <div>
        <label className="label" htmlFor={`fc-n-${id}`}>Nota</label>
        <input id={`fc-n-${id}`} name="note" maxLength={500} defaultValue={cost?.note} className="field" />
      </div>
    </>
  );
}

/** Productos del escandallo: cada uno se edita en su fila desplegable. */
export function ProductsEditor({ clientId, products, shopifyTitles, isOwner, readOnly }: {
  clientId: string; products: Product[]; shopifyTitles: string[]; isOwner: boolean; readOnly: boolean;
}) {
  return (
    <>
      <datalist id="shopify-titles">{shopifyTitles.map((t) => <option key={t} value={t} />)}</datalist>
      <ul className="divide-y divide-line border-y border-line">
        {products.map((p) => (
          <li key={p.id}>
            <details>
              <summary className="flex cursor-pointer flex-wrap justify-between gap-2 py-2 text-sm hover:bg-subtle">
                <span>{p.family}{p.format && <span className="text-muted"> · {p.format}</span>}{!p.active && <span className="ml-1 font-mono text-[11px] text-muted">inactivo</span>}</span>
                <span className="font-mono text-[13px]">{p.price === null ? "sin precio" : `${show(p.price)} €`} · {p.minutes === null ? "—" : `${show(p.minutes)} min`}</span>
              </summary>
              {readOnly ? <ProductFields clientId={clientId} product={p} disabled /> : (
                <ActionForm action={saveProductAction} submitLabel="Guardar producto" className="pb-3"
                  secondary={isOwner ? <ActionButton action={deleteProductAction} fields={{ client_id: clientId, id: p.id }} confirm={`¿Borrar «${p.family} ${p.format}»?`} className="btn btn-ghost btn-sm"><Trash2 size={14} aria-hidden /> Borrar</ActionButton> : undefined}>
                  <ProductFields clientId={clientId} product={p} />
                </ActionForm>
              )}
            </details>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <details className="mt-3" id="nuevo-producto">
          <summary className="cursor-pointer text-sm font-bold">Añadir producto</summary>
          <ActionForm action={saveProductAction} submitLabel="Añadir producto" resetOnSuccess className="mt-2">
            <ProductFields clientId={clientId} />
          </ActionForm>
        </details>
      )}
    </>
  );
}

function ProductFields({ clientId, product, disabled }: { clientId: string; product?: Product; disabled?: boolean }) {
  const id = product?.id ?? "new";
  const input = (name: keyof Product, label: string, opts: { numeric?: boolean; required?: boolean; list?: string; hint?: string } = {}) => (
    <div>
      <label className="label" htmlFor={`p-${name}-${id}`}>{label}</label>
      <input id={`p-${name}-${id}`} name={name} required={opts.required} list={opts.list} disabled={disabled}
        inputMode={opts.numeric ? "decimal" : undefined} className={`field ${opts.numeric ? "font-mono" : ""}`}
        defaultValue={opts.numeric ? show(product?.[name] as number | null) : ((product?.[name] as string | null) ?? "")} />
      {opts.hint && <p className="mt-1 text-xs text-muted">{opts.hint}</p>}
    </div>
  );
  return (
    <div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="client_id" value={clientId} />
      {product && <input type="hidden" name="id" value={product.id} />}
      {input("family", "Familia", { required: true })}
      {input("format", "Formato")}
      {input("price", "PVP con IVA (€)", { numeric: true })}
      {input("minutes", "Minutos de producción", { numeric: true })}
      {input("fabric_w_cm", "Tela: ancho (cm)", { numeric: true, hint: "Vacío si no lleva tela." })}
      {input("fabric_h_cm", "Tela: alto (cm)", { numeric: true })}
      {input("support_cost", "Coste soporte (€)", { numeric: true })}
      {input("packaging_cost", "Coste embalaje (€)", { numeric: true })}
      {input("shopify_title", "Producto en Shopify", { list: "shopify-titles", hint: "Tal como aparece en el export de ventas." })}
      {input("variant_match", "La variante contiene", { hint: "Ej.: 15x21cm. Vacío = todas las variantes." })}
      {input("note", "Nota")}
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={product?.active ?? true} disabled={disabled} /> Activo
      </label>
    </div>
  );
}
