import Link from "next/link";
import { Settings } from "lucide-react";
import { QuickCreate } from "@/components/quick";
import { CLIENT_ROLE_LABEL } from "@/lib/labels";
import { loadClient } from "@/lib/load";
import { clientPath } from "@/lib/paths";
import { campaignOptions } from "@/lib/services/campaigns";
import { listProfiles } from "@/lib/services/core";
import { deliverableOptions } from "@/lib/services/deliverables";

/**
 * Marco de un cliente: su nombre, sus ajustes, el botón «Crear» con sus opciones (se abre solo con `quickCreatePath`) y,
 * si está archivado, el aviso de solo lectura.
 * Queda fuera de `loading.tsx` a propósito: si el cliente no existe o no es de la persona, responde 404 antes de empezar a enviar la página.
 */
export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ client: string }> }) {
  const { client: clientParam } = await params;
  const { client, options } = await loadClient(clientParam, async (q, user, client) => ({
    options: client.archived_at ? null : {
      clientId: client.id,
      me: user.id,
      people: (await listProfiles(q, client.id)).map((p) => ({ id: p.id, label: p.display_name })),
      campaigns: (await campaignOptions(q, client.id)).map((c) => ({ id: c.id, label: c.name })),
      deliverables: (await deliverableOptions(q, client.id)).map((d) => ({ id: d.id, label: d.title })),
    },
  }));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-extrabold tracking-tight uppercase">{client.name}</span>
          <span className="font-mono text-xs text-muted uppercase"> · {CLIENT_ROLE_LABEL[client.my_role]}</span>
        </p>
        <Link href={clientPath(client.id, "ajustes")} className="btn btn-ghost btn-sm"><Settings size={15} aria-hidden /> Ajustes</Link>
        {options && <QuickCreate options={options} compact />}
      </div>
      {client.archived_at && (
        <p role="note" className="mb-4 border border-ink bg-st-warn-bg px-3 py-2 text-sm font-semibold text-st-warn-fg">Cliente archivado: solo lectura</p>
      )}
      {children}
    </>
  );
}
