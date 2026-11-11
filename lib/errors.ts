/** Error con mensaje apto para mostrar a la persona usuaria (en español). */
export class AppError extends Error {
  constructor(message: string, public code: "invalid" | "forbidden" | "not_found" | "conflict" = "invalid") {
    super(message);
  }
}
export class ConflictError extends AppError {
  constructor() {
    super("Otra persona ha modificado este registro mientras lo editabas.", "conflict");
  }
}

/** Traduce errores de Postgres a AppError. Los mensajes de los triggers (P0001) ya están en español. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const err = e as { code?: string; message?: string; constraint?: string };
  if (err?.code === "P0001") return new AppError(err.message ?? "Operación no permitida.");
  if (err?.code === "42501") {
    const own = err.message && /^(Solo|Debe)/.test(err.message);
    return new AppError(own ? err.message! : "No tienes permiso para realizar esta acción.", "forbidden");
  }
  if (err?.code === "23505") return new AppError("Ese elemento ya existe o ya está enlazado aquí.");
  if (err?.code === "23514" || err?.code === "23503" || err?.code === "22P02" || err?.code === "22001") {
    return new AppError("Los datos enviados no son válidos.");
  }
  // redirect()/notFound() de Next se propagan tal cual.
  if (typeof (e as { digest?: unknown })?.digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_")) throw e;
  console.error(e);
  return new AppError("Ha ocurrido un error inesperado. Inténtalo de nuevo.");
}
