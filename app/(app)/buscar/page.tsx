import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, ExternalLink, PageHeader } from "@/components/ui";
import { load } from "@/lib/load";
import { one, type SearchParams } from "@/lib/params";
import { campaignPath, clientPath, deliverablePath, resourcePath, taskPath } from "@/lib/paths";
import { searchAll, type SearchHit } from "@/lib/services/inbox";

export const metadata: Metadata = { title: "Buscar" };
const LABEL = { task: "Tarea", deliverable: "Entregable", campaign: "Campaña", resource: "Enlace" } as const;
const PATH = { task: taskPath, deliverable: deliverablePath, campaign: campaignPath, resource: resourcePath } as const;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const term = (one((await searchParams).q) ?? "").trim().slice(0, 100);
  const { hits } = await load(async (q) => ({ hits: term.length >= 2 ? await searchAll(q, term) : ([] as SearchHit[]) }));
  return (
    <div className="max-w-3xl">
      <PageHeader title={term ? `Resultados para «${term}»` : "Buscar"} />
      <div className="border-y border-ink">
        {hits.length === 0 ? (
          <div className="py-2"><Empty>{term.length >= 2 ? "No se ha encontrado nada. Prueba con otra palabra." : "Escribe al menos dos letras en el buscador de arriba."}</Empty></div>
        ) : (
          <ul>
            {hits.map((h) => (
              <li key={`${h.type}-${h.id}`} className="flex flex-wrap items-center gap-2 border-b border-line py-2.5 last:border-b-0">
                <Badge tone="outline">{LABEL[h.type]}</Badge>
                <Link href={PATH[h.type](h)} className="font-medium hover:underline">{h.title}</Link>
                <Link href={clientPath(h.client_id)} className="text-[13px] text-muted hover:underline">{h.client_name}</Link>
                {h.url && <ExternalLink href={h.url} className="link text-[13px]">Abrir enlace</ExternalLink>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
