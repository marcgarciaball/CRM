"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/action";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Formulario conectado a una acción de servidor con estados de guardado, error y
 * conflicto de edición. Con `warnUnsaved` avisa antes de descartar cambios sin guardar.
 */
export function ActionForm({
  action, children, submitLabel = "Guardar", pendingLabel = "Guardando…", className, resetOnSuccess, warnUnsaved, version, secondary, submitClassName,
}: {
  action: Action; children: ReactNode; submitLabel?: string; pendingLabel?: string; className?: string;
  resetOnSuccess?: boolean; warnUnsaved?: boolean; version?: number; secondary?: ReactNode; submitClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [dirty, setDirty] = useState(false);
  // Versión del registro con la que se cargaron los campos (concurrencia optimista).
  const [base, setBase] = useState(version);
  const [epoch, setEpoch] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // Al terminar una acción con éxito ya no hay cambios pendientes.
  const [seen, setSeen] = useState<ActionState>(null);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setDirty(false);
  }
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  // Si el registro cambia en el servidor y no hay ediciones a medias, se adoptan los datos nuevos.
  // Con ediciones a medias se conserva la versión de partida: al guardar saltará el aviso de conflicto.
  if (version !== base && !dirty && !pending) {
    setBase(version);
    setEpoch(epoch + 1);
  }

  useEffect(() => {
    if (!warnUnsaved || !dirty) return;
    const message = "Hay cambios sin guardar. ¿Quieres descartarlos?";
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href]");
      if (a && !a.getAttribute("target") && !window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [warnUnsaved, dirty]);

  // Envío manual: evita que React vacíe el formulario si la acción devuelve un error.
  const submit = (extra?: Record<string, string>) => {
    const form = ref.current;
    if (!form || !form.reportValidity()) return;
    const fd = new FormData(form);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    setDismissed(false);
    startTransition(() => formAction(fd));
  };

  return (
    <form ref={ref} className={className} onChange={() => setDirty(true)} onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate={false}>
      {base !== undefined && <input type="hidden" name="version" value={base} />}
      <div key={epoch} className="contents">{children}</div>
      {dismissed ? null : state?.conflict ? (
        <div role="alert" className="mt-3 border border-st-danger-fg bg-st-danger-bg p-3 text-sm text-st-danger-fg">
          <p className="font-medium">{state.error}</p>
          <p className="mt-1">Puedes recargar para ver su versión (perderás tus cambios) o sobrescribirla con la tuya.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setDirty(false); setDismissed(true); router.refresh(); }}>
              Recargar y descartar mis cambios
            </button>
            <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => submit({ force: "1" })}>
              Sobrescribir con mis cambios
            </button>
          </div>
        </div>
      ) : state?.error ? (
        <p role="alert" className="mt-3 border border-st-danger-fg bg-st-danger-bg px-3 py-2 text-sm text-st-danger-fg">{state.error}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" className={submitClassName ?? "btn btn-primary"} disabled={pending} aria-busy={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {secondary}
        <span role="status" className="text-sm text-muted">
          {!pending && state?.ok && !dirty ? <>{state.notice ?? "Guardado."}{state.href && <> <a href={state.href} className="link">Abrir</a></>}</> : warnUnsaved && dirty && !pending ? "Cambios sin guardar" : ""}
        </span>
      </div>
    </form>
  );
}

/** Botón que ejecuta una acción de servidor de un clic, con confirmación opcional. */
export function ActionButton({
  action, fields, confirm, children, className = "btn btn-secondary btn-sm", title,
}: {
  action: Action; fields: Record<string, string>; confirm?: string; children: ReactNode; className?: string; title?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const run = () => {
    if (confirm && !window.confirm(confirm)) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    startTransition(() => formAction(fd));
  };
  return (
    <>
      <button type="button" className={className} disabled={pending} aria-busy={pending} onClick={run} title={title}>
        {children}
      </button>
      {state?.error && <span role="alert" className="block w-full text-xs text-st-danger-fg">{state.error}</span>}
    </>
  );
}

/** Selector que guarda al cambiar (p. ej. estado de una tarea). */
export function ActionSelect({
  action, fields, name, value, options, label,
}: {
  action: Action; fields: Record<string, string>; name: string; value: string; options: { id: string; label: string }[]; label: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <span className="inline-flex flex-col">
      <select aria-label={label} className="field !min-h-8 !w-auto !py-1 !text-xs" value={value} disabled={pending} aria-busy={pending}
        onChange={(e) => {
          const fd = new FormData();
          for (const [k, v] of Object.entries(fields)) fd.set(k, v);
          fd.set(name, e.target.value);
          startTransition(() => formAction(fd));
        }}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {state?.error && <span role="alert" className="text-xs text-st-danger-fg">{state.error}</span>}
    </span>
  );
}
