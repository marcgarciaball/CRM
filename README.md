# Workspace

Espacio de trabajo interno y privado para un equipo que lleva el marketing de **varios clientes**: campañas,
entregables (newsletters, anuncios, publicaciones, landings), tareas y los enlaces a sus materiales, con planificación
mensual, diapositiva de contenido por pieza y flujo de revisión y validación. Cada cliente tiene su propio espacio y
solo lo ven las personas que tienen acceso a él.

«Workspace» es un nombre provisional: el nombre del producto vive en una sola constante, `APP_NAME` en `lib/brand.ts`.

La herramienta registra el trabajo; **no publica nada** en Meta, Google, Shopify ni en la plataforma de email.

- Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase (PostgreSQL + Auth + Storage) · npm
- Interfaz en español (España), zona horaria Europe/Madrid, semana de lunes a domingo.

## Clientes, roles y acceso

- **Crear un cliente te convierte en su Propiedad.** Cualquier persona con acceso a la aplicación puede crear uno
  (`/clientes` o «Crea tu primer cliente» en el inicio).
- **La Propiedad añade personas por email** desde los ajustes del cliente (`/c/<cliente>/ajustes`), con el rol
  **Miembro** o **Propiedad**. Si el email ya tiene cuenta, la persona entra al momento; si no, recibe una invitación
  por email para elegir contraseña (o entrar con Google con ese mismo email).
- **Cada persona solo ve sus clientes**: ni su trabajo, ni sus personas, ni sus avisos, ni sus resultados de búsqueda.
  Lo hace cumplir la base de datos (RLS y triggers), no solo las pantallas.
- Dos niveles por cliente:

  | | Miembro | Propiedad |
  |---|---|---|
  | Ver el cliente y todo su trabajo | sí | sí |
  | Crear y editar campañas, entregables, tareas, enlaces y comentarios | sí | sí |
  | Validar entregables | no | sí |
  | Eliminar definitivamente | no | sí |
  | Añadir y quitar personas, cambiar su rol | no | sí |
  | Renombrar, archivar y restaurar el cliente | no | sí |

  Un cliente puede tener varias propiedades y siempre conserva al menos una: la última no se puede quitar, rebajar ni
  salir. Cualquier miembro puede salir de un cliente.
- **La administración de plataforma no da acceso a ningún cliente.** En `/admin/usuarios` solo se renombra a personas,
  se les quita o devuelve el acceso a la aplicación y se nombra o retira a otras administraciones. No se puede quitar el
  acceso a quien es la única Propiedad de un cliente activo.
- Un cliente archivado queda en solo lectura y fuera del selector hasta que su Propiedad lo restaura. No se borra.

## Cómo está construido

- **Datos**: `supabase/migrations/` (tablas e índices, reglas de negocio en triggers, RLS). Todo el trabajo pertenece a
  un cliente; la base de datos rechaza enlazar registros de clientes distintos.
- **Reglas editoriales en la base de datos**: transiciones de estado, validación solo por la Propiedad del cliente,
  invalidación de la validación al cambiar el copy, la creatividad final o un material con aprobación, historial y
  registro de publicaciones. No se pueden saltar desde la interfaz ni desde la API de Supabase.
- **Acceso a datos**: el servidor se conecta a Postgres (`DATABASE_URL`) y ejecuta cada petición en una transacción
  con el rol `authenticated` y la identidad de la persona, de modo que RLS aplica siempre (`lib/db`).
- **Autenticación**: Supabase Auth con email y contraseña o con Google, solo por invitación. Una sesión sin perfil
  activo en `profiles` no ve ni modifica nada (entrar con Google no da acceso por sí solo).
- **Archivos**: la creatividad final de cada pieza va a un bucket privado `creatives` de Supabase Storage; se lee
  siempre a través de `/media/<id>`, que comprueba el acceso.
- **Diseño**: negro, blanco y naranja; tokens y clases comunes en `app/globals.css`.
- **Código**: `lib/services` (consultas), `app/actions` (acciones de servidor), `app/(app)` (pantallas), `components`.

## Instalación

```bash
npm install
```

### Probar sin configurar nada: demo local

```bash
npm run demo      # http://localhost:3000  (equivale a WORKSPACE_DEMO=1 next dev)
```

Arranca con una base de datos Postgres embebida (PGlite) **en memoria** y datos **ficticios** (`lib/demo/seed.ts`):
personas con emails `@demo.invalid`, enlaces a `example.com` y ninguna cifra de negocio. Hay dos clientes, «Estudio
Demo» y «Tienda Demo»; Elisa está en los dos y Sara solo en el estudio, para ver el aislamiento. Se entra eligiendo una
persona, sin contraseña, y no se envía ningún email. **No es un espacio multiusuario conectado**: los datos viven en
ese proceso y se pierden al pararlo. La demo nunca se conecta a Supabase.

Para conservar los datos entre reinicios, define `WORKSPACE_DEMO_DIR` (por ejemplo `.demo-data`). Una carpeta de demo
ya creada **no recibe migraciones nuevas**: si el esquema cambia, bórrala (y su carpeta `<dir>-uploads`) para que se
cree de nuevo.

> **Cambio de nombre de variables.** Las antiguas `AMAPOLA_DEMO` y `AMAPOLA_DEMO_DIR` se llaman ahora
> `WORKSPACE_DEMO` y `WORKSPACE_DEMO_DIR`, y la cookie de la demo es `workspace_demo_user`. Si tu `.env.local` u otro
> script usa los nombres antiguos, cámbialos a mano: con los nombres antiguos la aplicación no entra en modo demo (busca
> `DATABASE_URL` y Supabase).

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
   CLI: `supabase link --project-ref <ref>` y `supabase db push`. La última crea el bucket privado `creatives`.
   No ejecutes `lib/db/shim.sql`: es solo para la base embebida de tests y demo.
6. Copia `env.example` a `.env.local` y rellena las variables. `SUPABASE_SECRET_KEY` (o la heredada
   `SUPABASE_SERVICE_ROLE_KEY`) y `DATABASE_URL` son privadas: solo en el servidor, nunca en el repositorio.

### Entrar con Google

Opcional. Entrar con Google **no crea acceso**: solo entra quien ya tiene un perfil activo (porque una Propiedad lo
añadió a un cliente, o con `bootstrap_admin`); el resto no entra.

1. En Google Cloud Console, **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo
   de aplicación **Web**. En *URI de redireccionamiento autorizados* pon
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. En Supabase, **Authentication → Sign In / Providers → Google**: activa el proveedor y pega el ID de cliente y el
   secreto. *Allow new users to sign up* **no** está en el panel de Google: es un ajuste de todo el proyecto
   (**Authentication → Sign In / Providers**, opciones de registro de usuarios); mantenlo **desactivado**. Con el
   registro desactivado, una cuenta de Google sin invitar la rechaza Supabase y vuelve a la pantalla de entrada con el
   aviso de Google; quien sí fue invitada pero está desactivada llega a `/sin-acceso` con la sesión cerrada.
3. En **Authentication → URL Configuration**, añade `<URL>/auth/confirm` a *Redirect URLs* (con `<URL>` igual a
   `NEXT_PUBLIC_SITE_URL`).

No hacen falta variables nuevas: el ID y el secreto de Google se guardan en Supabase, no en la aplicación.

**No verificado:** si Supabase enlaza la identidad de Google con una cuenta invitada que aún no ha confirmado su
email. Si al entrar con Google una persona recién invitada no llega a su espacio, la alternativa es que abra primero el
enlace de su invitación (y elija contraseña) y después entre con Google. Detrás de un proxy inverso propio (no en
Vercel), la vuelta de Google puede redirigir al host interno: ver `PROJECT_STATUS.md`.

### Primera cuenta y primer cliente

Sin emails inventados ni contraseñas compartidas:

1. En Supabase, **Authentication → Users → Invite user**, invita tu email.
2. En **SQL Editor**, da de alta tu perfil (la función no es accesible desde la aplicación):

   ```sql
   select public.bootstrap_admin('tu-email', 'Tu nombre');
   ```

   Esto te hace administración de plataforma, que **no** da acceso a ningún cliente.
3. Abre el enlace del email y elige tu contraseña (o entra con Google con ese email).
4. En el inicio, pulsa **Crea tu primer cliente**: serás su Propiedad.
5. Desde los ajustes del cliente, añade al resto del equipo por email. No hay invitaciones desde la administración.

## Arranque local

```bash
npm run dev       # con .env.local apuntando a Supabase
```

## Comprobaciones

```bash
npm run check       # lint, typecheck, pruebas y build, en ese orden
npm run lint
npm run typecheck
npm test            # reglas de negocio, acceso por cliente, RLS y fechas, sobre Postgres embebido con las migraciones reales
npm run build
PW_CHANNEL=chrome npm run test:e2e    # navegador (Playwright) contra la demo local, con el Chrome instalado
```

`npm test` no necesita Docker ni Supabase: aplica las migraciones de `supabase/migrations/` en PGlite con un sustituto
mínimo del esquema `auth`. Verifica las reglas de la base de datos, no el servicio de Supabase en sí. La base de pruebas
tiene una sola conexión, así que no prueba bloqueos bajo concurrencia.

## Despliegue recomendado

1. Proyecto de Supabase de producción configurado como arriba.
2. Aplicación en Vercel (u otro alojamiento de Node): define las cinco variables de `env.example` como variables de
   entorno del proyecto. No definas `WORKSPACE_DEMO`.
3. Tras el primer despliegue, comprueba: entrar (con email y con Google), crear un cliente, crear una tarea, añadir a
   una persona por email y abrir su invitación.
4. Para cambios de esquema futuros, añade un archivo nuevo en `supabase/migrations/`; no edites los ya aplicados.

## Copias de seguridad y restauración

**No hay copias configuradas por este proyecto.** Opciones:

- Supabase hace copias diarias automáticas en los planes de pago (Database → Backups); en el plan gratuito no.
  Comprueba qué incluye tu plan antes de confiar en ello.
- Copia manual (requiere `pg_dump`, con la cadena de conexión directa, puerto 5432):

  ```bash
  pg_dump "$DIRECT_DATABASE_URL" --schema=public --no-owner --no-privileges -Fc -f workspace-$(date +%F).dump
  ```

- Restauración en un proyecto nuevo: aplica las migraciones, recrea los usuarios de Auth y después
  `pg_restore --data-only --disable-triggers -d "$DIRECT_DATABASE_URL" workspace-AAAA-MM-DD.dump`.
  Los perfiles dependen de `auth.users`: si los usuarios se recrean con otros identificadores, hay que reasignarlos.
  Los archivos del bucket `creatives` no van en el volcado: cópialos aparte.
  Ensaya la restauración una vez en un proyecto de pruebas.

Los archivos de Figma y Drive no se guardan aquí: solo sus enlaces. Guardar un enlace no concede acceso al archivo.

## Fuera de alcance (a propósito)

- Marca, campos, canales o flujos propios por cliente: todos usan el mismo modelo de campañas, entregables y tareas.
- Un rol de revisión limitado para el personal del propio cliente: solo hay Propiedad y Miembro.
- Registro público, otros proveedores de entrada aparte de Google, facturación.
- Mover trabajo de un cliente a otro; borrar un cliente definitivamente (solo se archiva).
- Traducir la interfaz: sigue en español.
- Cuadros de ventas o ROAS, publicación automática, IA, chat, avisos por email, presupuestos e importadores.
