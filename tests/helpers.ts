import { randomUUID } from "node:crypto";
import { setDriver, withUser } from "@/lib/db";
import { createPgliteDriver } from "@/lib/db/pglite";
import type { Driver, Q } from "@/lib/db/types";

export type Team = {
  maite: string; ecommerce: string; ainhoa: string; sara: string; elisa: string;
  outsider: string; inactive: string; lonely: string;
};
export type Clients = { a: string; b: string };

/**
 * Base de datos nueva en memoria con las migraciones reales, el equipo de prueba y dos clientes:
 * A — maite y ecommerce propietarias; ainhoa, sara y elisa miembros.
 * B — ecommerce propietaria; elisa miembro.
 */
export async function setupDb(): Promise<{ driver: Driver; team: Team; c: Clients }> {
  const driver = await createPgliteDriver();
  setDriver(driver);
  const team = {} as Team;
  const c = {} as Clients;
  await driver.transaction(async (q) => {
    const add = async (key: keyof Team, name: string | null, role = "member", active = true) => {
      const id = randomUUID();
      team[key] = id;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, `${key}@test.invalid`]);
      if (name) await q("insert into profiles (id, display_name, role, active) values ($1, $2, $3, $4)", [id, name, role, active]);
    };
    await add("maite", "Maite", "admin");
    await add("ecommerce", "Responsable ecommerce", "admin");
    await add("ainhoa", "Ainhoa");
    await add("sara", "Sara");
    await add("elisa", "Elisa");
    await add("outsider", null); // sesión válida pero sin perfil en el espacio de trabajo
    await add("inactive", "Antigua", "member", false);
    await add("lonely", "Sola"); // perfil activo sin ningún cliente

    const client = async (name: string, members: [keyof Team, "owner" | "member"][]) => {
      const [row] = await q<{ id: string }>("insert into clients (name) values ($1) returning id", [name]);
      for (const [key, role] of members) {
        await q("insert into client_members (client_id, user_id, role) values ($1, $2, $3)", [row.id, team[key], role]);
      }
      return row.id;
    };
    c.a = await client("Cliente A", [["maite", "owner"], ["ecommerce", "owner"], ["ainhoa", "member"], ["sara", "member"], ["elisa", "member"]]);
    c.b = await client("Cliente B", [["ecommerce", "owner"], ["elisa", "member"]]);
  });
  return { driver, team, c };
}

export const as = <T>(userId: string, fn: (q: Q) => Promise<T>) => withUser(userId, fn);
