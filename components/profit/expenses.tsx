"use client";

import { Trash2 } from "lucide-react";
import { deleteExpenseAction, saveExpenseAction } from "@/app/actions/profit";
import { ActionButton, ActionForm } from "@/components/action-form";
import type { MonthResult } from "@/lib/profit/ranking";
import { eur0, monthLong } from "@/lib/results/format";

const TH = "border-b border-ink px-2 py-1.5 text-left font-mono text-[11px] font-medium text-muted uppercase";
const TD = "border-b border-line px-2 py-1.5 font-mono text-[13px] whitespace-nowrap text-right";
const plain = (n: number | null) => (n === null ? "" : n.toLocaleString("es-ES", { maximumFractionDigits: 2, useGrouping: false }));

/** Gastos mensuales con IVA frente a ventas con IVA. La Propiedad edita; el resto del equipo lo ve. */
export function Expenses({ clientId, rows, canEdit }: { clientId: string; rows: MonthResult[]; canEdit: boolean }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>Mes</th><th className={`${TH} text-right`}>Ventas (IVA)</th><th className={`${TH} text-right`}>Gastos (IVA)</th>
              <th className={`${TH} text-right`}>Resultado</th><th className={TH}>Comentario</th>{canEdit && <th className={TH} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="hover:bg-subtle">
                <td className="border-b border-line px-2 py-1.5 text-sm whitespace-nowrap">{monthLong(r.month)}</td>
                <td className={TD}>{eur0(r.sales)}</td>
                <td className={TD}>
                  {canEdit ? (
                    <ActionForm action={saveExpenseAction} submitLabel="✓" submitClassName="btn btn-ghost btn-sm" className="flex items-center justify-end gap-1 [&>div]:mt-0">
                      <input type="hidden" name="client_id" value={clientId} />
                      <input type="hidden" name="month" value={r.month} />
                      <input type="hidden" name="comment" value={r.comment} />
                      <input name="amount" aria-label={`Gastos de ${monthLong(r.month)}`} inputMode="decimal" defaultValue={plain(r.expenses)} className="field w-28 py-1 text-right font-mono" />
                    </ActionForm>
                  ) : eur0(r.expenses)}
                </td>
                <td className={`${TD} ${r.result !== null && r.result < 0 ? "font-bold" : ""}`}>{r.partial ? "mes parcial" : r.result === null ? "sin dato" : `${r.result >= 0 ? "+" : "−"}${eur0(Math.abs(r.result))}`}</td>
                <td className="border-b border-line px-2 py-1.5 text-sm">{r.comment}</td>
                {canEdit && (
                  <td className="border-b border-line px-2 py-1.5">
                    {r.expenses !== null && (
                      <ActionButton action={deleteExpenseAction} fields={{ client_id: clientId, month: r.month }} confirm={`¿Borrar los gastos de ${monthLong(r.month)}?`} className="btn btn-ghost btn-sm" title="Borrar">
                        <Trash2 size={14} aria-label="Borrar" />
                      </ActionButton>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-bold">Añadir o cambiar un mes (con comentario)</summary>
          <ActionForm action={saveExpenseAction} submitLabel="Guardar mes" resetOnSuccess className="mt-2 grid gap-2 sm:grid-cols-[10rem_10rem_1fr] sm:items-end">
            <input type="hidden" name="client_id" value={clientId} />
            <div><label className="label" htmlFor="exp-month">Mes</label><input id="exp-month" name="month" type="month" required className="field" /></div>
            <div><label className="label" htmlFor="exp-amount">Gastos con IVA (€)</label><input id="exp-amount" name="amount" inputMode="decimal" className="field font-mono" /></div>
            <div><label className="label" htmlFor="exp-comment">Comentario</label><input id="exp-comment" name="comment" maxLength={300} className="field" placeholder="Ej.: pago trimestre" /></div>
          </ActionForm>
        </details>
      )}
    </>
  );
}
