import { isUuid } from "./form";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v) || undefined;
export const uuidParam = (v: string | string[] | undefined): string | undefined => {
  const s = one(v);
  return isUuid(s) ? s : undefined;
};
export const enumParam = <T extends string>(v: string | string[] | undefined, values: readonly T[]): T | undefined => {
  const s = one(v);
  return (values as readonly string[]).includes(s ?? "") ? (s as T) : undefined;
};
