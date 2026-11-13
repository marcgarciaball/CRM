import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { withUser, type Q } from "./db";
import { toAppError } from "./errors";
import type { Profile } from "./services/core";

export type ActionState = {
  ok?: boolean;
  error?: string;
  /** Otra persona guardó antes: se ofrece sobrescribir o recargar. */
  conflict?: boolean;
  /** Ya existen recursos con la misma URL. */
  duplicates?: { id: string; title: string }[];
  notice?: string;
  /** Hecho, pero con algo que la persona debe saber (p. ej. no se pudo reenviar un email). Se muestra como aviso. */
  warning?: string;
  /** Enlace al registro recién creado (creación rápida sin salir de la página). */
  href?: string;
} | null;

type Result = { redirect?: string; state?: ActionState } | void;

/**
 * Envoltorio común de las acciones de servidor: exige sesión y perfil activo,
 * ejecuta en una transacción con la identidad de la persona (RLS + triggers),
 * traduce errores y refresca los datos mostrados.
 */
export async function run(fn: (q: Q, user: Profile) => Promise<Result>): Promise<ActionState> {
  const user = await requireUser();
  let result: Result;
  try {
    result = await withUser(user.id, (q) => fn(q, user));
  } catch (e) {
    const err = toAppError(e);
    return { error: err.message, conflict: err.code === "conflict" };
  }
  revalidatePath("/", "layout");
  if (result?.redirect) redirect(result.redirect);
  return result?.state ?? { ok: true };
}
