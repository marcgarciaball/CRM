import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { demoLoginAction, loginAction, requestPasswordResetAction } from "@/app/actions/account";
import { ActionForm } from "@/components/action-form";
import { getSessionUserId } from "@/lib/auth";
import { getDriver, isDemo } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/labels";
import type { Profile } from "@/lib/services/core";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUserId()) redirect("/");
  const demoPeople = isDemo()
    ? await (await getDriver()).transaction((q) => q<Profile>("select id, display_name, role, active from profiles where active order by display_name"))
    : [];
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-medium">Amapola Workspace</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Espacio interno del equipo. Acceso solo por invitación.</p>
      {isDemo() ? (
        <div className="card p-5">
          <p className="mb-3 border border-st-warn-fg/30 bg-highlight px-3 py-2 text-xs text-st-warn-fg">
            Demo local con datos ficticios. Elige una persona para ver la aplicación con su rol. No hay contraseñas porque no es un entorno real.
          </p>
          <ul className="space-y-2">
            {demoPeople.map((p) => (
              <li key={p.id}>
                <form action={demoLoginAction}>
                  <input type="hidden" name="user_id" value={p.id} />
                  <button type="submit" className="btn btn-secondary w-full !justify-between">
                    <span>Entrar como {p.display_name}</span>
                    <span className="text-muted">{ROLE_LABEL[p.role]}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="card p-5">
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
            <summary className="link inline-block">He olvidado mi contraseña</summary>
            <div className="card mt-2 p-5">
              <ActionForm action={requestPasswordResetAction} submitLabel="Enviar enlace" pendingLabel="Enviando…">
                <label className="label" htmlFor="reset-email">Email</label>
                <input id="reset-email" name="email" type="email" required autoComplete="username" className="field" />
              </ActionForm>
            </div>
          </details>
        </>
      )}
    </main>
  );
}
