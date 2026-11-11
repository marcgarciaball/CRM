import type { Metadata } from "next";
import Link from "next/link";
import { CampaignStatusBadge, Empty, PageHeader } from "@/components/ui";
import { formatDate, todayMadrid } from "@/lib/dates";
import { load } from "@/lib/load";
import { one, type SearchParams } from "@/lib/params";
import { ProgressBar } from "@/components/progress";
import { listCampaigns } from "@/lib/services/campaigns";

export const metadata: Metadata = { title: "Campañas" };

export default async function CampaignsPage({ searchParams }: { searchParams: SearchParams }) {
  const archived = one((await searchParams).archivo) === "1";
  const { campaigns } = await load(async (q) => ({ campaigns: await listCampaigns(q, { archived }) }));
  const today = todayMadrid();
  return (
    <>
      <PageHeader title={archived ? "Campañas archivadas" : "Campañas"} actions={<Link href="/campanas/nueva" className="btn btn-primary">Nueva campaña</Link>} />
      {campaigns.length === 0 ? (
        <div className="card p-4"><Empty>{archived ? "No hay campañas archivadas." : "Aún no hay campañas. Crea la primera o usa la plantilla de newsletter."}</Empty></div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {campaigns.map((c) => (
            <li key={c.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/campanas/${c.id}`} className="font-brand font-medium hover:underline">{c.name}</Link>
                <CampaignStatusBadge status={c.status} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {c.start_date || c.end_date ? `${formatDate(c.start_date, today)} → ${formatDate(c.end_date, today)}` : "Sin fechas"} · {c.owner_name ?? "Sin responsable"}
              </p>
              {c.objective && <p className="mt-2 text-sm">{c.objective}</p>}
              <div className="mt-3"><ProgressBar c={c} /></div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm"><Link href={archived ? "/campanas" : "/campanas?archivo=1"} className="link">{archived ? "Volver a las campañas activas" : "Ver archivadas"}</Link></p>
    </>
  );
}
