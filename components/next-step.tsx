import { transitionDeliverableAction } from "@/app/actions/work";
import { formatDate, formatInstant } from "@/lib/dates";
import { DELIVERABLE_STATUS_LABEL, DELIVERABLE_TRANSITIONS, type DeliverableStatus } from "@/lib/labels";
import type { Deliverable } from "@/lib/services/deliverables";
import { ActionButton, ActionForm } from "./action-form";
import { DeliverableStatusBadge } from "./ui";

const STEPS = ["Preparación", "Revisión", "Validado", "Programado", "Publicado"];
// Aparcado o descartado: no está en ninguna fase (-1).
const STEP_OF: Record<DeliverableStatus, number> = {
  idea: 0, in_preparation: 0, changes_requested: 0, in_review: 1, approved: 2, scheduled: 3, published: 4,
  waiting_client: -1, waiting_marketing: -1, on_hold: -1, discarded: -1,
};
const PARKED_MESSAGE: Partial<Record<DeliverableStatus, string>> = {
  waiting_client: "Parado hasta que el cliente envíe el material que falta.",
  waiting_marketing: "Parado hasta que marketing haga su parte.",
  on_hold: "En pausa por ahora.",
};

function DateAction({ d, to, label, today }: { d: Deliverable; to: "scheduled" | "published"; label: string; today: string }) {
  const published = to === "published";
  return (
    <ActionForm action={transitionDeliverableAction} submitLabel={label} submitClassName="btn btn-accent" className="flex flex-wrap items-end gap-2 [&>div:last-child]:mt-0">
      <input type="hidden" name="id" value={d.id} />
      <input type="hidden" name="to" value={to} />
      <div>
        <label className="label" htmlFor={`date-${to}`}>{published ? "¿Qué día se publicó?" : "¿Para qué día?"}</label>
        <input id={`date-${to}`} type="date" required name={published ? "published_on" : "planned_date"} defaultValue={published ? today : d.planned_date ?? ""} className="field" />
      </div>
    </ActionForm>
  );
}

/**
 * Un solo paso siguiente, claro para quien lo mira. El resto de cambios posibles
 * queda en «Otras opciones». Las reglas las hace cumplir la base de datos.
 */
export function NextStep({ d, isAdmin, today }: { d: Deliverable; isAdmin: boolean; today: string }) {
  const step = STEP_OF[d.status];
  const go = (to: DeliverableStatus, label: string, primary = true) => (
    <ActionButton action={transitionDeliverableAction} fields={{ id: d.id, to }} className={primary ? "btn btn-accent" : "btn btn-secondary"}>{label}</ActionButton>
  );
  const approvalCurrent = d.approved_revision !== null && d.approved_revision === d.revision;
  let message: string, action: React.ReactNode = null, shown: DeliverableStatus[] = [];
  switch (d.status) {
    case "idea":
    case "in_preparation":
      message = "Cuando el copy y los materiales estén listos, pide la revisión.";
      action = go("in_review", "Pedir revisión"); shown = ["in_review"];
      break;
    case "changes_requested":
      message = "Se han pedido cambios. Corrígelos y vuelve a pedir la revisión.";
      action = go("in_review", "Pedir revisión de nuevo"); shown = ["in_review"];
      break;
    case "in_review":
      if (isAdmin) {
        message = "Revisa el copy, la creatividad y los materiales. Si está bien, valídalo.";
        action = <>{go("approved", "Validar")}{go("changes_requested", "Pedir cambios", false)}</>; shown = ["approved", "changes_requested"];
      } else {
        message = "Esperando la validación. No tienes que hacer nada más.";
      }
      break;
    case "approved":
      message = `Validado por ${d.approved_by_name ?? "la propiedad del cliente"}. Regístralo como programado cuando lo dejes preparado.`;
      action = <DateAction d={d} to="scheduled" label="Marcar como programado" today={today} />; shown = ["scheduled"];
      break;
    case "scheduled":
      message = `Programado para el ${formatDate(d.planned_date, today)}. Cuando salga, regístralo como publicado.`;
      action = <DateAction d={d} to="published" label="Marcar como publicado" today={today} />; shown = ["published"];
      break;
    case "waiting_client":
    case "waiting_marketing":
    case "on_hold":
      if (approvalCurrent) {
        message = `${PARKED_MESSAGE[d.status]} Sigue validado: cuando se desbloquee, puede continuar donde estaba.`;
        action = <>{go("approved", "Retomar como validado")}{go("in_preparation", "Volver a preparación", false)}</>; shown = ["approved", "in_preparation"];
      } else {
        message = `${PARKED_MESSAGE[d.status]} Cuando se desbloquee, retoma la preparación.`;
        action = go("in_preparation", "Retomar la preparación"); shown = ["in_preparation"];
      }
      break;
    case "discarded":
      message = "Descartado: no se va a publicar. Se conserva con todo su contenido por si hay que recuperarlo.";
      action = go("in_preparation", "Recuperar", false); shown = ["in_preparation"];
      break;
    default:
      message = `Publicado el ${formatDate(d.published_on, today)}. Si cambias el copy o un material aprobado, se crea una revisión nueva que hay que volver a aprobar; el historial de publicación se conserva.`;
  }
  const others = DELIVERABLE_TRANSITIONS[d.status].filter((t) => !shown.includes(t.to) && !(t.adminOnly && !isAdmin) && !(t.needsApproval && !approvalCurrent));
  const staleApproval = d.approved_revision !== null && d.approved_revision !== d.revision;
  return (
    <section className="card mb-4 p-4 sm:p-5" aria-label="Estado y siguiente paso">
      <ol className="mb-4 flex gap-1" aria-label="Fases">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <div className={`h-1.5 rounded-pill ${i < step ? "bg-accent" : i === step ? "bg-ink" : "bg-st-neutral-bg"}`} />
            <span className={`mt-1 block text-xs ${i === step ? "font-semibold" : "text-muted"} ${i === step ? "" : "hidden sm:block"}`}>{s}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <DeliverableStatusBadge status={d.status} />
        <p className="text-sm">{message}</p>
      </div>
      {staleApproval && (
        <p className="mt-2 rounded-lg bg-st-warn-bg px-3 py-2 text-sm text-st-warn-fg">
          El contenido ha cambiado desde la última validación ({d.approved_by_name ?? "la propiedad del cliente"}, {formatInstant(d.approved_at!)}), así que necesita validarse de nuevo.
        </p>
      )}
      {action && <div className="mt-3 flex flex-wrap items-end gap-2">{action}</div>}
      {others.length > 0 && (
        <details className="mt-3">
          <summary className="more">Otras opciones</summary>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {others.map((t) => t.to === "published"
              ? <DateAction key={t.to} d={d} to="published" label={t.label} today={today} />
              : t.to === "discarded"
                ? <ActionButton key={t.to} action={transitionDeliverableAction} fields={{ id: d.id, to: t.to }} confirm={`¿Descartar este entregable? Pasará a «${DELIVERABLE_STATUS_LABEL.discarded}» y dejará de contar como pendiente. Se puede recuperar.`}>{t.label}</ActionButton>
                : <ActionButton key={t.to} action={transitionDeliverableAction} fields={{ id: d.id, to: t.to }}>{t.label}</ActionButton>)}
          </div>
        </details>
      )}
    </section>
  );
}
