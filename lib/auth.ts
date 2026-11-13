import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemo, withUser } from "./db";
import { getProfile, type Profile } from "./services/core";

export const DEMO_COOKIE = "workspace_demo_user";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identidad autenticada (verificada contra Supabase Auth), o null. */
export const getSessionUserId = cache(async (): Promise<string | null> => {
  if (isDemo()) {
    const id = (await cookies()).get(DEMO_COOKIE)?.value;
    return id && UUID.test(id) ? id : null;
  }
  const { supabaseAuth } = await import("./supabase/server");
  const { data } = await (await supabaseAuth()).auth.getUser();
  return data.user?.id ?? null;
});

/** Perfil activo del espacio de trabajo. Sin sesión → /login; sin perfil activo → /sin-acceso. */
export const requireUser = cache(async (): Promise<Profile> => {
  const id = await getSessionUserId();
  if (!id) redirect("/login");
  const profile = await withUser(id, (q) => getProfile(q, id));
  if (!profile || !profile.active) redirect("/sin-acceso");
  return profile;
});
