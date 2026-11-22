import Link from "next/link";
import type { ReactNode } from "react";
import { monthOf, type YearMonth } from "@/lib/dates";
import { campaignPath } from "@/lib/paths";
import type { MonthView } from "@/lib/results/compute";
import { monthLong, monthShort } from "@/lib/results/format";

/**
 * Gráficas de barras por mes en HTML (sin librería): 12 columnas alineadas con las franjas de campañas.
 * Colores de la marca (tinta, naranja, gris) siempre con leyenda; los huecos se ven como «s/d», nunca como cero.
 * Cada barra lleva su cifra en el tooltip (`title`) y la tabla «Mes a mes» da todos los números.
 */
export type Series = { key: string; label: string; swatch: string; value: (m: MonthView) => number | null };

const COLS = "grid grid-cols-12 gap-x-1.5";
const FRAME = "min-w-[640px]";

export function Legend({ series }: { series: Pick<Series, "key" | "label" | "swatch">[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5"><span aria-hidden className={`inline-block size-3 ${s.swatch}`} />{s.label}</li>
      ))}
    </ul>
  );
}

function MonthAxis({ months }: { months: MonthView[] }) {
  return (
    <div className={`${COLS} mt-1 border-t border-ink pt-1`}>
      {months.map((m) => (
        <span key={m.month} className="text-center font-mono text-[11px] text-muted uppercase">{monthShort(m.month)}</span>
      ))}
    </div>
  );
}

/** Marca de un mes sin datos para esta gráfica. */
const NoData = () => (
  <div className="flex h-full items-end justify-center">
    <span className="w-full border border-dashed border-muted py-0.5 text-center font-mono text-[10px] text-muted">s/d</span>
  </div>
);

/**
 * Barras agrupadas (una por serie) o apiladas. `hasData` decide si el mes es «s/d».
 * Un mes parcial lleva borde discontinuo y la etiqueta «parcial».
 */
export function MonthBars({ months, series, stacked, format, hasData, height = 160, label }: {
  months: MonthView[]; series: Series[]; stacked?: boolean; format: (n: number | null) => string;
  hasData: (m: MonthView) => boolean; height?: number; label: string;
}) {
  const totals = months.map((m) => {
    const vals = series.map((s) => Math.max(0, s.value(m) ?? 0));
    return stacked ? vals.reduce((a, b) => a + b, 0) : Math.max(0, ...vals);
  });
  const max = Math.max(0, ...totals) || 1;
  const pctOf = (v: number) => `${(Math.max(0, v) / max) * 100}%`;
  const tooltip = (m: MonthView) =>
    [monthLong(m.month), ...series.map((s) => `${s.label}: ${format(s.value(m))}`), m.state === "partial" ? "(mes parcial)" : ""]
      .filter(Boolean).join(" · ");
  return (
    <figure className="overflow-x-auto">
      <div className={FRAME} role="img" aria-label={`${label}. Las cifras de cada mes están en la tabla «Mes a mes».`}>
        <div className="relative" style={{ height }}>
          {[0.5, 1].map((f) => (
            <div key={f} aria-hidden className="absolute inset-x-0 border-t border-line" style={{ bottom: `${f * 100}%` }}>
              <span className="absolute right-0 -top-4 bg-surface pl-1 font-mono text-[10px] text-muted">{format(max * f)}</span>
            </div>
          ))}
          <div className={`${COLS} relative h-full`}>
            {months.map((m) => {
              if (m.state === "future") return <div key={m.month} />;
              if (!hasData(m)) return <NoData key={m.month} />;
              const partial = m.state === "partial";
              const box = (s: Series, h: string): ReactNode => (
                <div key={s.key} className={`${s.swatch} ${partial ? "border border-dashed border-ink opacity-60" : ""}`} style={{ height: h }} />
              );
              return (
                <div key={m.month} title={tooltip(m)} className="relative flex h-full flex-col justify-end hover:bg-subtle">
                  {partial && <span className="absolute -top-0.5 inset-x-0 text-center font-mono text-[9px] text-muted">parcial</span>}
                  {stacked ? (
                    <div className="flex flex-col-reverse gap-0.5">
                      {series.filter((s) => (s.value(m) ?? 0) > 0).map((s) => box(s, `${((s.value(m) ?? 0) / max) * height}px`))}
                    </div>
                  ) : (
                    <div className="flex h-full items-end gap-0.5">
                      {series.map((s) => (
                        <div key={s.key} className="flex h-full flex-1 items-end">{box(s, pctOf(s.value(m) ?? 0))}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <MonthAxis months={months} />
      </div>
    </figure>
  );
}

export type CampaignBand = { id: string; client_id: string; name: string; start_date: string | null; end_date: string | null };

/** Campañas del CRM como franjas sobre los mismos 12 meses, con enlace a su ficha. */
export function CampaignBands({ months, campaigns }: { months: YearMonth[]; campaigns: CampaignBand[] }) {
  const first = months[0];
  const last = months.at(-1)!;
  const rows = campaigns.flatMap((c) => {
    const a = monthOf(c.start_date ?? c.end_date!);
    const b = monthOf(c.end_date ?? c.start_date!);
    if (b < first || a > last) return [];
    const from = a < first ? 0 : months.indexOf(a);
    const to = b > last ? months.length - 1 : months.indexOf(b);
    return [{ c, from, to }];
  });
  if (rows.length === 0) return <p className="mt-2 text-xs text-muted">No hay campañas del CRM con fechas en este periodo.</p>;
  return (
    <div className="overflow-x-auto">
      <div className={FRAME}>
        <p className="mt-3 mb-1 text-xs font-bold">Campañas del CRM en estas fechas</p>
        <ul className="space-y-1">
          {rows.map(({ c, from, to }) => (
            <li key={c.id} className={COLS}>
              <Link href={campaignPath(c)} title={c.name}
                className="truncate border border-ink bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink hover:underline"
                style={{ gridColumn: `${from + 1} / ${to + 2}` }}>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
