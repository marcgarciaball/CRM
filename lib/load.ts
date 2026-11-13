import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireUser } from "./auth";
import { withUser, type Q } from "./db";
import { isUuid } from "./form";
import { campaignOptions } from "./services/campaigns";
import { getClient, type Client } from "./services/clients";
import { listProfiles, type Profile } from "./services/core";

/** Carga de datos de una página: sesión + transacción con la identidad de la persona. */
export async function load<T>(fn: (q: Q, user: Profile) => Promise<T>): Promise<T & { user: Profile }> {
  const user = await requireUser();
  const data = await withUser(user.id, (q) => fn(q, user));
  return { ...data, user };
}

/**
 * Carga de una página dentro de un cliente (`/c/<cliente>/…`). Si el parámetro no es un identificador
 * válido o la persona no es miembro del cliente, la página no existe (404), sin distinguir un caso del otro.
 */
export async function loadClient<T>(
  clientParam: string,
  fn: (q: Q, user: Profile, client: Client) => Promise<T>,
): Promise<T & { user: Profile; client: Client }> {
  if (!isUuid(clientParam)) notFound();
  const user = await requireUser();
  const client = await clientFor(user.id, clientParam);
  if (!client) notFound();
  const data = await withUser(user.id, (q) => fn(q, user, client));
  return { ...data, client, user };
}

/** El cliente con el papel de la persona, una sola consulta por petición (el marco del cliente y la página lo piden ambos). */
const clientFor = cache((userId: string, clientId: string) => withUser(userId, (q) => getClient(q, clientId)));

/** Personas activas y campañas del cliente para los formularios. */
export const formOptions = async (q: Q, clientId: string) => ({
  people: await listProfiles(q, clientId),
  campaigns: await campaignOptions(q, clientId),
});
