import type { Metadata } from "next";
import { logoutAction } from "@/app/actions/account";

export const metadata: Metadata = { title: "Sin acceso" };

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="border-t-2 border-ink pt-4">
        <h1 className="page-title">Sin acceso</h1>
        <p className="mt-3 text-sm text-muted">
          No tienes acceso. Tu cuenta no ha sido invitada o está desactivada. Pide acceso a quien te invitó.
        </p>
        <form action={logoutAction} className="mt-4">
          <button type="submit" className="btn btn-secondary">Cerrar sesión</button>
        </form>
      </div>
    </main>
  );
}
