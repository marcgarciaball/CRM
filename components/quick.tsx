"use client";

import { startTransition, useActionState, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { addLinkAction } from "@/app/actions/materials";
import { createDeliverableAction, createTaskAction, quickDeliverableAction, quickTaskAction } from "@/app/actions/work";
import type { ActionState } from "@/lib/action";
import { CHANNELS, CHANNEL_LABEL } from "@/lib/labels";
import { ActionForm } from "./action-form";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
type Option = { id: string; label: string };
const QUICK = { task: quickTaskAction, deliverable: quickDeliverableAction } as const;

function useQuick(kind: keyof typeof QUICK) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(QUICK[kind] as Action, null);
  const send = (id: string, field: string, value: string) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("field", field);
    fd.set("value", value);
    startTransition(() => formAction(fd));
  };
  return { send, pending, error: state?.error };
}

/** Campo que se guarda al cambiar, directamente en la lista (persona, fecha…). */
export function QuickSelect({ kind, id, field, value, options, label, empty }: {
  kind: keyof typeof QUICK; id: string; field: string; value: string | null; options: Option[]; label: string; empty?: string;
}) {
  const { send, pending, error } = useQuick(kind);
  return (
    <span className="inline-flex flex-col">
      <select aria-label={label} title={label} className="chip-field" value={value ?? ""} disabled={pending} aria-busy={pending}
        onChange={(e) => send(id, field, e.target.value)}>
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {error && <span role="alert" className="text-xs text-st-danger-fg">{error}</span>}
    </span>
  );
}

export function QuickDate({ kind, id, field, value, label, danger }: {
  kind: keyof typeof QUICK; id: string; field: string; value: string | null; label: string; danger?: boolean;
}) {
  const { send, pending, error } = useQuick(kind);
  return (
    <span className="inline-flex flex-col">
      <input type="date" aria-label={label} title={label} key={value ?? ""} defaultValue={value ?? ""} disabled={pending} aria-busy={pending}
        className={`chip-field ${danger ? "!text-st-danger-fg font-medium" : ""} ${value ? "" : "text-muted"}`}
        onChange={(e) => { if (e.target.value !== (value ?? "")) send(id, field, e.target.value); }} />
      {error && <span role="alert" className="text-xs text-st-danger-fg">{error}</span>}
    </span>
  );
}

// ── Arrastrar y soltar (con alternativa accesible: los campos rápidos de cada fila) ──
type Payload = { kind: keyof typeof QUICK; id: string };
const MIME = "application/x-amapola";

export function Draggable({ kind, id, children, className }: Payload & { children: ReactNode; className?: string }) {
  return (
    <div draggable className={`cursor-grab active:cursor-grabbing ${className ?? ""}`}
      onDragStart={(e) => { e.dataTransfer.setData(MIME, JSON.stringify({ kind, id })); e.dataTransfer.effectAllowed = "move"; }}>
      {children}
    </div>
  );
}

/** Zona donde soltar: aplica `set[kind]` (campo y valor) al registro arrastrado. */
export function DropZone({ set, children, className }: {
  set: Partial<Record<keyof typeof QUICK, { field: string; value: string }>>; children: ReactNode; className?: string;
}) {
  const task = useQuick("task"), deliverable = useQuick("deliverable");
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(MIME);
  const error = task.error ?? deliverable.error;
  return (
    <div className={`${className ?? ""} ${over ? "outline-2 -outline-offset-2 outline-accent" : ""}`} aria-busy={task.pending || deliverable.pending}
      onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!accepts(e)) return;
        e.preventDefault();
        const { kind, id } = JSON.parse(e.dataTransfer.getData(MIME)) as Payload;
        const target = set[kind];
        if (target) (kind === "task" ? task : deliverable).send(id, target.field, target.value);
      }}>
      {children}
      {error && <p role="alert" className="p-1 text-xs text-st-danger-fg">{error}</p>}
    </div>
  );
}

// ── Crear sin salir de la página ───────────────────────────────────────────
export type QuickCreateOptions = { people: Option[]; campaigns: Option[]; deliverables: Option[]; me: string };
const KINDS = [["task", "Tarea"], ["deliverable", "Entregable"], ["link", "Enlace"]] as const;

function Created({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function QuickCreate({ options, compact }: { options: QuickCreateOptions; compact?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("task");
  const [open, setOpen] = useState(false);
  const select = (name: string, label: string, list: Option[], empty: string, value = "") => (
    <div>
      <label className="label" htmlFor={`qc-${name}`}>{label}</label>
      <select id={`qc-${name}`} name={name} defaultValue={value} className="field">
        <option value="">{empty}</option>
        {list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
  return (
    <>
      <button type="button" className={compact ? "btn btn-primary btn-sm" : "btn btn-primary w-full"} onClick={() => { setOpen(true); ref.current?.showModal(); }}>
        <Plus size={16} aria-hidden /> Crear
      </button>
      <dialog ref={ref} onClose={() => setOpen(false)} aria-labelledby="qc-title"
        className="m-auto w-[min(34rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40">
        {open && (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="qc-title" className="text-lg font-semibold">Crear</h2>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Cerrar" onClick={() => ref.current?.close()}><X size={16} aria-hidden /></button>
            </div>
            <div role="tablist" aria-label="Qué quieres crear" className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-bg p-1">
              {KINDS.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${kind === k ? "bg-surface shadow-sm" : "text-muted hover:text-ink"}`}>{label}</button>
              ))}
            </div>
            {kind === "task" && (
              <ActionForm key="task" action={createTaskAction} submitLabel="Crear tarea" pendingLabel="Creando…" resetOnSuccess>
                <input type="hidden" name="stay" value="1" />
                <Created>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="qc-task-title">¿Qué hay que hacer?</label>
                    <input id="qc-task-title" name="title" required maxLength={200} autoFocus className="field" placeholder="Ej.: Redactar el copy de la newsletter" />
                  </div>
                  {select("assignee_id", "Para quién", options.people, "Sin asignar", options.me)}
                  <div>
                    <label className="label" htmlFor="qc-due">Fecha límite (opcional)</label>
                    <input id="qc-due" name="due_date" type="date" className="field" />
                  </div>
                  {select("deliverable_id", "Entregable (opcional)", options.deliverables, "Ninguno")}
                  {select("campaign_id", "Campaña (opcional)", options.campaigns, "Ninguna")}
                </Created>
              </ActionForm>
            )}
            {kind === "deliverable" && (
              <ActionForm key="deliverable" action={createDeliverableAction} submitLabel="Crear entregable" pendingLabel="Creando…" resetOnSuccess>
                <input type="hidden" name="stay" value="1" />
                <Created>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="qc-d-title">¿Qué se va a publicar?</label>
                    <input id="qc-d-title" name="title" required maxLength={200} autoFocus className="field" placeholder="Ej.: Newsletter regalos de boda" />
                  </div>
                  <div>
                    <label className="label" htmlFor="qc-channel">Canal</label>
                    <select id="qc-channel" name="channel" className="field">{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select>
                  </div>
                  <div>
                    <label className="label" htmlFor="qc-planned">Fecha de publicación (opcional)</label>
                    <input id="qc-planned" name="planned_date" type="date" className="field" />
                  </div>
                  {select("owner_id", "Responsable", options.people, "Sin responsable", options.me)}
                  {select("campaign_id", "Campaña (opcional)", options.campaigns, "Ninguna")}
                </Created>
              </ActionForm>
            )}
            {kind === "link" && (
              <ActionForm key="link" action={addLinkAction} submitLabel="Guardar enlace" resetOnSuccess>
                <input type="hidden" name="allow_duplicate" value="1" />
                <Created>
                  <div>
                    <label className="label" htmlFor="qc-l-title">Título</label>
                    <input id="qc-l-title" name="title" required maxLength={200} autoFocus className="field" placeholder="Ej.: Diseño de Ainhoa" />
                  </div>
                  <div>
                    <label className="label" htmlFor="qc-l-url">URL</label>
                    <input id="qc-l-url" name="url" type="url" required maxLength={2048} className="field" placeholder="https://…" />
                  </div>
                </Created>
                <p className="mt-2 text-xs text-muted">Se guarda en Recursos. Para unirlo a un trabajo concreto, usa «Añadir enlace» dentro de la tarea, el entregable o la campaña.</p>
              </ActionForm>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
