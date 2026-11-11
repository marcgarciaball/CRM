import Link from "next/link";
import type { ReactNode } from "react";
import {
  CAMPAIGN_STATUS_LABEL, CHANNEL_LABEL, DELIVERABLE_STATUS_LABEL, PRIORITY_LABEL, TASK_STATUS_LABEL,
  type CampaignStatus, type Channel, type DeliverableStatus, type Priority, type TaskStatus,
} from "@/lib/labels";

type Tone = "neutral" | "info" | "warn" | "danger" | "ok" | "outline";
const TONE: Record<Tone, string> = {
  neutral: "bg-st-neutral-bg text-st-neutral-fg",
  info: "bg-st-info-bg text-st-info-fg",
  warn: "bg-st-warn-bg text-st-warn-fg",
  danger: "bg-st-danger-bg text-st-danger-fg",
  ok: "bg-st-ok-bg text-st-ok-fg",
  outline: "border border-line text-muted",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[tone]}`}>{children}</span>;
}

export const TONE_CLASS = TONE;
export const DELIVERABLE_TONE: Record<DeliverableStatus, Tone> = {
  idea: "outline", in_preparation: "neutral", in_review: "warn", changes_requested: "danger",
  approved: "info", scheduled: "info", published: "ok",
  waiting_client: "warn", waiting_marketing: "warn", on_hold: "neutral", discarded: "outline",
};
export const DeliverableStatusBadge = ({ status }: { status: DeliverableStatus }) => (
  <Badge tone={DELIVERABLE_TONE[status]}>{DELIVERABLE_STATUS_LABEL[status]}</Badge>
);
const TASK_TONE: Record<TaskStatus, Tone> = { todo: "neutral", in_progress: "info", blocked: "danger", done: "ok" };
export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => <Badge tone={TASK_TONE[status]}>{TASK_STATUS_LABEL[status]}</Badge>;
export const PriorityBadge = ({ priority }: { priority: Priority }) =>
  priority === "medium" ? null : <Badge tone={priority === "high" ? "danger" : "outline"}>Prioridad {PRIORITY_LABEL[priority].toLowerCase()}</Badge>;
export const ChannelBadge = ({ channel }: { channel: Channel }) => <Badge tone="outline">{CHANNEL_LABEL[channel]}</Badge>;
export const CampaignStatusBadge = ({ status }: { status: CampaignStatus }) => (
  <Badge tone={status === "active" ? "info" : status === "completed" ? "ok" : "neutral"}>{CAMPAIGN_STATUS_LABEL[status]}</Badge>
);

/** Cabecera contextual de página con la acción principal. */
export function PageHeader({ title, eyebrow, actions, children }: { title: string; eyebrow?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-xl font-semibold break-words sm:text-2xl">{title}</h1>
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, count, actions, children, id }: { title: string; count?: number; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="card mb-4 scroll-mt-20 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">
          {title}
          {count !== undefined && count > 0 && <span className="ml-2 rounded-pill bg-bg px-2 py-0.5 text-xs font-medium text-muted">{count}</span>}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Bloque secundario plegado: se ve solo cuando hace falta. */
export function Collapsed({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details className="card mb-4 p-4 sm:p-5">
      <summary className="flex items-center justify-between text-[15px] font-semibold">
        <span>{title}{count !== undefined && count > 0 && <span className="ml-2 rounded-pill bg-bg px-2 py-0.5 text-xs font-medium text-muted">{count}</span>}</span>
        <span className="text-xs font-normal text-muted">Mostrar / ocultar</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="py-2 text-sm text-muted">{children}</p>;

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

type Option = { id: string; label: string };
export function SelectField({ label, name, options, value, empty, required, id }: {
  label: string; name: string; options: Option[]; value?: string | null; empty?: string; required?: boolean; id?: string;
}) {
  const fieldId = id ?? `f-${name}`;
  return (
    <Field label={label} htmlFor={fieldId}>
      <select id={fieldId} name={name} defaultValue={value ?? ""} required={required} className="field">
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export const options = <T extends string>(labels: Record<T, string>, order?: readonly T[]): Option[] =>
  (order ?? (Object.keys(labels) as T[])).map((id) => ({ id, label: labels[id] }));

export function Tabs({ tabs, current }: { tabs: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav aria-label="Vistas" className="mb-4 inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-st-neutral-bg p-1">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap ${t.key === current ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Enlace externo: pestaña nueva, sin acceso a window.opener y sin enviar referrer. */
export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className={className ?? "link"}>
      {children}
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}
