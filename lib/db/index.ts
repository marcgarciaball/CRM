import "server-only";
import type { Driver, Q } from "./types";
import { runAsUser } from "./user";

export type { Q } from "./types";

/** Modo demo: PGlite local con datos ficticios. Nunca es un espacio multiusuario conectado. */
export const isDemo = () => process.env.AMAPOLA_DEMO === "1";

const g = globalThis as unknown as { __amapolaDriver?: Promise<Driver> };

async function createDriver(): Promise<Driver> {
  if (isDemo()) {
    const { createPgliteDriver } = await import("./pglite");
    const driver = await createPgliteDriver(process.env.AMAPOLA_DEMO_DIR || undefined);
    const { seedDemo } = await import("../demo/seed");
    await seedDemo(driver);
    return driver;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL (o AMAPOLA_DEMO=1 para la demo local).");
  }
  const { createPgDriver } = await import("./pg");
  return createPgDriver(process.env.DATABASE_URL);
}

export function getDriver(): Promise<Driver> {
  return (g.__amapolaDriver ??= createDriver());
}

/** Solo para tests: inyecta un driver. */
export function setDriver(driver: Driver | null) {
  g.__amapolaDriver = driver ? Promise.resolve(driver) : undefined;
}

/** Transacción con la identidad de la persona: RLS y triggers aplican siempre. */
export async function withUser<T>(userId: string, fn: (q: Q) => Promise<T>): Promise<T> {
  return runAsUser(await getDriver(), userId, fn);
}
