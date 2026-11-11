import { campaignProgress, type Campaign } from "@/lib/services/campaigns";

export function ProgressBar({ c }: { c: Campaign }) {
  const p = campaignProgress(c);
  return (
    <div>
      <div className="h-1.5 w-full bg-st-neutral-bg" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done} aria-label="Progreso de la campaña">
        <div className="h-full bg-accent" style={{ width: `${p.percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        {p.total === 0 ? "Sin tareas ni entregables todavía" :
          `${p.done} de ${p.total} completados: ${c.tasks_done}/${c.tasks_total} tareas hechas y ${c.deliverables_published}/${c.deliverables_total} entregables publicados`}
      </p>
    </div>
  );
}

