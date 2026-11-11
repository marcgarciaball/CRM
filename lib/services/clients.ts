import type { Q } from "../db/types";
import { AppError, ConflictError } from "../errors";

export type Client = {
  id: string; name: string; description: string; archived_at: Date | null; version: number;
  my_role: "owner" | "member";
};

/** Solo clientes de los que la persona es miembro; `my_role` es su papel en cada uno. */
const SELECT = `
  select cl.id, cl.name, cl.description, cl.archived_at, cl.version, m.role as my_role
    from clients cl
    join client_members m on m.client_id = cl.id and m.user_id = auth.uid()`;

/**
 * Crea un cliente; la base de datos añade a quien lo crea como propietaria.
 * Sin `returning`: la fila solo es visible para sus miembros y la propiedad se añade
 * después de insertarla, así que el identificador se genera antes.
 */
export async function createClient(q: Q, input: { name: string; description?: string }): Promise<string> {
  const [{ id }] = await q<{ id: string }>("select gen_random_uuid() as id");
  await q("insert into clients (id, name, description) values ($1, $2, $3)", [id, input.name, input.description ?? ""]);
  return id;
}

export async function getClient(q: Q, id: string): Promise<Client | null> {
  return (await q<Client>(`${SELECT} where cl.id = $1`, [id]))[0] ?? null;
}

/** Por defecto, los clientes activos; con `archived: true`, solo los archivados. Por nombre. */
export function listMyClients(q: Q, f: { archived?: boolean } = {}): Promise<Client[]> {
  return q<Client>(`${SELECT} where (cl.archived_at is not null) = $1 order by cl.name, cl.created_at limit 200`, [!!f.archived]);
}

/**
 * Edita nombre y descripción (solo la propiedad del cliente, por RLS), con control de versión.
 * `version = null` fuerza la sobrescritura.
 */
export async function updateClient(q: Q, id: string, version: number | null, patch: { name?: string; description?: string }) {
  const rows = await q(
    `update clients set name = coalesce($3, name), description = coalesce($4, description)
      where id = $1 and ($2::int is null or version = $2) returning id`,
    [id, version, patch.name ?? null, patch.description ?? null],
  );
  if (rows.length === 0) await explainNoUpdate(q, id, true);
}

/** Archiva o recupera un cliente (solo su propiedad). Archivado se puede leer, pero no modificar. */
export async function setClientArchived(q: Q, id: string, archived: boolean) {
  const rows = await q(
    "update clients set archived_at = case when $2 then now() else null end where id = $1 returning id",
    [id, archived],
  );
  if (rows.length === 0) await explainNoUpdate(q, id, false);
}

/** Por qué una actualización de cliente no ha tocado ninguna fila. */
async function explainNoUpdate(q: Q, id: string, versioned: boolean): Promise<never> {
  const client = await getClient(q, id);
  if (!client) throw new AppError("No se ha encontrado el cliente.", "not_found");
  if (client.my_role !== "owner") throw new AppError("Solo una persona propietaria del cliente puede cambiarlo.", "forbidden");
  if (versioned) throw new ConflictError();
  throw new AppError("No se ha podido guardar el cambio.");
}

// ── Personas del cliente (solo mediante funciones del servidor) ────────────
export type ClientRole = "owner" | "member";
export type ClientPerson = {
  user_id: string; display_name: string; role: ClientRole; email: string | null; pending: boolean; active: boolean;
};

/** Cualquier miembro ve nombres y roles; el email solo lo recibe la propiedad. Incluye a las desactivadas. */
export function listClientPeople(q: Q, clientId: string): Promise<ClientPerson[]> {
  return q<ClientPerson>("select * from client_people($1)", [clientId]);
}

/** `needs_invitation` tanto si no hay cuenta como si la hay sin perfil: no se revela cuál. */
export async function addMemberByEmail(q: Q, clientId: string, email: string, role: ClientRole): Promise<"added" | "already_member" | "needs_invitation"> {
  const [{ result }] = await q<{ result: "added" | "already_member" | "needs_invitation" }>(
    "select add_client_member($1, $2, $3) as result", [clientId, email, role]);
  return result;
}

/** Tras invitar: crea el perfil si falta (un perfil existente no se modifica) y da acceso al cliente. */
export async function attachInvited(q: Q, clientId: string, userId: string, displayName: string, role: ClientRole) {
  await q("select attach_invited_member($1, $2, $3, $4)", [clientId, userId, displayName, role]);
}

export async function setMemberRole(q: Q, clientId: string, userId: string, role: ClientRole) {
  await q("select set_client_member_role($1, $2, $3)", [clientId, userId, role]);
}

/** Quita a alguien (o a una misma: salir). Su trabajo abierto en el cliente queda sin responsable. */
export async function removeMember(q: Q, clientId: string, userId: string) {
  await q("select remove_client_member($1, $2)", [clientId, userId]);
}

/** Anota una invitación enviada; falla a partir de 20 en 24 horas. */
export async function recordInvitation(q: Q, email: string) {
  await q("select record_invitation($1)", [email]);
}
