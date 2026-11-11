# Amapola Workspace

Espacio de trabajo interno y privado para el equipo de [Amapola Lab](https://byamapolalab.com/): campañas, entregables
(newsletters, anuncios, publicaciones, landings), tareas y los enlaces a sus materiales, con planificación mensual y
flujo de revisión y aprobación.

La herramienta registra el trabajo; **no publica nada** en Meta, Google, Shopify ni en la plataforma de email.

- Next.js (App Router) · TypeScript · Tailwind · Supabase (PostgreSQL + Auth) · npm
- Interfaz en español (España), zona horaria Europe/Madrid, semana de lunes a domingo.

## Cómo está construido

- **Datos**: `supabase/migrations/` (tablas e índices, reglas de negocio en triggers, RLS).
- **Reglas editoriales en la base de datos**: transiciones de estado, aprobación solo por administración, invalidación
  de la aprobación al cambiar el copy o un material aprobable, historial y registro de publicaciones. No se pueden
  saltar desde la interfaz ni desde la API de Supabase.
- **Acceso a datos**: el servidor se conecta a Postgres (`DATABASE_URL`) y ejecuta cada petición en una transacción
  con el rol `authenticated` y la identidad de la persona, de modo que RLS aplica siempre (`lib/db`).
- **Autenticación**: Supabase Auth con email y contraseña, solo por invitación. Una sesión sin perfil activo en
  `profiles` no ve ni modifica nada.
- **Código**: `lib/services` (consultas), `app/actions` (acciones de servidor), `app/(app)` (pantallas), `components`.

## Instalación

```bash
npm install
```

### Probar sin configurar nada: demo local

```bash
npm run demo      # http://localhost:3000
```

Arranca con una base de datos Postgres embebida (PGlite) **en memoria** y datos **ficticios** (`lib/demo/seed.ts`):
personas con emails `@demo.invalid`, enlaces a `example.com` y ninguna cifra de negocio. Se entra eligiendo una
persona, sin contraseña. **No es un espacio multiusuario conectado**: los datos viven en ese proceso y se pierden al
pararlo (o se guardan en la carpeta indicada en `AMAPOLA_DEMO_DIR`). La demo nunca se conecta a Supabase.

### Configuración real (Supabase)

1. Crea un proyecto en Supabase (región de la UE).
2. **Authentication → Sign In / Providers**: desactiva *Allow new users to sign up* (registro público). Mantén
   activado el proveedor de email.
3. **Authentication → URL Configuration**: pon la URL de la aplicación en *Site URL* y añade
   `<URL>/auth/confirm` a *Redirect URLs*.
4. **Authentication → Emails**: en las plantillas *Invite user* y *Reset password*, usa este enlace
   (cambiando `type` a `invite` o `recovery`):
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
5. Aplica las migraciones, en orden, desde **SQL Editor** (pega cada archivo de `supabase/migrations/`) o con la
   CLI: `supabase link --project-ref <ref>` y `supabase db push`.
   No ejecutes `lib/db/shim.sql`: es solo para la base embebida de tests y demo.
6. Copia `env.example` a `.env.local` y rellena las variables. `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` son
   privadas: solo en el servidor, nunca en el repositorio.

### Primeras administradoras

Sin emails inventados ni contraseñas compartidas:

1. En Supabase, **Authentication → Users → Invite user**, invita el email de Maite y el del responsable de ecommerce.
2. En **SQL Editor**, da de alta su perfil de administración (la función no es accesible desde la aplicación):

   ```sql
   select public.bootstrap_admin('email-de-maite', 'Maite');
   select public.bootstrap_admin('email-del-responsable', 'Responsable ecommerce');
   ```

3. Cada una abre el enlace del email y elige su contraseña.
4. Al resto del equipo se le invita desde la aplicación: menú de usuario → **Administración**.

## Arranque local

```bash
npm run dev       # con .env.local apuntando a Supabase
```

## Comprobaciones

```bash
npm run lint
npm run typecheck
npm test            # reglas de negocio, RLS y fechas, sobre Postgres embebido con las migraciones reales
npm run build
npm run test:e2e    # navegador (Playwright) contra la demo local; PW_CHANNEL=chrome usa el Chrome instalado
```

`npm test` no necesita Docker ni Supabase: aplica las migraciones de `supabase/migrations/` en PGlite con un sustituto
mínimo del esquema `auth`. Verifica las reglas de la base de datos, no el servicio de Supabase en sí.

## Despliegue recomendado

1. Proyecto de Supabase de producción configurado como arriba.
2. Aplicación en Vercel (u otro alojamiento de Node): define las cinco variables de `env.example` como variables de
   entorno del proyecto. No definas `AMAPOLA_DEMO`.
3. Tras el primer despliegue, comprueba: entrar, crear una tarea, invitar a una persona y abrir su enlace.
4. Para cambios de esquema futuros, añade un archivo nuevo en `supabase/migrations/`; no edites los ya aplicados.

## Copias de seguridad y restauración

**No hay copias configuradas por este proyecto.** Opciones:

- Supabase hace copias diarias automáticas en los planes de pago (Database → Backups); en el plan gratuito no.
  Comprueba qué incluye tu plan antes de confiar en ello.
- Copia manual (requiere `pg_dump`, con la cadena de conexión directa, puerto 5432):

  ```bash
  pg_dump "$DIRECT_DATABASE_URL" --schema=public --no-owner --no-privileges -Fc -f amapola-$(date +%F).dump
  ```

- Restauración en un proyecto nuevo: aplica las migraciones, recrea los usuarios de Auth y después
  `pg_restore --data-only --disable-triggers -d "$DIRECT_DATABASE_URL" amapola-AAAA-MM-DD.dump`.
  Los perfiles dependen de `auth.users`: si los usuarios se recrean con otros identificadores, hay que reasignarlos.
  Ensaya la restauración una vez en un proyecto de pruebas.

Los archivos de Figma y Drive no se guardan aquí: solo sus enlaces. Guardar un enlace no concede acceso al archivo.

## Fuera de alcance (a propósito)

Arrastrar y soltar, cuadros de ventas o ROAS, publicación automática, integraciones OAuth, IA, chat, avisos por
email, presupuestos, varias organizaciones, importadores y subida de archivos.
