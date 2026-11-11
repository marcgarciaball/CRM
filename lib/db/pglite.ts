import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Driver, Q } from "./types";

const migrationsDir = () => path.join(process.cwd(), "supabase/migrations");
const migrationFiles = () => readdirSync(migrationsDir()).filter((f) => f.endsWith(".sql")).sort();

async function applyMigrations(db: PGlite, files: string[]) {
  for (const f of files) await db.exec(readFileSync(path.join(migrationsDir(), f), "utf8"));
}

const databases = new WeakMap<Driver, PGlite>();

/**
 * Postgres embebido para tests y demo local. Aplica el shim de `auth` y las migraciones reales.
 * `upTo` (solo tests): aplica únicamente las migraciones cuyo nombre de fichero es `<= upTo`.
 */
export async function createPgliteDriver(dataDir?: string, opts: { upTo?: string } = {}): Promise<Driver> {
  // Las fechas locales (date) viajan como texto "YYYY-MM-DD", igual que con el driver pg.
  const parsers = { 1082: (v: string) => v };
  const db = new PGlite(dataDir);
  await db.waitReady;
  const done = await db.query<{ ok: boolean }>("select to_regclass('public.profiles') is not null as ok");
  if (!done.rows[0].ok) {
    await db.exec(readFileSync(path.join(process.cwd(), "lib/db/shim.sql"), "utf8"));
    await applyMigrations(db, migrationFiles().filter((f) => opts.upTo === undefined || f <= opts.upTo));
  }
  const driver: Driver = {
    transaction: (fn) =>
      db.transaction(async (tx) => {
        const q: Q = async (sql, params) => (await tx.query(sql, params as unknown[], { parsers })).rows as never[];
        return fn(q);
      }) as Promise<never>,
    close: () => db.close(),
  };
  databases.set(driver, db);
  return driver;
}

/** Solo tests: aplica las migraciones posteriores a `after` (p. ej. para probar un traslado de datos). */
export async function applyMigrationsAfter(driver: Driver, after: string): Promise<void> {
  const db = databases.get(driver);
  if (!db) throw new Error("applyMigrationsAfter solo admite drivers creados con createPgliteDriver.");
  await applyMigrations(db, migrationFiles().filter((f) => f > after));
}
