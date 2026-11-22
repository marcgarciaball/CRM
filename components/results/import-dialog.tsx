"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { clearResultsAction, importResultsAction } from "@/app/actions/results";
import { ActionForm } from "@/components/action-form";

/** «Importar CSV»: ventana con el campo de archivo y qué formatos se admiten. */
export function ImportDialog({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => { setOpen(true); ref.current?.showModal(); }}>
        <Upload size={15} aria-hidden /> Importar CSV
      </button>
      <dialog ref={ref} onClose={() => setOpen(false)} aria-labelledby="import-title"
        className="m-auto w-[min(36rem,calc(100vw-1.5rem))] border-2 border-ink bg-surface p-0 text-ink backdrop:bg-ink/60">
        {open && (
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="import-title" className="text-xl font-extrabold tracking-tight">Importar resultados</h2>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Cerrar" onClick={() => ref.current?.close()}><X size={16} aria-hidden /></button>
            </div>
            <FormatHelp />
            <ActionForm action={importResultsAction} submitLabel="Importar" pendingLabel="Importando…" resetOnSuccess>
              <input type="hidden" name="client_id" value={clientId} />
              <label className="label" htmlFor="import-file">Archivo CSV (máximo 512 KB)</label>
              <input id="import-file" name="file" type="file" accept=".csv,text/csv" required className="field" />
            </ActionForm>
          </div>
        )}
      </dialog>
    </>
  );
}

/** Los dos archivos que se admiten. También se muestra cuando aún no hay datos. */
export function FormatHelp() {
  return (
    <div className="mb-4 space-y-2 text-sm">
      <p><strong>Histórico mensual</strong> (Shopify): una fila por mes, columna <code className="font-mono text-xs">mes</code> (AAAA-MM),
        decimales con punto, celda vacía = sin dato. Si un mes no está completo, añade <code className="font-mono text-xs">datos_hasta</code> (AAAA-MM-DD).
        Volver a subir un mes lo sustituye; los demás no se tocan.</p>
      <p><strong>Informe de Meta Ads</strong>: el export por campaña, anuncio y mes tal como sale de Meta. Sustituye los meses que trae.</p>
    </div>
  );
}

/** Borrar todo (solo la Propiedad): hay que escribir BORRAR. */
export function ClearResults({ clientId }: { clientId: string }) {
  return (
    <ActionForm action={clearResultsAction} submitLabel="Borrar todos los resultados" pendingLabel="Borrando…" submitClassName="btn btn-danger" resetOnSuccess>
      <input type="hidden" name="client_id" value={clientId} />
      <label className="label" htmlFor="clear-confirm">Escribe BORRAR para confirmar</label>
      <input id="clear-confirm" name="confirm" required autoComplete="off" className="field max-w-60" />
    </ActionForm>
  );
}
