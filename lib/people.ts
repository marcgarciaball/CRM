import "server-only";
import { cache } from "react";
import { requireUser } from "./auth";
import { withUser } from "./db";
import { listProfiles } from "./services/core";

/** Personas activas de un cliente como opciones de selector. Una sola consulta por cliente y petición. */
export const peopleOptions = cache(async (clientId: string) => {
  const user = await requireUser();
  const people = await withUser(user.id, (q) => listProfiles(q, clientId));
  return people.map((p) => ({ id: p.id, label: p.display_name }));
});
