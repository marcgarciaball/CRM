"use client";

import { startTransition, useActionState, useOptimistic, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { moveTaskAction } from "@/app/actions/work";
import type { ActionState } from "@/lib/action";

/** `group`: solo se reordena dentro del mismo grupo (las hechas van siempre al final). */
export type SortableItem = { id: string; group: string; label: string; node: ReactNode };

const MIME = "application/x-workspace-sort";

/**
 * Lista de tareas con orden manual: se arrastra cada fila por su asa, o con el teclado (asa enfocada + flechas
 * arriba/abajo). El cambio se ve al momento y se guarda colocando la tarea entre sus vecinas de la lista.
 */
export function SortableTasks({ items }: { items: SortableItem[] }) {
  // Orden del servidor; el arrastrado se muestra al momento y, si falla el guardado, vuelve solo al anterior.
  const [order, setOrder] = useOptimistic(items.map((i) => i.id));

  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; after: boolean } | null>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(moveTaskAction, null);

  const byId = new Map(items.map((i) => [i.id, i]));
  const rows = order.map((id) => byId.get(id)).filter((i): i is SortableItem => !!i);

  const move = (id: string, to: string, after: boolean) => {
    if (id === to) return;
    const group = byId.get(id)?.group;
    if (group === undefined || byId.get(to)?.group !== group) return;
    const next = order.filter((x) => x !== id);
    next.splice(next.indexOf(to) + (after ? 1 : 0), 0, id);
    const same = next.filter((x) => byId.get(x)?.group === group);
    const at = same.indexOf(id);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("prev", same[at - 1] ?? "");
    fd.set("next", same[at + 1] ?? "");
    startTransition(() => { setOrder(next); formAction(fd); });
  };

  const onKey = (e: KeyboardEvent, item: SortableItem) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const same = rows.filter((r) => r.group === item.group);
    const at = same.findIndex((r) => r.id === item.id);
    const up = e.key === "ArrowUp";
    const neighbour = same[at + (up ? -1 : 1)];
    if (neighbour) move(item.id, neighbour.id, !up);
  };

  const over = (e: DragEvent<HTMLLIElement>, item: SortableItem) => {
    if (!dragging || !e.dataTransfer.types.includes(MIME) || byId.get(dragging)?.group !== item.group) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    if (target?.id !== item.id || target.after !== after) setTarget({ id: item.id, after });
  };

  const end = () => { setDragging(null); setTarget(null); };

  return (
    <>
      <ul aria-busy={pending}>
        {rows.map((item) => {
          const line = target?.id === item.id && dragging !== item.id
            ? (target.after ? "shadow-[inset_0_-2px_0_var(--color-accent)]" : "shadow-[inset_0_2px_0_var(--color-accent)]") : "";
          return (
            <li key={item.id} className={`flex items-center gap-1 border-b border-line last:border-b-0 ${dragging === item.id ? "opacity-40" : ""} ${line}`}
              onDragOver={(e) => over(e, item)}
              onDrop={(e) => { e.preventDefault(); if (dragging && target) move(dragging, target.id, target.after); end(); }}>
              <button type="button" draggable aria-label={`Mover «${item.label}» (flechas arriba y abajo)`} title="Arrastra para cambiar el orden"
                className="-ml-1 shrink-0 cursor-grab p-1 text-muted hover:text-ink active:cursor-grabbing"
                onKeyDown={(e) => onKey(e, item)}
                onDragStart={(e) => {
                  e.dataTransfer.setData(MIME, item.id);
                  e.dataTransfer.effectAllowed = "move";
                  const row = e.currentTarget.closest("li");
                  if (row) e.dataTransfer.setDragImage(row, 16, row.offsetHeight / 2);
                  setDragging(item.id);
                }}
                onDragEnd={end}>
                <GripVertical size={16} aria-hidden />
              </button>
              <div className="min-w-0 flex-1">{item.node}</div>
            </li>
          );
        })}
      </ul>
      {state?.error && <p role="alert" className="py-1 text-xs text-st-danger-fg">{state.error}</p>}
    </>
  );
}
