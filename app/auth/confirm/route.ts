import { NextResponse, type NextRequest } from "next/server";
import { isDemo } from "@/lib/db";

const TYPES = ["invite", "recovery", "magiclink", "email", "signup"] as const;

/**
 * Destino de los enlaces de invitación y de recuperación de contraseña.
 * Verifica el token con Supabase Auth, abre la sesión y lleva a fijar la contraseña.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const fail = NextResponse.redirect(new URL("/login", url));
  if (isDemo()) return fail;
  const { supabaseAuth } = await import("@/lib/supabase/server");
  const supabase = await supabaseAuth();
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as (typeof TYPES)[number] | null;
  const code = url.searchParams.get("code");
  let ok = false;
  if (tokenHash && type && TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }
  return ok ? NextResponse.redirect(new URL("/cuenta/contrasena", url)) : fail;
}
