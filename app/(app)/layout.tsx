import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { logoutAction } from "@/app/actions/account";
import { ClientSwitcher } from "@/components/client-switcher";
import { AppNav } from "@/components/nav";
import { QuickCreateMenu } from "@/components/quick";
import { APP_NAME } from "@/lib/brand";
import { isDemo } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/labels";
import { load } from "@/lib/load";
import { listMyClients } from "@/lib/services/clients";
import { listNotices } from "@/lib/services/inbox";

function UserMenu({ name, role }: { name: string; role: "admin" | "member" }) {
  return (
    <details className="relative">
      <summary className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-subtle" aria-label={`Menú de ${name}`}>
        <span aria-hidden className="flex size-8 items-center justify-center bg-ink text-sm font-bold text-white">{name.slice(0, 1).toUpperCase()}</span>
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
      </summary>
      <div className="absolute top-full right-0 z-40 mt-1 w-56 border border-ink bg-surface p-1 text-sm">
        <p className="px-3 py-1.5 text-xs text-muted">{name} · <span className="font-mono uppercase">{ROLE_LABEL[role]}</span></p>
        <Link href="/perfil" className="block px-3 py-2 hover:bg-subtle">Perfil</Link>
        {role === "admin" && <Link href="/admin/usuarios" className="block px-3 py-2 hover:bg-subtle">Administración</Link>}
        <form action={logoutAction}>
          <button type="submit" className="block w-full cursor-pointer px-3 py-2 text-left hover:bg-subtle">Cerrar sesión</button>
        </form>
      </div>
    </details>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Las novedades abarcan todos los clientes de la persona. Dentro de un cliente, su «Crear» y sus datos viven en su marco
  // (`c/[client]/layout`); fuera, «Crear» pregunta en qué cliente. El selector lista los clientes activos.
  const { user, unread, clients } = await load(async (q, user) => ({
    unread: (await listNotices(q, user.id)).filter((n) => n.unread).length,
    clients: (await listMyClients(q)).map((c) => ({ id: c.id, name: c.name })),
  }));
  return (
    <div className="min-h-screen md:pl-56">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:border focus:border-ink focus:bg-surface focus:px-3 focus:py-2 focus:text-ink">
        Saltar al contenido
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col bg-ink text-white md:flex">
        <Link href="/" className="font-brand px-6 pt-5 pb-5 text-[26px] leading-none">{APP_NAME}<span aria-hidden className="text-accent">.</span></Link>
        <div className="space-y-2 px-3 pb-3">
          <ClientSwitcher clients={clients} tone="dark" />
          <QuickCreateMenu clients={clients} />
        </div>
        <AppNav variant="sidebar" />
      </aside>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b-2 border-ink bg-surface px-4 py-2 sm:px-6">
        <Link href="/" className="font-brand mr-1 text-base md:hidden">{APP_NAME}</Link>
        <div className="max-w-40 min-w-0 md:hidden"><ClientSwitcher clients={clients} /></div>
        <form action="/buscar" role="search" className="relative min-w-0 flex-1 md:max-w-md">
          <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <label htmlFor="global-search" className="sr-only">Buscar tareas, entregables, campañas y enlaces</label>
          <input id="global-search" name="q" type="search" required minLength={2} maxLength={100} placeholder="Buscar…" className="field !min-h-9 !py-1.5 !pl-9" />
        </form>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/novedades" className="relative p-2 hover:bg-subtle" aria-label={unread > 0 ? `Novedades: ${unread} sin leer` : "Novedades"}>
            <Bell size={19} aria-hidden />
            {unread > 0 && <span aria-hidden className="absolute top-0.5 right-0.5 flex min-w-4.5 items-center justify-center rounded-sm bg-accent px-1 font-mono text-[10px] font-medium text-accent-ink">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <UserMenu name={user.display_name} role={user.role} />
        </div>
      </header>
      {isDemo() && (
        <p role="note" className="bg-st-warn-bg px-4 py-1 text-center text-xs text-st-warn-fg">
          Demo local con datos ficticios. No es un espacio multiusuario conectado: los datos solo viven en este ordenador.
        </p>
      )}
      <main id="contenido" className="mx-auto max-w-6xl px-4 pt-5 pb-24 sm:px-6 md:pb-10">{children}</main>
      <AppNav variant="bottom" />
    </div>
  );
}
