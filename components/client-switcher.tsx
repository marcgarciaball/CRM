"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useRef } from "react";
import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import { newClientPath, swapClient } from "@/lib/paths";

/**
 * Selector de cliente: cambia a la misma sección de otro cliente (`swapClient`), o va a todos los clientes o a
 * crear uno. Sin `currentId`, el cliente actual sale de la URL (`/c/<cliente>/…`). `tone="dark"`: sobre la barra
 * lateral negra.
 */
export function ClientSwitcher({ clients, currentId, tone = "light" }: {
  clients: { id: string; name: string }[]; currentId?: string; tone?: "light" | "dark";
}) {
  const pathname = usePathname();
  const params = useParams<{ client?: string }>();
  const ref = useRef<HTMLDetailsElement>(null);
  const current = currentId ?? (typeof params.client === "string" ? params.client : undefined);
  // La lista solo trae los clientes activos: dentro de uno archivado, se dice así.
  const label = clients.find((c) => c.id === current)?.name ?? (current ? "Cliente archivado" : "Todos los clientes");
  const close = () => ref.current?.removeAttribute("open");
  const item = "flex items-center gap-2 px-3 py-2 hover:bg-subtle";
  return (
    <details ref={ref} className="relative min-w-0">
      <summary aria-label={`Cliente: ${label}. Cambiar de cliente`}
        className={`flex min-w-0 cursor-pointer items-center gap-2 border px-3 py-1.5 text-sm ${tone === "dark" ? "border-white text-white hover:bg-white/10" : "border-ink text-ink hover:bg-subtle"}`}>
        <span className="min-w-0 flex-1 truncate font-extrabold tracking-tight uppercase">{label}</span>
        <ChevronsUpDown size={15} aria-hidden className="shrink-0" />
      </summary>
      <div className="absolute top-full left-0 z-40 mt-1 max-h-[70vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto border border-ink bg-surface p-1 text-sm text-ink">
        <ul aria-label="Clientes">
          {clients.map((c) => (
            <li key={c.id}>
              <Link href={swapClient(pathname, c.id)} onClick={close} aria-current={c.id === current ? "page" : undefined} className={`${item} ${c.id === current ? "font-bold" : ""}`}>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {c.id === current && <Check size={15} aria-hidden />}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-1 border-t border-ink pt-1">
          <Link href="/" onClick={close} className={item}><LayoutGrid size={15} aria-hidden /> Todos los clientes</Link>
          <Link href={newClientPath()} onClick={close} className={item}><Plus size={15} aria-hidden /> Nuevo cliente</Link>
        </div>
      </div>
    </details>
  );
}
