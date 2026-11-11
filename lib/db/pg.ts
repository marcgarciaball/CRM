import { Pool, types } from "pg";
import type { Driver, Q } from "./types";

// Las fechas locales (date) viajan como texto "YYYY-MM-DD": nunca se convierten a instantes.
types.setTypeParser(1082, (v) => v);

export function createPgDriver(connectionString: string): Driver {
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  // connectionTimeoutMillis: si la base no responde, falla con un error claro en vez de quedarse colgada.
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10000,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  return {
    async transaction(fn) {
      const client = await pool.connect();
      const q: Q = async (sql, params) => (await client.query(sql, params as unknown[])).rows;
      try {
        await client.query("begin");
        const result = await fn(q);
        await client.query("commit");
        return result;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
