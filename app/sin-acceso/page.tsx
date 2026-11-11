import type { Metadata } from "next";
import { logoutAction } from "@/app/actions/account";

export const metadata: Metadata = { title: "Sin acceso" };

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="card p-6">
        <h1 className="text-lg font-medium">Sin acceso al espacio de trabajo</h1>
        <p className="mt-2 text-sm text-muted">
          Tu cuenta no pertenece al equipo o está desactivada. Pide a una persona administradora que te dé acceso.
        </p>
        <form action={logoutAction} className="mt-4">
          <button type="submit" className="btn btn-secondary">Cerrar sesión</button>
        </form>
      </div>
    </main>
  );
}
