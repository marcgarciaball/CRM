// Alta del equipo inicial como administración. Ejecútalo tú, en tu terminal (lee .env.local):
//
//   node --env-file=.env.local scripts/seed-team.mjs            # crea usuarios SIN enviar emails
//   node --env-file=.env.local scripts/seed-team.mjs --invite   # además envía el email de invitación
//
// Es idempotente: si el usuario ya existe, solo se asegura de que su perfil sea admin y esté activo.
// Contiene emails reales: no lo subas al repositorio (bórralo cuando termines).
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const TEAM = [
  ["marcgarciaball@gmail.com", "Marc"],
  ["amapolalab.edit@gmail.com", "Maite"],
  ["elisaparraproyectos@gmail.com", "Elisa"],
  ["sara.sanz.97.ss@gmail.com", "Sara"],
  ["ainhoabisquertm@gmail.com", "Ainhoa"],
];

const invite = process.argv.includes("--invite");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!url || !key || !dbUrl) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY o DATABASE_URL (¿ejecutas con --env-file=.env.local?).");
  process.exit(1);
}

const auth = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin;
const local = /localhost|127\.0\.0\.1/.test(dbUrl);
const pool = new pg.Pool({
  connectionString: dbUrl,
  max: 1,
  connectionTimeoutMillis: 15000,
  ssl: local ? undefined : { rejectUnauthorized: false },
});

let failed = 0;
try {
  // Diagnóstico: host y puerto (sin usuario ni contraseña) y una consulta mínima antes de empezar.
  let target;
  try {
    const u = new URL(dbUrl);
    target = `${u.hostname}:${u.port || 5432}`;
  } catch {
    console.error("DATABASE_URL no es una URL válida (¿la contraseña tiene caracteres como @ / : # sin codificar?).");
    process.exit(1);
  }
  console.log(`Conectando a la base de datos en ${target}…`);
  try {
    await pool.query("select 1");
  } catch (e) {
    console.error(`✘ No se pudo conectar (${e.message}).`);
    console.error("  · timeout → red/firewall/VPN bloquea ese puerto, o el host no es el del Transaction pooler.");
    console.error("  · 'Tenant or user not found' → región/prefijo (aws-0/aws-1) o usuario postgres.<ref> incorrectos.");
    console.error("  · 'password authentication failed' → contraseña incorrecta o sin codificar en URL.");
    process.exit(1);
  }
  console.log("Conexión correcta.");

  for (const [email, name] of TEAM) {
    try {
      const found = await pool.query("select id from auth.users where lower(email) = lower($1)", [email]);
      let status = "ya existía";
      if (found.rowCount === 0) {
        const { error } = invite
          ? await auth.inviteUserByEmail(email)
          : await auth.createUser({ email, email_confirm: true });
        if (error) throw error;
        status = invite ? "creado e invitado" : "creado (sin email)";
      }
      await pool.query("select public.bootstrap_admin($1, $2)", [email, name]);
      console.log(`✔ ${name} <${email}> — ${status}, admin activo`);
    } catch (e) {
      failed++;
      console.error(`✘ ${name} <${email}> — ${e.message}`);
    }
  }
} finally {
  await pool.end();
}
process.exit(failed ? 1 : 0);
