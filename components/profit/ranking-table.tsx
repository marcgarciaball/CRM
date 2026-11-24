import type { Ranking, RankRow, Tag } from "@/lib/profit/ranking";
import { eur, eur0, int, pct } from "@/lib/results/format";

export const TAG_LABEL: Record<Tag, string> = {
  potenciar: "Potenciar", revisar_precio: "Revisar precio", poco_volumen: "Poco volumen", incompleto: "Incompleto",
};
const TAG_CLASS: Record<Tag, string> = {
  potenciar: "bg-ink text-white", revisar_precio: "bg-st-danger-bg text-st-danger-fg border border-st-danger-fg",
  poco_volumen: "border border-ink", incompleto: "border border-dashed border-muted text-muted",
};

const TH = "border-b border-ink px-2 py-1.5 text-left font-mono text-[11px] font-medium text-muted uppercase";
const TD = "border-b border-line px-2 py-1.5 font-mono text-[13px] whitespace-nowrap text-right";

const name = (r: RankRow) => [r.product.family, r.product.format].filter(Boolean).join(" · ");
const money = (v: number | null, p: number | null) => (v === null ? "—" : `${eur(v)} · ${pct(p)}`);

/** Qué potenciar: margen por unidad, aportación real del periodo y etiqueta. Debajo, lo vendido sin escandallo. */
export function RankingTable({ ranking }: { ranking: Ranking }) {
  if (ranking.rows.length === 0 && ranking.unmatched.length === 0) {
    return <p className="py-2 text-sm text-muted">Añade productos al escandallo e importa las ventas por producto para ver qué potenciar.</p>;
  }
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>Producto</th>
              <th className={`${TH} text-right`}>Uds</th>
              <th className={`${TH} text-right`}>Precio sin IVA</th>
              <th className={`${TH} text-right`}>Margen contribución</th>
              <th className={`${TH} text-right`}>Margen completo</th>
              <th className={`${TH} text-right`}>Aportación real</th>
              <th className={TH}>Etiqueta</th>
            </tr>
          </thead>
          <tbody>
            {ranking.rows.map((r) => (
              <tr key={r.product.id} className="hover:bg-subtle">
                <td className="border-b border-line px-2 py-1.5 text-sm">
                  {name(r)}
                  {r.cost.partial.length > 0 && r.cost.status === "ok" && (
                    <span className="ml-1 font-mono text-[11px] text-muted">{r.cost.partial.map((p) => `sin ${p}`).join(" · ")}</span>
                  )}
                  {r.cost.status === "incomplete" && <span className="ml-1 font-mono text-[11px] text-muted">falta {r.cost.missing.join(", ")}</span>}
                </td>
                <td className={TD}>{int(r.units)}</td>
                <td className={TD}>{r.cost.price_net === null ? "—" : eur(r.cost.price_net)}</td>
                <td className={TD}>{money(r.cost.contribution, r.cost.contribution_pct)}</td>
                <td className={TD}>{money(r.cost.full, r.cost.full_pct)}</td>
                <td className={`${TD} font-bold`}>{r.real_contribution === null ? "—" : eur0(r.real_contribution)}</td>
                <td className="border-b border-line px-2 py-1.5">
                  {r.tag && <span className={`inline-block px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase ${TAG_CLASS[r.tag]}`}>{TAG_LABEL[r.tag]}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Margen de contribución: precio sin IVA menos materiales, comisiones y envío. Margen completo: además, personal y estructura por
        minuto de producción. Aportación real: lo cobrado sin IVA (con descuentos) menos el coste variable de las unidades vendidas.
      </p>
      {ranking.unmatched.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-1 text-sm font-bold">Sin escandallo <span className="font-mono text-xs font-normal text-muted">{ranking.unmatched.length}</span></h3>
          <p className="mb-2 text-xs text-muted">Se venden en Shopify pero ningún producto del escandallo los reconoce. Añádelos con su producto de Shopify y, si hace falta, el texto de la variante.</p>
          <ul className="divide-y divide-line border-y border-line text-sm">
            {ranking.unmatched.slice(0, 30).map((u) => (
              <li key={`${u.product_title}|${u.variant_title}`} className="flex flex-wrap justify-between gap-2 py-1">
                <span>{u.product_title}{u.variant_title && <span className="text-muted"> · {u.variant_title}</span>}</span>
                <span className="font-mono text-[13px]">{int(u.units)} uds · {eur0(u.net_sales)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** Aportación real de los 15 primeros, en barras horizontales (las negativas, en su propio color y con signo). */
export function ContributionBars({ ranking }: { ranking: Ranking }) {
  // Siempre los 15 de mayor aportación, ordene como se ordene la tabla.
  const rows = ranking.rows.filter((r) => r.real_contribution !== null && r.units > 0)
    .sort((a, b) => b.real_contribution! - a.real_contribution!).slice(0, 15);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.real_contribution!))) || 1;
  return (
    <figure aria-label="Aportación real por producto (los 15 primeros)" className="mb-6">
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.product.id} className="grid grid-cols-[minmax(8rem,14rem)_1fr_auto] items-center gap-2 text-xs" title={`${name(r)}: ${eur0(r.real_contribution)}`}>
            <span className="truncate">{name(r)}</span>
            <span className="h-3 bg-subtle">
              <span className={`block h-full ${r.real_contribution! < 0 ? "bg-st-danger-fg" : "bg-ink"}`} style={{ width: `${(Math.abs(r.real_contribution!) / max) * 100}%` }} />
            </span>
            <span className="font-mono">{eur0(r.real_contribution)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
