export type Q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface Driver {
  /** Transacción con el rol de conexión (privilegiado). Usar `withUser` para trabajo de usuarios. */
  transaction<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
