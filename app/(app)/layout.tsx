import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { logoutAction } from "@/app/actions/account";
import { MainNav } from "@/components/nav";
import { QuickCreate } from "@/components/quick";
import { isDemo } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/labels";
import { firstClientId, load } from "@/lib/load";
import { campaignOptions } from "@/lib/services/campaigns";
import { listProfiles } from "@/lib/services/core";
import { deliverableOptions } from "@/lib/services/deliverables";
import { listNotices } from "@/lib/services/inbox";

function UserMenu({ name, role }: { name: string; role: "admin" | "member" }) {
  return (
    <details className="relative">
      <summary className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-bg" aria-label={`Menú de ${name}`}>
        <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-highlight text-sm font-semibold">{name.slice(0, 1).toUpperCase()}</span>
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
      </summary>
      <div className="absolute top-full right-0 z-40 mt-1 w-56 rounded-xl border border-line bg-surface p-1 text-sm shadow-lg">
        <p className="px-3 py-1.5 text-xs text-muted">{name} · {ROLE_LABEL[role]}</p>
        <Link href="/perfil" className="block rounded-md px-3 py-2 hover:bg-bg">Perfil</Link>
        {role === "admin" && <Link href="/admin/usuarios" className="block rounded-md px-3 py-2 hover:bg-bg">Administración</Link>}
        <form action={logoutAction}>
          <button type="submit" className="block w-full cursor-pointer rounded-md px-3 py-2 text-left hover:bg-bg">Cerrar sesión</button>
        </form>
      </div>
    </details>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, unread, options } = await load(async (q, user) => {
    const clientId = await firstClientId(q); // TODO(Task 5)
    return {
      unread: (await listNotices(q, user.id, user.role === "admin")).filter((n) => n.unread).length,
      options: {
        me: user.id,
        people: (clientId ? await listProfiles(q, clientId) : []).map((p) => ({ id: p.id, label: p.display_name })), // TODO(Task 5)
        campaigns: (clientId ? await campaignOptions(q, clientId) : []).map((c) => ({ id: c.id, label: c.name })),
        deliverables: (clientId ? await deliverableOptions(q, clientId) : []).map((d) => ({ id: d.id, label: d.title })),
      },
    };
  });
  return (
    <div className="min-h-screen md:pl-56">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-surface md:flex">
        <Link href="/" className="font-brand px-6 pt-5 pb-4 text-[15px] font-medium">Amapola <span className="text-accent">Workspace</span></Link>
        <div className="px-3 pb-3"><QuickCreate options={options} /></div>
        <MainNav variant="sidebar" />
      </aside>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur sm:px-6">
        <Link href="/" className="font-brand mr-1 text-sm font-medium md:hidden">Amapola</Link>
        <form action="/buscar" role="search" className="relative min-w-0 flex-1 md:max-w-md">
          <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <label htmlFor="global-search" className="sr-only">Buscar tareas, entregables, campañas y enlaces</label>
          <input id="global-search" name="q" type="search" required minLength={2} maxLength={100} placeholder="Buscar…" className="field !min-h-9 !rounded-pill !py-1.5 !pl-9" />
        </form>
        <div className="ml-auto flex items-center gap-1">
          <div className="md:hidden"><QuickCreate options={options} compact /></div>
          <Link href="/novedades" className="relative rounded-lg p-2 hover:bg-bg" aria-label={unread > 0 ? `Novedades: ${unread} sin leer` : "Novedades"}>
            <Bell size={19} aria-hidden />
            {unread > 0 && <span aria-hidden className="absolute top-0.5 right-0.5 flex min-w-4.5 items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <UserMenu name={user.display_name} role={user.role} />
        </div>
      </header>
      {isDemo() && (
        <p role="note" className="bg-highlight px-4 py-1 text-center text-xs text-st-warn-fg">
          Demo local con datos ficticios. No es un espacio multiusuario conectado: los datos solo viven en este ordenador.
        </p>
      )}
      <main id="contenido" className="mx-auto max-w-6xl px-4 pt-5 pb-24 sm:px-6 md:pb-10">{children}</main>
      <MainNav variant="bottom" />
    </div>
  );
}
