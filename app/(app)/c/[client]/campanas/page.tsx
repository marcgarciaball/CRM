import type { Metadata } from "next";
import Link from "next/link";
import { CampaignStatusBadge, Empty, PageHeader } from "@/components/ui";
import { formatDate, todayMadrid } from "@/lib/dates";
import { personName } from "@/lib/labels";
import { loadClient } from "@/lib/load";
import { campaignPath, clientPath } from "@/lib/paths";
import { one, type SearchParams } from "@/lib/params";
import { ProgressBar } from "@/components/progress";
import { listCampaigns } from "@/lib/services/campaigns";

export const metadata: Metadata = { title: "Campañas" };

export default async function CampaignsPage({ params, searchParams }: { params: Promise<{ client: string }>; searchParams: SearchParams }) {
  const archived = one((await searchParams).archivo) === "1";
  const { campaigns, client } = await loadClient((await params).client, async (q, _user, client) => ({
    campaigns: await listCampaigns(q, { archived, client: client.id }),
  }));
  const base = clientPath(client.id, "campanas");
  const today = todayMadrid();
  return (
    <>
      <PageHeader title={archived ? "Campañas archivadas" : "Campañas"} actions={!client.archived_at && <Link href={clientPath(client.id, "campanas", "nueva")} className="btn btn-primary">Nueva campaña</Link>} />
      {campaigns.length === 0 ? (
        <div className="border-y border-ink py-2"><Empty>{archived ? "No hay campañas archivadas." : "Aún no hay campañas. Crea la primera o usa la plantilla de newsletter."}</Empty></div>
      ) : (
        <ul className="border-t-2 border-ink">
          {campaigns.map((c) => (
            <li key={c.id} className="grid gap-x-8 gap-y-3 border-b border-line py-4 md:grid-cols-[minmax(0,1fr)_16rem] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={campaignPath(c)} className="text-lg font-extrabold tracking-tight hover:underline">{c.name}</Link>
                  <CampaignStatusBadge status={c.status} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  <span className="font-mono">{c.start_date || c.end_date ? `${formatDate(c.start_date, today)} → ${formatDate(c.end_date, today)}` : "Sin fechas"}</span> · {personName(c.owner_id, c.owner_name, "Sin responsable")}
                </p>
                {c.objective && <p className="mt-2 text-sm">{c.objective}</p>}
              </div>
              <ProgressBar c={c} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm"><Link href={archived ? base : `${base}?archivo=1`} className="link">{archived ? "Volver a las campañas activas" : "Ver archivadas"}</Link></p>
    </>
  );
}
