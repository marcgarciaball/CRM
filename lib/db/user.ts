import type { Driver, Q } from "./types";

/**
 * Ejecuta `fn` en una transacción como el usuario indicado: rol `authenticated`
 * y `auth.uid()` = userId, de modo que RLS y los triggers aplican siempre.
 */
export function runAsUser<T>(driver: Driver, userId: string, fn: (q: Q) => Promise<T>): Promise<T> {
  return driver.transaction(async (q) => {
    await q("select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    return fn(q);
  });
}
