import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setPasswordAction } from "@/app/actions/account";
import { ActionForm } from "@/components/action-form";
import { getSessionUserId } from "@/lib/auth";

export const metadata: Metadata = { title: "Contraseña" };
export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  if (!(await getSessionUserId())) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-4 text-xl font-medium">Elige tu contraseña</h1>
      <div className="card p-5">
        <ActionForm action={setPasswordAction} submitLabel="Guardar contraseña">
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="password">Contraseña nueva</label>
              <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className="field" />
              <p className="mt-1 text-xs text-muted">Mínimo 12 caracteres. Es personal: no la compartas con el equipo.</p>
            </div>
            <div>
              <label className="label" htmlFor="password_confirm">Repite la contraseña</label>
              <input id="password_confirm" name="password_confirm" type="password" required minLength={12} autoComplete="new-password" className="field" />
            </div>
          </div>
        </ActionForm>
      </div>
    </main>
  );
}
