"use server";

import { run, type ActionState } from "@/lib/action";
import { getDriver, isDemo } from "@/lib/db";
import { AppError, toAppError } from "@/lib/errors";
import { bool, email, oneOf, text, uuid, version } from "@/lib/form";
import { clientPath } from "@/lib/paths";
import { passwordLinkTarget } from "@/lib/site";
import {
  addMemberByEmail, attachInvited, createClient, getClient, listClientPeople, recordInvitation, removeMember,
  setClientArchived, setMemberRole, updateClient, type ClientRole,
} from "@/lib/services/clients";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
const ROLES = ["owner", "member"] as const;
const OWNER_ONLY = "Solo una persona propietaria del cliente puede gestionar sus personas.";
const ARCHIVED = "Solo se gestionan las personas de un cliente activo: este cliente está archivado.";

const name = (fd: FormData) => text(fd, "name", "el nombre del cliente", { required: true, max: 120 });
const description = (fd: FormData) => text(fd, "description", "la descripción", { max: 2000 });

// ── El cliente ─────────────────────────────────────────────────────────────
/** Cualquier persona con acceso puede crear un cliente; la base de datos la añade como propietaria. */
export const createClientAction: Action = async (_prev, fd) =>
  run(async (q) => ({ redirect: clientPath(await createClient(q, { name: name(fd), description: description(fd) })) }));

export const updateClientAction: Action = async (_prev, fd) =>
  run(async (q) => {
    await updateClient(q, uuid(fd, "client_id"), version(fd), { name: name(fd), description: description(fd) });
    return { state: { ok: true, notice: "Cliente guardado." } };
  });

/** `archived` = "1" archiva; vacío o "0", recupera. */
export const archiveClientAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const archived = bool(fd, "archived");
    await setClientArchived(q, uuid(fd, "client_id"), archived);
    return { state: { ok: true, notice: archived ? "Cliente archivado." : "Cliente recuperado." } };
  });

// ── Personas del cliente ───────────────────────────────────────────────────
/** Cuenta de Supabase Auth para un email nuevo: en la demo se crea sin email; en real, con invitación. */
async function inviteAccount(address: string): Promise<string> {
  if (isDemo()) {
    // Demo local: no se envía ningún email; solo se crea la cuenta ficticia (o se reutiliza la que no tiene perfil).
    const driver = await getDriver();
    return driver.transaction(async (sys) =>
      (await sys<{ id: string }>(
        "insert into auth.users (email) values ($1) on conflict (email) do update set email = excluded.email returning id", [address],
      ))[0].id);
  }
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(address, { redirectTo: passwordLinkTarget() });
  if (error || !data.user) throw new AppError(`No se ha podido enviar la invitación${error?.message ? `: ${error.message}` : "."}`);
  return data.user.id;
}

/** Vuelve a enviar el enlace para entrar y elegir contraseña (Supabase Auth, fuera de la transacción). */
async function resendLink(address: string): Promise<string | null> {
  const { supabaseAuth } = await import("@/lib/supabase/server");
  const { error } = await (await supabaseAuth()).auth.resetPasswordForEmail(address, { redirectTo: passwordLinkTarget() });
  return error ? `No se ha podido reenviar la invitación: ${error.message}` : null;
}

const samePerson = (a: string | null, b: string) => !!a && a.trim().toLowerCase() === b;

/**
 * Añadir por email. Con perfil: acceso al momento (y, si aún no ha entrado nunca, se le reenvía la invitación).
 * Sin perfil: se invita (demo: se crea la cuenta) y después se le da acceso. Los envíos a Supabase quedan fuera
 * de la transacción de la persona: en la demo, PGlite no admite una segunda transacción mientras hay otra abierta.
 */
export const addMemberAction: Action = async (_prev, fd) => {
  let outcome = "added" as Awaited<ReturnType<typeof addMemberByEmail>>;
  let address = "", clientId = "", displayName = "", role: ClientRole = "member", resend = false;
  const checked = await run(async (q) => {
    clientId = uuid(fd, "client_id");
    address = email(fd);
    role = oneOf(fd, "role", ROLES, "member");
    outcome = await addMemberByEmail(q, clientId, address, role);
    if (outcome === "needs_invitation") {
      displayName = text(fd, "display_name", "el nombre", { required: true, max: 80 });
      await recordInvitation(q, address);
    } else if (outcome === "added" && !isDemo()) {
      // Añadida a otro cliente sin haber entrado nunca: se le reenvía la invitación.
      resend = (await listClientPeople(q, clientId)).some((p) => p.pending && samePerson(p.email, address));
      if (resend) await recordInvitation(q, address);
    }
  });
  if (checked?.error) return checked;
  if (outcome === "already_member") return { ok: true, notice: `${address} ya tiene acceso.` };
  if (outcome === "added") {
    // El acceso ya está dado: si el reenvío falla, se avisa aparte, sin convertirlo en error.
    const failed = resend ? await resendLink(address) : null;
    return failed ? { ok: true, notice: "Acceso concedido.", warning: failed } : { ok: true, notice: "Acceso concedido." };
  }
  let userId: string;
  try {
    userId = await inviteAccount(address);
  } catch (e) {
    return { error: toAppError(e).message };
  }
  const sent = isDemo() ? "Persona creada en la demo (no se envía email)." : `Invitación enviada a ${address}.`;
  const attached = await run(async (q) => {
    await attachInvited(q, clientId, userId, displayName, role);
    return { state: { ok: true, notice: sent } };
  });
  // La invitación ya ha salido: el error lo dice, y repetir no duplica nada (la cuenta y el acceso no se crean dos veces).
  if (attached?.error) {
    return { error: `${sent.replace(/\.$/, "")}, pero no se ha podido dar acceso al cliente: ${attached.error} Puedes intentarlo de nuevo sin riesgo.` };
  }
  return attached;
};

export const setMemberRoleAction: Action = async (_prev, fd) =>
  run(async (q) => {
    await setMemberRole(q, uuid(fd, "client_id"), uuid(fd, "user_id"), oneOf(fd, "role", ROLES));
    return { state: { ok: true, notice: "Rol guardado." } };
  });

/** Quitar a otra persona (propiedad) o salir una misma (cualquiera): al salir, al inicio. */
export const removeMemberAction: Action = async (_prev, fd) =>
  run(async (q, user) => {
    const userId = uuid(fd, "user_id");
    await removeMember(q, uuid(fd, "client_id"), userId);
    if (userId === user.id) return { redirect: "/" };
    return { state: { ok: true, notice: "Persona quitada del cliente." } };
  });

/** Solo la propiedad, y solo a quien aún no ha entrado nunca. */
export const resendInvitationAction: Action = async (_prev, fd) => {
  let address = "";
  const checked = await run(async (q) => {
    const clientId = uuid(fd, "client_id");
    const userId = uuid(fd, "user_id");
    const client = await getClient(q, clientId);
    if (!client) throw new AppError("No se ha encontrado el cliente.", "not_found");
    if (client.my_role !== "owner") throw new AppError(OWNER_ONLY, "forbidden");
    if (client.archived_at) throw new AppError(ARCHIVED, "forbidden");
    const person = (await listClientPeople(q, clientId)).find((p) => p.user_id === userId);
    if (!person) throw new AppError("Esa persona no es miembro de este cliente.", "not_found");
    if (!person.pending || !person.email) throw new AppError("Esta persona ya ha entrado: no tiene ninguna invitación pendiente.");
    if (isDemo()) throw new AppError("No disponible en la demo.");
    await recordInvitation(q, person.email);
    address = person.email;
  });
  if (checked?.error) return checked;
  const failed = await resendLink(address);
  return failed ? { error: failed } : { ok: true, notice: `Invitación reenviada a ${address}.` };
};
