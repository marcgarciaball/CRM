import "server-only";
import { cache } from "react";
import { requireUser } from "./auth";
import { withUser } from "./db";
import { firstClientPeople } from "./load";

/** Personas activas como opciones de selector. Una sola consulta por petición. */
export const peopleOptions = cache(async () => {
  const user = await requireUser();
  const people = await withUser(user.id, (q) => firstClientPeople(q)); // TODO(Task 5)
  return people.map((p) => ({ id: p.id, label: p.display_name }));
});
