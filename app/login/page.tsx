import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { demoLoginAction, loginAction, requestPasswordResetAction, signInWithGoogleAction } from "@/app/actions/account";
import { ActionForm } from "@/components/action-form";
import { getSessionUserId } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";
import { getDriver, isDemo } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/labels";
import { one, type SearchParams } from "@/lib/params";
import type { Profile } from "@/lib/services/core";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const googleError = one((await searchParams).error) === "google";
  if (await getSessionUserId()) redirect("/");
  const demoPeople = isDemo()
    ? await (await getDriver()).transaction((q) => q<Profile>("select id, display_name, role, active from profiles where active order by display_name"))
    : [];
  return (
    <div className="min-h-screen bg-ink text-white">
      {/* Solo en esta página: el documento también es negro, para que el rebote del desplazamiento no muestre blanco. */}
      <style>{"html,body{background:var(--color-ink)}"}</style>
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <h1 className="font-brand text-[44px] leading-none break-words sm:text-[72px]">
          {APP_NAME}<span aria-hidden className="text-accent">.</span>
        </h1>
        <p className="mt-3 mb-8 text-sm">Espacio interno del equipo. Acceso solo por invitación.</p>
        {isDemo() ? (
          <div className="bg-surface p-6 text-ink">
            <p className="mb-4 border border-ink bg-st-warn-bg px-3 py-2 text-xs text-st-warn-fg">
              Demo local con datos ficticios. Elige una persona para ver la aplicación con su rol. No hay contraseñas porque no es un entorno real.
            </p>
            <ul className="space-y-2">
              {demoPeople.map((p) => (
                <li key={p.id}>
                  <form action={demoLoginAction}>
                    <input type="hidden" name="user_id" value={p.id} />
                    <button type="submit" className="btn btn-secondary w-full !justify-between">
                      <span>Entrar como {p.display_name}</span>
                      <span className="font-mono text-xs font-medium text-muted uppercase">{ROLE_LABEL[p.role]}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div className="bg-surface p-6 text-ink">
              {googleError && (
                <p role="alert" className="mb-4 border border-st-danger-fg bg-st-danger-bg px-3 py-2 text-sm text-st-danger-fg">
                  No se ha podido entrar con Google. Inténtalo de nuevo o usa tu email.
                </p>
              )}
              <form action={signInWithGoogleAction}>
                <button type="submit" className="btn btn-secondary w-full">Entrar con Google</button>
              </form>
              <div className="my-5 flex items-center gap-3 font-mono text-xs text-muted" aria-hidden="true">
                <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
              </div>
              <ActionForm action={loginAction} submitLabel="Entrar" pendingLabel="Entrando…" submitClassName="btn btn-primary w-full">
                <div className="space-y-3">
                  <div>
                    <label className="label" htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" required autoComplete="username" className="field" />
                  </div>
                  <div>
                    <label className="label" htmlFor="password">Contraseña</label>
                    <input id="password" name="password" type="password" required autoComplete="current-password" className="field" />
                  </div>
                </div>
              </ActionForm>
            </div>
            <details className="mt-4 text-sm">
              <summary className="inline-block text-white underline underline-offset-2 hover:decoration-accent hover:decoration-2">He olvidado mi contraseña</summary>
              <div className="mt-2 bg-surface p-6 text-ink">
                <ActionForm action={requestPasswordResetAction} submitLabel="Enviar enlace" pendingLabel="Enviando…">
                  <label className="label" htmlFor="reset-email">Email</label>
                  <input id="reset-email" name="email" type="email" required autoComplete="username" className="field" />
                </ActionForm>
              </div>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
