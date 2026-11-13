"use client";

import { useState } from "react";

type Person = { id: string; label: string };
type TemplateTask = { key: string; title: string; suggestedAssigneeId: string | null; suggestedAssignee: string };

/**
 * Plantilla de campaña de newsletter. Sugiere tareas y personas; quien crea la campaña
 * confirma cada una y decide las fechas (no se proponen plazos).
 */
export function TemplateFields({ people, tasks, defaultOwner }: { people: Person[]; tasks: TemplateTask[]; defaultOwner?: string }) {
  const [on, setOn] = useState(false);
  return (
    <fieldset className="mt-4 border border-ink p-3">
      <legend className="px-1 font-mono text-xs font-medium uppercase">Plantilla</legend>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="use_template" className="mt-1" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span>Usar la plantilla «Campaña de newsletter» <span className="text-muted">(crea una newsletter y sus tareas; si no, la campaña empieza vacía)</span></span>
      </label>
      {on && (
        <div className="mt-3 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="tpl-title">Título de la newsletter</label>
              <input id="tpl-title" name="deliverable_title" maxLength={200} className="field" placeholder="Por defecto, el nombre de la campaña" />
            </div>
            <div>
              <label className="label" htmlFor="tpl-date">Fecha prevista de envío</label>
              <input id="tpl-date" name="deliverable_date" type="date" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="tpl-owner">Responsable de la newsletter</label>
              <select id="tpl-owner" name="deliverable_owner" className="field" defaultValue={defaultOwner ?? ""}>
                <option value="">Sin responsable</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <p className="label">Tareas sugeridas: confirma quién y cuándo</p>
            <ul className="border-t border-ink">
              {tasks.map((t) => (
                <li key={t.key} className="grid items-end gap-2 border-b border-line py-2 sm:grid-cols-[auto_2fr_1fr_1fr]">
                  <input type="hidden" name="task_key" value={t.key} />
                  <label className="flex items-center gap-1.5 pb-2 text-xs">
                    <input type="checkbox" name={`task_on_${t.key}`} defaultChecked /> Crear
                  </label>
                  <div>
                    <label className="label" htmlFor={`tpl-t-${t.key}`}>Tarea</label>
                    <input id={`tpl-t-${t.key}`} name={`task_title_${t.key}`} defaultValue={t.title} maxLength={200} className="field" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`tpl-a-${t.key}`}>Asignada a</label>
                    <select id={`tpl-a-${t.key}`} name={`task_assignee_${t.key}`} defaultValue={t.suggestedAssigneeId ?? ""} className="field">
                      <option value="">Sin asignar</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    {!t.suggestedAssigneeId && <p className="mt-1 text-xs text-muted">Sugerencia: {t.suggestedAssignee}</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor={`tpl-d-${t.key}`}>Fecha límite</label>
                    <input id={`tpl-d-${t.key}`} name={`task_due_${t.key}`} type="date" className="field" />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">Las fechas se quedan vacías si no las indicas: la herramienta no inventa plazos.</p>
          </div>
        </div>
      )}
    </fieldset>
  );
}
