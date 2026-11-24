"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { importProfitAction } from "@/app/actions/profit";
import { ActionForm } from "@/components/action-form";

/** «Importar CSV» de Rentabilidad: ventas por producto (todo el equipo); escandallo, costes fijos y gastos (Propiedad). */
export function ProfitImportDialog({ clientId, isOwner }: { clientId: string; isOwner: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => { setOpen(true); ref.current?.showModal(); }}>
        <Upload size={15} aria-hidden /> Importar CSV
      </button>
      <dialog ref={ref} onClose={() => setOpen(false)} aria-labelledby="profit-import-title"
        className="m-auto w-[min(38rem,calc(100vw-1.5rem))] border-2 border-ink bg-surface p-0 text-ink backdrop:bg-ink/60">
        {open && (
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="profit-import-title" className="text-xl font-extrabold tracking-tight">Importar a Rentabilidad</h2>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Cerrar" onClick={() => ref.current?.close()}><X size={16} aria-hidden /></button>
            </div>
            <ProfitFormats isOwner={isOwner} />
            <ActionForm action={importProfitAction} submitLabel="Importar" pendingLabel="Importando…" resetOnSuccess>
              <input type="hidden" name="client_id" value={clientId} />
              <label className="label" htmlFor="profit-file">Archivo CSV (máximo 512 KB)</label>
              <input id="profit-file" name="file" type="file" accept=".csv,text/csv" required className="field" />
              {isOwner && (
                <div className="mt-3">
                  <label className="label" htmlFor="profit-confirm">Para escandallo o costes fijos, escribe SUSTITUIR</label>
                  <input id="profit-confirm" name="confirm" autoComplete="off" className="field max-w-60" />
                  <p className="mt-1 text-xs text-muted">Esos dos archivos sustituyen la lista entera.</p>
                </div>
              )}
            </ActionForm>
          </div>
        )}
      </dialog>
    </>
  );
}

export function ProfitFormats({ isOwner }: { isOwner: boolean }) {
  const code = "font-mono text-xs";
  return (
    <ul className="mb-4 list-disc space-y-1.5 pl-5 text-sm">
      <li><strong>Ventas por producto</strong>: el export de Shopify «ventas por producto y variante» por mes, tal cual. Sustituye los meses que trae.</li>
      <li><strong>Escandallo</strong>{!isOwner && " (Propiedad)"}: <code className={code}>familia,formato,precio,tela_ancho_cm,tela_alto_cm,minutos,soporte,embalaje,producto_shopify,variante_contiene,activo,nota</code></li>
      <li><strong>Costes fijos</strong>{!isOwner && " (Propiedad)"}: <code className={code}>grupo,concepto,importe_mes,nota</code> (grupo: personal o estructura)</li>
      <li><strong>Gastos mensuales</strong>{!isOwner && " (Propiedad)"}: <code className={code}>mes,gastos,comentario</code> (mes AAAA-MM, gastos con IVA)</li>
    </ul>
  );
}
