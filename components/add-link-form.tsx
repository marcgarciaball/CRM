"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { addLinkAction } from "@/app/actions/materials";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/labels";

type Existing = { id: string; title: string; url: string };

/**
 * "Añadir enlace" dentro de cualquier registro (o en la biblioteca si no hay `target`).
 * Solo título y URL son obligatorios. También permite enlazar un recurso que ya existe.
 */
export function AddLinkForm({ target, existing = [], idPrefix }: {
  target?: { type: "campaign" | "deliverable" | "task"; id: string }; existing?: Existing[]; idPrefix: string;
}) {
  const [state, formAction, pending] = useActionState(addLinkAction, null);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [primary, setPrimary] = useState(false);
  const [approval, setApproval] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const isDeliverable = target?.type === "deliverable";

  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) {
      setPrimary(false);
      setApproval(false);
    }
  }
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  const submit = (extra: Record<string, string> = {}) => {
    const form = ref.current;
    if (!form || !form.reportValidity()) return;
    const fd = new FormData(form);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(() => formAction(fd));
  };
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <form ref={ref} className="mt-3 rounded-lg bg-bg p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {target && (
        <>
          <input type="hidden" name="target_type" value={target.type} />
          <input type="hidden" name="target_id" value={target.id} />
        </>
      )}
      {target && existing.length > 0 && (
        <div className="mb-3 flex gap-4 text-sm" role="radiogroup" aria-label="Tipo de enlace">
          <label className="flex items-center gap-1.5">
            <input type="radio" name={id("mode")} checked={mode === "new"} onChange={() => setMode("new")} /> Enlace nuevo
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name={id("mode")} checked={mode === "existing"} onChange={() => setMode("existing")} /> Uno que ya está en Recursos
          </label>
        </div>
      )}
      {mode === "new" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={id("title")}>Título</label>
            <input id={id("title")} name="title" required maxLength={200} className="field" placeholder="Ej.: Diseño de Ainhoa" />
          </div>
          <div>
            <label className="label" htmlFor={id("url")}>URL</label>
            <input id={id("url")} name="url" type="url" required maxLength={2048} className="field" placeholder="https://…" inputMode="url" />
          </div>
          <details className="sm:col-span-2">
            <summary className="more">Más detalles (opcional)</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={id("category")}>Categoría</label>
                <select id={id("category")} name="category" className="field" defaultValue="">
                  <option value="">Automática según el enlace</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={id("description")}>Descripción breve</label>
                <input id={id("description")} name="description" maxLength={1000} className="field" />
              </div>
            </div>
          </details>
        </div>
      ) : (
        <div>
          <label className="label" htmlFor={id("resource")}>Recurso</label>
          <select id={id("resource")} name="resource_id" required className="field" defaultValue="">
            <option value="" disabled>Elige un recurso…</option>
            {existing.map((r) => <option key={r.id} value={r.id}>{r.title} — {r.url.replace(/^https?:\/\//, "").slice(0, 50)}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">Se enlaza el mismo recurso, no una copia.</p>
        </div>
      )}
      {target && (
        <div className="mt-3 flex flex-col gap-1.5 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="is_primary" className="mt-1" checked={primary}
              onChange={(e) => { setPrimary(e.target.checked); if (isDeliverable) setApproval(e.target.checked); }} />
            <span>Fijar como material principal <span className="text-muted">(si no, queda como referencia)</span></span>
          </label>
          {isDeliverable && (
            <label className="flex items-start gap-2">
              <input type="checkbox" name="requires_approval" className="mt-1" checked={approval} onChange={(e) => setApproval(e.target.checked)} />
              <span>Requiere aprobación editorial <span className="text-muted">(p. ej. el diseño final: si cambia, el entregable vuelve a revisión)</span></span>
            </label>
          )}
        </div>
      )}
      {state?.duplicates && (
        <div role="alert" className="mt-3 border border-st-warn-fg bg-st-warn-bg p-3 text-sm text-st-warn-fg">
          <p className="font-medium">Ya hay un recurso con esta URL: «{state.duplicates[0].title}».</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {target && (
              <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => submit({ resource_id: state.duplicates![0].id })}>
                Enlazar el que ya existe
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => submit({ allow_duplicate: "1" })}>
              Crear otro igualmente
            </button>
          </div>
        </div>
      )}
      {state?.error && <p role="alert" className="mt-3 border border-st-danger-fg bg-st-danger-bg px-3 py-2 text-sm text-st-danger-fg">{state.error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>{pending ? "Guardando…" : "Añadir enlace"}</button>
        <span role="status" className="text-sm text-muted">{!pending && state?.ok ? state.notice : ""}</span>
      </div>
      <p className="mt-2 text-xs text-muted">Guardar un enlace no da acceso al archivo: Drive y Figma mantienen sus permisos.</p>
    </form>
  );
}
