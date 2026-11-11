import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const supabaseEnv = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Clave publishable (nueva); NEXT_PUBLIC_SUPABASE_ANON_KEY se acepta como alternativa heredada.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  return { url, anonKey };
};

/** Cliente de Supabase Auth ligado a las cookies de la sesión. Solo se usa para autenticación. */
export async function supabaseAuth() {
  const store = await cookies();
  const { url, anonKey } = supabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // En Server Components no se pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}

/** Cliente con la clave de servicio: solo en servidor, para invitar usuarios y para el almacén de creatividades (`lib/storage.ts`). */
export function supabaseAdmin() {
  // Clave secret (nueva); SUPABASE_SERVICE_ROLE_KEY se acepta como alternativa heredada.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SECRET_KEY.");
  return createClient(supabaseEnv().url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
