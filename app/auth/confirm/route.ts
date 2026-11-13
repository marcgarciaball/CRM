import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth-redirect";
import { isDemo, withUser } from "@/lib/db";
import { getProfile } from "@/lib/services/core";

const TYPES = ["invite", "recovery", "magiclink", "email", "signup"] as const;
type Auth = Awaited<ReturnType<(typeof import("@/lib/supabase/server"))["supabaseAuth"]>>;

/**
 * Destino de los enlaces de invitación, de recuperación de contraseña y del regreso de Google.
 * - `token_hash`: verifica el token con Supabase Auth, abre la sesión y lleva a fijar la contraseña.
 * - `code` (Google o enlace PKCE): intercambia el código y comprueba que la persona tiene un perfil activo.
 *   Entrar con Google no crea acceso: sin perfil activo se cierra la sesión y se va a `/sin-acceso`.
 * Ningún fallo de Supabase termina en un 500: siempre es una redirección.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const to = (path: string) => NextResponse.redirect(new URL(path, url));
  if (isDemo()) return to("/login");
  const params = url.searchParams;
  const tokenHash = params.get("token_hash");
  const code = params.get("code");
  if (params.has("error") || (!tokenHash && !code)) return to("/login?error=google");

  let supabase: Auth;
  try {
    supabase = await (await import("@/lib/supabase/server")).supabaseAuth();
  } catch (e) {
    console.error(e);
    return to(tokenHash ? "/login" : "/login?error=google");
  }

  if (tokenHash) {
    const type = params.get("type") as (typeof TYPES)[number] | null;
    let ok = false;
    try {
      ok = !!type && TYPES.includes(type) && !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
    } catch (e) {
      console.error(e);
    }
    return to(ok ? "/cuenta/contrasena" : "/login");
  }

  let id: string | undefined;
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code!);
    id = error ? undefined : data?.user?.id;
  } catch (e) {
    console.error(e);
  }
  if (!id) return to("/login?error=google");

  let active = false;
  try {
    active = !!(await withUser(id, (q) => getProfile(q, id!)))?.active;
  } catch (e) {
    // Sin poder comprobar el acceso no se deja la sesión abierta.
    console.error(e);
    return endSession(request, supabase, to("/login?error=google"));
  }
  return active ? to(safeNext(params.get("next"))) : endSession(request, supabase, to("/sin-acceso"));
}

/**
 * Cierra la sesión que acaba de abrir el intercambio y devuelve la respuesta. `scope: "local"` borra la sesión
 * local antes de cualquier llamada de red (el cierre global solo la borraría si la API responde). Si aun así
 * falla o lanza, se borran a mano en la respuesta las cookies `sb-*`: no puede salir una sesión abierta.
 */
async function endSession(request: NextRequest, supabase: Auth, response: NextResponse): Promise<NextResponse> {
  let failed = false;
  try {
    failed = !!(await supabase.auth.signOut({ scope: "local" })).error;
  } catch (e) {
    console.error(e);
    failed = true;
  }
  if (failed) {
    const names = new Set(request.cookies.getAll().map((c) => c.name));
    try {
      // También las que acaba de poner el intercambio en esta misma petición.
      for (const c of (await cookies()).getAll()) names.add(c.name);
    } catch (e) {
      console.error(e);
    }
    for (const name of names) {
      if (name.startsWith("sb-")) response.cookies.set(name, "", { path: "/", maxAge: 0, expires: new Date(0) });
    }
  }
  return response;
}
