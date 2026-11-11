"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { run, type ActionState } from "@/lib/action";
import { DEMO_COOKIE, getSessionUserId } from "@/lib/auth";
import { getDriver, isDemo } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { bool, isUuid, oneOf, text, uuid } from "@/lib/form";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
const email = (fd: FormData) => {
  const v = text(fd, "email", "el email", { required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new AppError("El email no es válido.");
  return v;
};

// ── Sesión ─────────────────────────────────────────────────────────────────
export const loginAction: Action = async (_prev, fd) => {
  if (isDemo()) return { error: "En la demo se entra eligiendo una persona." };
  const { supabaseAuth } = await import("@/lib/supabase/server");
  const supabase = await supabaseAuth();
  const { error } = await supabase.auth.signInWithPassword({ email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") });
  if (error) return { error: "Email o contraseña incorrectos." };
  redirect("/");
};

/** Solo en modo demo: entra como una de las personas ficticias. */
export async function demoLoginAction(fd: FormData) {
  if (!isDemo()) throw new Error("Demo desactivada.");
  const id = String(fd.get("user_id") ?? "");
  if (!isUuid(id)) throw new Error("Persona no válida.");
  (await cookies()).set(DEMO_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}

export async function logoutAction() {
  if (isDemo()) (await cookies()).delete(DEMO_COOKIE);
  else {
    const { supabaseAuth } = await import("@/lib/supabase/server");
    await (await supabaseAuth()).auth.signOut();
  }
  redirect("/login");
}

export const requestPasswordResetAction: Action = async (_prev, fd) => {
  if (isDemo()) return { error: "No disponible en la demo." };
  const { supabaseAuth } = await import("@/lib/supabase/server");
  let address: string;
  try {
    address = email(fd);
  } catch (e) {
    return { error: (e as Error).message };
  }
  await (await supabaseAuth()).auth.resetPasswordForEmail(address, { redirectTo: `${siteUrl()}/auth/confirm?next=/cuenta/contrasena` });
  // Misma respuesta exista o no la cuenta.
  return { ok: true, notice: "Si el email pertenece al equipo, recibirás un enlace para cambiar la contraseña." };
};

export const setPasswordAction: Action = async (_prev, fd) => {
  if (isDemo()) return { error: "No disponible en la demo." };
  if (!(await getSessionUserId())) redirect("/login");
  const password = String(fd.get("password") ?? "");
  if (password.length < 12) return { error: "La contraseña debe tener al menos 12 caracteres." };
  if (password !== String(fd.get("password_confirm") ?? "")) return { error: "Las contraseñas no coinciden." };
  const { supabaseAuth } = await import("@/lib/supabase/server");
  const { error } = await (await supabaseAuth()).auth.updateUser({ password });
  if (error) return { error: "No se ha podido guardar la contraseña. Prueba con otra distinta." };
  redirect("/");
};

// ── Perfil y administración de personas ────────────────────────────────────
export const updateOwnNameAction: Action = async (_prev, fd) =>
  run(async (q, user) => {
    await q("update profiles set display_name = $2 where id = $1", [user.id, text(fd, "display_name", "el nombre", { required: true, max: 80 })]);
    return { state: { ok: true, notice: "Nombre guardado." } };
  });

/** Rol y acceso de otra persona. La base de datos rechaza el cambio si quien lo pide no es administradora. */
export const adminUpdateUserAction: Action = async (_prev, fd) =>
  run(async (q, user) => {
    if (user.role !== "admin") throw new AppError("Solo administración puede gestionar personas.", "forbidden");
    const rows = await q("update profiles set display_name = $2, role = $3, active = $4 where id = $1 returning id", [
      uuid(fd, "id"), text(fd, "display_name", "el nombre", { required: true, max: 80 }),
      oneOf(fd, "role", ["admin", "member"] as const), bool(fd, "active"),
    ]);
    if (rows.length === 0) throw new AppError("No se ha encontrado a la persona.", "not_found");
    return { state: { ok: true, notice: "Cambios guardados." } };
  });

/** Invitación por email (Supabase Auth) + alta del perfil. El registro público permanece desactivado. */
export const inviteUserAction: Action = async (_prev, fd) =>
  run(async (q, user) => {
    if (user.role !== "admin") throw new AppError("Solo administración puede invitar.", "forbidden");
    const address = email(fd);
    const displayName = text(fd, "display_name", "el nombre", { required: true, max: 80 });
    const role = oneOf(fd, "role", ["admin", "member"] as const, "member");
    let id: string;
    if (isDemo()) {
      // Demo local: no se envía ningún email; solo se crea la persona ficticia.
      const driver = await getDriver();
      id = await driver.transaction(async (sys) =>
        (await sys<{ id: string }>("insert into auth.users (email) values ($1) returning id", [address]))[0].id);
    } else {
      const { supabaseAdmin } = await import("@/lib/supabase/server");
      const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(address, { redirectTo: `${siteUrl()}/auth/confirm?next=/cuenta/contrasena` });
      if (error || !data.user) throw new AppError(`No se ha podido enviar la invitación${error?.message ? `: ${error.message}` : "."}`);
      id = data.user.id;
    }
    await q("insert into profiles (id, display_name, role) values ($1, $2, $3)", [id, displayName, role]);
    return { state: { ok: true, notice: isDemo() ? "Persona creada en la demo (no se envía email)." : `Invitación enviada a ${address}.` } };
  });
