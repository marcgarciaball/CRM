import { isLocalDate } from "./dates";
import { AppError } from "./errors";

/** Validación de entrada de formularios en el servidor. Los mensajes se muestran a la persona usuaria. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const raw = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
};

export function text(fd: FormData, key: string, label: string, opts: { max?: number; required?: boolean } = {}): string {
  const v = raw(fd, key);
  if (opts.required && !v) throw new AppError(`Falta ${label}.`);
  if (v.length > (opts.max ?? 200)) throw new AppError(`${label[0].toUpperCase()}${label.slice(1)}: máximo ${opts.max ?? 200} caracteres.`);
  return v;
}
export function optUuid(fd: FormData, key: string): string | null {
  const v = raw(fd, key);
  if (!v) return null;
  if (!isUuid(v)) throw new AppError("Selección no válida.");
  return v;
}
export function uuid(fd: FormData, key: string): string {
  const v = optUuid(fd, key);
  if (!v) throw new AppError("Falta el identificador del registro.");
  return v;
}
export function optDate(fd: FormData, key: string): string | null {
  const v = raw(fd, key);
  if (!v) return null;
  if (!isLocalDate(v)) throw new AppError("La fecha no es válida.");
  return v;
}
export function oneOf<T extends string>(fd: FormData, key: string, values: readonly T[], fallback?: T): T {
  const v = raw(fd, key);
  if ((values as readonly string[]).includes(v)) return v as T;
  if (fallback !== undefined && !v) return fallback;
  throw new AppError("Opción no válida.");
}
export const bool = (fd: FormData, key: string) => ["1", "on", "true"].includes(raw(fd, key));
/** Versión con la que se abrió el formulario; null si se ha pedido sobrescribir tras un aviso de conflicto. */
export function version(fd: FormData): number | null {
  if (bool(fd, "force")) return null;
  const n = Number(raw(fd, "version"));
  if (!Number.isInteger(n) || n < 1) throw new AppError("Falta la versión del registro. Recarga la página.");
  return n;
}
