import "server-only";
import { requireUser } from "./auth";
import { withUser, type Q } from "./db";
import { AppError } from "./errors";
import { campaignOptions } from "./services/campaigns";
import { listMyClients } from "./services/clients";
import { listProfiles, type Profile } from "./services/core";

/** Carga de datos de una página: sesión + transacción con la identidad de la persona. */
export async function load<T>(fn: (q: Q, user: Profile) => Promise<T>): Promise<T & { user: Profile }> {
  const user = await requireUser();
  const data = await withUser(user.id, (q) => fn(q, user));
  return { ...data, user };
}

// TODO(Task 5): el cliente vendrá de la URL. Provisional: el primer cliente activo de la persona.
export const firstClientId = async (q: Q): Promise<string | null> => (await listMyClients(q))[0]?.id ?? null;
// TODO(Task 5): provisional para las acciones que crean trabajo.
export async function requireFirstClientId(q: Q): Promise<string> {
  const id = await firstClientId(q);
  if (!id) throw new AppError("No tienes acceso a ningún cliente.", "forbidden");
  return id;
}

// TODO(Task 5): provisional, las personas del primer cliente de la persona.
export const firstClientPeople = async (q: Q): Promise<Profile[]> => {
  const id = await firstClientId(q);
  return id ? listProfiles(q, id) : [];
};

export const formOptions = async (q: Q) => {
  const clientId = await firstClientId(q); // TODO(Task 5)
  return { people: clientId ? await listProfiles(q, clientId) : [], campaigns: clientId ? await campaignOptions(q, clientId) : [] };
};
