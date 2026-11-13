"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Building2, CalendarDays, Home, LayoutDashboard, Link2, ListChecks, Megaphone } from "lucide-react";
import { clientPath } from "@/lib/paths";

const itemsFor = (clientId?: string) => clientId
  ? [
    { href: clientPath(clientId), label: "Resumen", icon: LayoutDashboard },
    { href: clientPath(clientId, "calendario"), label: "Calendario", icon: CalendarDays },
    { href: clientPath(clientId, "trabajo"), label: "Trabajo", icon: ListChecks },
    { href: clientPath(clientId, "campanas"), label: "Campañas", icon: Megaphone },
    { href: clientPath(clientId, "recursos"), label: "Recursos", icon: Link2 },
  ]
  : [
    { href: "/", label: "Inicio", icon: Home },
    { href: "/clientes", label: "Clientes", icon: Building2 },
  ];

/**
 * Navegación principal: barra lateral en escritorio, barra inferior en móvil. Dentro de un cliente, sus
 * secciones; fuera, el inicio y la lista de clientes.
 */
export function MainNav({ variant, clientId }: { variant: "sidebar" | "bottom"; clientId?: string }) {
  const pathname = usePathname();
  const items = itemsFor(clientId);
  // El primer elemento (inicio o resumen del cliente) solo está activo en su ruta exacta.
  const isActive = (href: string) => (href === items[0].href ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  if (variant === "bottom") {
    return (
      <nav aria-label="Principal" className={`fixed inset-x-0 bottom-0 z-30 grid border-t-2 border-ink bg-surface pb-[env(safe-area-inset-bottom)] md:hidden ${items.length === 5 ? "grid-cols-5" : "grid-cols-2"}`}>
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive(href) ? "font-bold text-ink" : "text-muted"}`}>
            <span className={`px-3 py-0.5 ${isActive(href) ? "bg-accent text-accent-ink" : ""}`}><Icon size={18} aria-hidden /></span>
            {label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5 px-3">
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
          className={`flex items-center gap-2.5 px-3 py-2 text-sm ${isActive(href) ? "bg-accent font-bold text-accent-ink" : "text-white hover:bg-white/10"}`}>
          <Icon size={17} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** La navegación del marco común: toma el cliente de la URL (`/c/<cliente>/…`), si lo hay. */
export function AppNav({ variant }: { variant: "sidebar" | "bottom" }) {
  const { client } = useParams<{ client?: string }>();
  return <MainNav variant={variant} clientId={typeof client === "string" ? client : undefined} />;
}
