import type { MonthView } from "@/lib/results/compute";
import { eur0, eur, int, monthLong, monthSpan, pct } from "@/lib/results/format";
import type { MetaCampaign } from "@/lib/services/results";

const TH = "border-b border-ink px-2 py-1.5 text-left font-mono text-[11px] font-medium text-muted uppercase";
const TD = "border-b border-line px-2 py-1.5 font-mono text-[13px] whitespace-nowrap";
const NUM = `${TD} text-right`;

/** Campañas de Meta del periodo. Las compras son las que cuenta Meta, no pedidos de Shopify. */
export function MetaCampaignsTable({ campaigns }: { campaigns: MetaCampaign[] }) {
  if (campaigns.length === 0) return <p className="py-2 text-sm text-muted">No hay campañas de Meta en este periodo.</p>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>Campaña</th><th className={TH}>Meses</th><th className={`${TH} text-right`}>Gasto</th>
              <th className={`${TH} text-right`}>Clics</th><th className={`${TH} text-right`}>Compras (Meta)*</th>
              <th className={`${TH} text-right`}>Coste por compra</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.campaign_name} className="hover:bg-subtle">
                <td className="border-b border-line px-2 py-1.5 text-sm">{c.campaign_name}</td>
                <td className={TD}>{monthSpan(c.months)}</td>
                <td className={NUM}>{eur(c.spend)}</td>
                <td className={NUM}>{int(c.clicks)}</td>
                <td className={NUM}>{int(c.purchases)}</td>
                <td className={NUM}>{c.spend !== null && c.purchases ? eur(c.spend / c.purchases) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">* Compras que cuenta Meta; no son pedidos de Shopify y suelen ser bastantes más.</p>
    </>
  );
}

/** Todas las cifras del periodo, mes a mes. Es también la versión en tabla de las gráficas. */
export function MonthlyTable({ months, id }: { months: MonthView[]; id?: string }) {
  const rows = months.filter((m) => m.state !== "future");
  if (rows.length === 0) return <p className="py-2 text-sm text-muted">Este periodo aún no ha empezado.</p>;
  return (
    <div className="overflow-x-auto" id={id}>
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr>
            {["Mes", "Ventas totales", "Mismo mes año anterior", "Descuentos", "% desc.", "Pedidos", "Conversión", "Gasto Meta", "Gasto / ventas"].map((h, i) => (
              <th key={h} className={`${TH} ${i > 0 ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const m = v.m;
            const spend = v.meta?.spend ?? null;
            const discount = m?.descuentos == null ? null : Math.abs(m.descuentos);
            return (
              <tr key={v.month} className="hover:bg-subtle">
                <td className="border-b border-line px-2 py-1.5 text-sm whitespace-nowrap">
                  {monthLong(v.month)}
                  {v.state === "partial" && <span className="ml-1 font-mono text-[11px] text-muted">{v.data_until ? `parcial (hasta el ${Number(v.data_until.slice(8))})` : "en curso"}</span>}
                </td>
                <td className={NUM}>{eur0(m?.ventas_totales ?? null)}</td>
                <td className={`${NUM} text-muted`}>{eur0(v.prev?.ventas_totales ?? null)}</td>
                <td className={NUM}>{eur0(discount)}</td>
                <td className={NUM}>{discount !== null && m?.ventas_brutas ? pct(discount / m.ventas_brutas) : "—"}</td>
                <td className={NUM}>{int(m?.pedidos ?? null)}</td>
                <td className={NUM}>{m?.sesiones && m.sesiones_compra !== null ? pct(m.sesiones_compra / m.sesiones) : "—"}</td>
                <td className={NUM}>{eur0(spend)}</td>
                <td className={NUM}>{spend !== null && m?.ventas_totales ? pct(spend / m.ventas_totales) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
