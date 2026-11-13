import type { Metadata } from "next";
import Link from "next/link";
import { AddLinkForm } from "@/components/add-link-form";
import { FilterBar } from "@/components/filter-bar";
import { UsageList } from "@/components/materials";
import { Badge, Empty, ExternalLink, PageHeader, Section, options } from "@/components/ui";
import { formatInstant } from "@/lib/dates";
import { CATEGORIES, CATEGORY_LABEL, personName } from "@/lib/labels";
import { loadClient } from "@/lib/load";
import { resourcePath } from "@/lib/paths";
import { enumParam, one, uuidParam, type SearchParams } from "@/lib/params";
import { campaignOptions } from "@/lib/services/campaigns";
import { listResources, usagesFor } from "@/lib/services/resources";

export const metadata: Metadata = { title: "Recursos" };

export default async function ResourcesPage({ params, searchParams }: { params: Promise<{ client: string }>; searchParams: SearchParams }) {
  const sp = await searchParams;
  const { resources, usages, campaigns, client } = await loadClient((await params).client, async (q, _user, client) => {
    const resources = await listResources(q, { client: client.id, search: one(sp.q)?.slice(0, 200), category: enumParam(sp.categoria, CATEGORIES), campaign: uuidParam(sp.campana) });
    return { resources, usages: await usagesFor(q, resources.map((r) => r.id)), campaigns: await campaignOptions(q, client.id) };
  });
  return (
    <>
      <PageHeader title="Recursos" eyebrow={`Todos los enlaces de ${client.name}`} />
      {!client.archived_at && (
        <Section id="nuevo" title="Nuevo enlace">
          <p className="text-sm text-muted">Aquí se crea como recurso general. Para asociarlo a un trabajo, añádelo desde la campaña, el entregable o la tarea: es el mismo registro.</p>
          <AddLinkForm clientId={client.id} idPrefix="library" />
        </Section>
      )}
      <FilterBar search={{ name: "q", label: "Buscar por título o URL" }} filters={[
        { name: "categoria", label: "Categoría", options: options(CATEGORY_LABEL, CATEGORIES) },
        { name: "campana", label: "Campaña", options: campaigns.map((c) => ({ id: c.id, label: c.name })) },
      ]} />
      <div className="border-y border-ink">
        {resources.length === 0 ? <div className="py-2"><Empty>No hay recursos con estos filtros.</Empty></div> : (
          <ul>
            {resources.map((r) => {
              const mine = usages.filter((u) => u.resource_id === r.id);
              return (
                <li key={r.id} className="border-b border-line py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ExternalLink href={r.url} className="link font-medium break-all">{r.title}</ExternalLink>
                    <Badge tone="outline">{CATEGORY_LABEL[r.category]}</Badge>
                    <Link href={resourcePath(r)} className="link ml-auto text-xs">{client.archived_at ? "Ver" : "Editar"}</Link>
                  </div>
                  {r.description && <p className="mt-1 text-sm">{r.description}</p>}
                  <p className="mt-1 font-mono text-xs break-all text-muted">{r.url.replace(/^https?:\/\//, "").slice(0, 100)}</p>
                  <p className="mt-1 text-xs text-muted">
                    Añadido por {personName(r.created_by, r.created_by_name, "alguien")} el <span className="font-mono">{formatInstant(r.created_at)}</span> · {mine.length === 0 ? "Recurso general (sin asociar)" : <UsageList usages={mine} clientId={client.id} />}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
