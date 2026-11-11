import type { Metadata } from "next";
import Link from "next/link";
import { AddLinkForm } from "@/components/add-link-form";
import { FilterBar } from "@/components/filter-bar";
import { UsageList } from "@/components/materials";
import { Badge, Empty, ExternalLink, PageHeader, Section, options } from "@/components/ui";
import { formatInstant } from "@/lib/dates";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/labels";
import { firstClientId, load } from "@/lib/load";
import { enumParam, one, uuidParam, type SearchParams } from "@/lib/params";
import { campaignOptions } from "@/lib/services/campaigns";
import { listResources, usagesFor } from "@/lib/services/resources";

export const metadata: Metadata = { title: "Recursos" };

export default async function ResourcesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { resources, usages, campaigns } = await load(async (q) => {
    const resources = await listResources(q, { search: one(sp.q)?.slice(0, 200), category: enumParam(sp.categoria, CATEGORIES), campaign: uuidParam(sp.campana) });
    const clientId = await firstClientId(q); // TODO(Task 5)
    return { resources, usages: await usagesFor(q, resources.map((r) => r.id)), campaigns: clientId ? await campaignOptions(q, clientId) : [] };
  });
  return (
    <>
      <PageHeader title="Recursos" eyebrow="Todos los enlaces del equipo" />
      <Section id="nuevo" title="Nuevo enlace">
        <p className="text-sm text-muted">Aquí se crea como recurso general. Para asociarlo a un trabajo, añádelo desde la campaña, el entregable o la tarea: es el mismo registro.</p>
        <AddLinkForm idPrefix="library" />
      </Section>
      <FilterBar search={{ name: "q", label: "Buscar por título o URL" }} filters={[
        { name: "categoria", label: "Categoría", options: options(CATEGORY_LABEL, CATEGORIES) },
        { name: "campana", label: "Campaña", options: campaigns.map((c) => ({ id: c.id, label: c.name })) },
      ]} />
      <div className="card px-4">
        {resources.length === 0 ? <div className="py-4"><Empty>No hay recursos con estos filtros.</Empty></div> : (
          <ul>
            {resources.map((r) => {
              const mine = usages.filter((u) => u.resource_id === r.id);
              return (
                <li key={r.id} className="border-b border-line py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ExternalLink href={r.url} className="link font-medium break-all">{r.title}</ExternalLink>
                    <Badge tone="outline">{CATEGORY_LABEL[r.category]}</Badge>
                    <Link href={`/recursos/${r.id}`} className="ml-auto text-xs text-accent underline">Editar</Link>
                  </div>
                  {r.description && <p className="mt-1 text-sm">{r.description}</p>}
                  <p className="mt-1 text-xs break-all text-muted">{r.url.replace(/^https?:\/\//, "").slice(0, 100)}</p>
                  <p className="mt-1 text-xs text-muted">
                    Añadido por {r.created_by_name ?? "alguien"} el {formatInstant(r.created_at)} · {mine.length === 0 ? "Recurso general (sin asociar)" : <UsageList usages={mine} />}
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
