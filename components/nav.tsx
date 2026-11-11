"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Link2, ListChecks, Megaphone } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/trabajo", label: "Trabajo", icon: ListChecks },
  { href: "/campanas", label: "Campañas", icon: Megaphone },
  { href: "/recursos", label: "Recursos", icon: Link2 },
];

/** Navegación principal: barra lateral en escritorio, barra inferior en móvil. */
export function MainNav({ variant }: { variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  if (variant === "bottom") {
    return (
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive(href) ? "font-semibold text-ink" : "text-muted"}`}>
            <span className={`rounded-pill px-3 py-0.5 ${isActive(href) ? "bg-highlight" : ""}`}><Icon size={18} aria-hidden /></span>
            {label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5 px-3">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive(href) ? "bg-highlight font-semibold text-ink" : "text-ink/80 hover:bg-bg hover:text-ink"}`}>
          <Icon size={17} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
