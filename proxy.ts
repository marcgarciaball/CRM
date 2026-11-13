import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/auth/confirm", "/sin-acceso"];

/**
 * Comprobación optimista de sesión y refresco de cookies de Supabase.
 * La autorización real está en el servidor (requireUser) y en la base de datos (RLS).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const toLogin = () => NextResponse.redirect(new URL("/login", request.url));

  if (process.env.WORKSPACE_DEMO === "1") {
    return isPublic || request.cookies.has("workspace_demo_user") ? NextResponse.next() : toLogin();
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return isPublic ? NextResponse.next() : toLogin();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user && !isPublic) return toLogin();
  return response;
}

export const config = {
  // `media/subida` (subida de ficheros de la demo local) queda fuera: el proxy guardaría el fichero entero en memoria.
  // Esa ruta comprueba la sesión por sí misma.
  matcher: ["/((?!media/subida|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
