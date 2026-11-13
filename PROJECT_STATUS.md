# Estado del proyecto · Workspace

Actualizado: 2026-11-13

(Antes «Amapola Workspace». Las notas de historial de más abajo conservan los nombres de su momento.)

## Resumen (multi-cliente, Google y rediseño, tareas 1–10 terminadas)
- **Clientes y acceso**: todo el trabajo pertenece a un cliente; cada persona solo ve los clientes en los que está.
  Dos roles por cliente, Propiedad y Miembro; la última Propiedad no se puede quitar. Quien crea un cliente es su
  Propiedad; la Propiedad añade personas por email (máximo 20 emails distintos por persona en 24 horas). La
  administración de plataforma (`/admin/usuarios`) no da acceso a ningún cliente. Lo hace cumplir la base de datos.
- **Entrada**: email y contraseña o Google, solo por invitación. La primera cuenta se crea con `bootstrap_admin` y
  después se crea el primer cliente desde la aplicación (README).
- **Aspecto**: negro, blanco y naranja en todas las pantallas (ver «Decisiones»).
- **Nombres neutros**: `package.json` «workspace»; variables `WORKSPACE_DEMO` y `WORKSPACE_DEMO_DIR` (antes
  `AMAPOLA_DEMO` y `AMAPOLA_DEMO_DIR`); cookie de la demo `workspace_demo_user` (antes `amapola_demo_user`).
  **Hay que renombrar a mano** las variables antiguas en `.env.local` o en cualquier script propio (el entorno de
  trabajo no permite leer ni escribir `.env*`, así que no se ha comprobado si las tiene). «Amapola» solo queda en la
  migración que traslada los datos existentes (nombre del cliente), en los comentarios de cabecera de las migraciones
  ya escritas, en `Prompt para Amapola Workspace.md` y en las notas de historial de este archivo.
- **Demo persistente**: una carpeta `WORKSPACE_DEMO_DIR` ya creada no recibe migraciones nuevas. Bórrala (y su
  carpeta `<dir>-uploads`) para que se cree de nuevo con el esquema actual.

## Decisiones
- Next.js 16 (App Router, sin Cache Components) + Tailwind 4 + npm. Componentes propios pequeños en `components/`
  (no se instaló la CLI de shadcn).
- Supabase solo para Postgres y Auth. Los datos se leen/escriben desde el servidor por conexión Postgres
  (`DATABASE_URL`), cada petición en una transacción con rol `authenticated` + `auth.uid()`: RLS aplica siempre.
- Reglas editoriales en triggers de Postgres (`supabase/migrations/…_logic.sql`). La interfaz solo las refleja.
- Una tarea con entregable no guarda campaña propia: la hereda del entregable (restricción `tasks_single_parent`).
- Solo el copy y los materiales marcados «requiere aprobación» invalidan la aprobación. El brief, las fechas, los
  comentarios y las referencias no.
- Concurrencia optimista con columna `version`; el formulario avisa y permite sobrescribir.
- Demo y tests usan PGlite con las migraciones reales + `lib/db/shim.sql` (sustituto mínimo del esquema `auth`).
- Diseño en todas las pantallas (tarea 10): mismas reglas que la tarea 9. Listas y tablas separadas por reglas de
  1px (sin tarjetas en caja; quedan como paneles únicos la ficha «siguiente paso», la diapositiva y las tarjetas del
  kanban); fechas, recuentos e insignias en Plex Mono; el naranja solo como relleno con texto negro o como marca, nunca
  como color de texto sobre blanco; avisos con fondo naranja y texto negro; sin sombras, desenfoques, degradados ni
  píldoras; `hover:bg-subtle` en lugar del antiguo `hover:bg-bg`. Casillas y radios nativos en tinta (`accent-color`).
  El punto de «sin leer» de Novedades sigue redondo (`rounded-[50%]`, porque el tema anula los radios); el «hoy» del
  calendario pasa de círculo negro a cuadrado naranja y el avatar sigue cuadrado (decisión de la tarea 9). La
  diapositiva conserva sus dos paneles (izquierda información, derecha panel `subtle`).
- Diseño (multi-cliente, tarea 9): negro, blanco y naranja (#0a0a0a / #fff / #ff5a00), Archivo + IBM Plex Mono
  (`@fontsource`), esquinas cuadradas, reglas negras en lugar de sombras. Tokens y clases comunes en
  `app/globals.css`; nombre del producto en `lib/brand.ts` (`APP_NAME`, provisional «Workspace»). Hechos: tokens,
  login, marco (barra lateral, cabecera, selector de cliente, navegación) y `components/ui.tsx`. El resto de
  pantallas se pasa al estilo nuevo en la tarea 10. Verificado: `npm run check` (141 pruebas), contraste AA con un
  script, y la demo por HTTP (HTML y CSS servidos con los tokens y fuentes nuevos). NO verificado: nada en navegador
  (aspecto, foco, móvil); el aprobado visual de Marc quedó cancelado por él.

## Estado
- Etapas A–D implementadas. Rediseño de usabilidad (2026-11-11) a petición del equipo:
  - Aspecto más ligero (texto en Roboto, esquinas suaves, barra lateral clara).
  - «Crear» en ventana emergente desde cualquier página (tarea, entregable, enlace).
  - Edición en la propia lista: estado, persona y fecha de tareas; responsable y fecha de entregables.
  - Arrastrar y soltar en kanban (estado) y calendario mensual (fecha). Los selectores siguen como alternativa
    accesible y para móvil (el arrastre nativo no funciona en pantallas táctiles).
  - Novedades (campana) calculadas del historial + `profiles.notifications_seen_at` (migración 4). Búsqueda global.
  - Fichas más cortas: un único «siguiente paso» en entregables; edición, historial y opciones plegados.
- Verificado: lint, typecheck, `npm test` (27 pruebas entonces; 93 ahora), build de producción, y carga de todas las pantallas en la
  demo con datos sembrados (peticiones HTTP como miembro y como administradora).
- NO verificado: `e2e/workflow.spec.ts` está escrito y adaptado al rediseño pero no se ha ejecutado nunca (el
  entorno no permite lanzar un navegador). Por tanto no se ha probado en navegador ningún clic, formulario, ventana
  emergente ni arrastre. Tampoco nada contra un proyecto real de Supabase: login, invitaciones, driver `pg`.
- Rutas por cliente (multi-cliente, tarea 5): las pantallas viven en `/c/<cliente>/…`; `/` lleva al único cliente o
  lista los clientes; cualquier ruta antigua (`/trabajo`…) redirige a `/`. Verificado con la demo (curl): `/trabajo`
  → 307, `/c/abc/trabajo` y `/c/<uuid ajeno>/trabajo` → 404, resto de pantallas → 200. NO verificado en navegador:
  los casos nuevos del e2e y las rutas actualizadas del spec no se han ejecutado; tampoco la vista de solo lectura de
  un cliente archivado (no hay cliente archivado en la demo).
- Gestión de clientes (multi-cliente, tarea 6): selector de cliente (barra lateral y cabecera móvil), inicio con
  todos los clientes (lo que te necesita + un bloque por cliente; con uno solo, directo a él; sin ninguno, «Crea tu
  primer cliente»), `/clientes` (crear, archivados, restaurar) y `/c/<cliente>/ajustes` (datos, personas, añadir por
  email o invitar, reenviar invitación, quitar, salir, archivar). «Crear» fuera de un cliente pregunta el cliente y
  abre la ventana con `?crear=1`. La invitación de `admin/usuarios` se ha quitado (se invita desde los ajustes del
  cliente). La demo tiene dos clientes: «Estudio Demo» y «Tienda Demo» (Elisa en los dos; Sara solo en el estudio).
  Verificado: `npm run check` (111 pruebas, incl. las acciones de clientes en modo demo) y la demo por HTTP (Sara →
  404 en la tienda, Elisa → 200; ajustes de propiedad y de miembro). NO verificado: los casos nuevos del e2e (sin
  navegador) ni, contra Supabase real, el envío de invitaciones (`inviteUserByEmail`) y reenvíos
  (`resetPasswordForEmail`). Invitar a un email que ya tiene cuenta de Auth sin perfil depende de que Supabase acepte
  la invitación; si la rechaza, se muestra su mensaje.
- Administración de plataforma y Google (multi-cliente, tareas 7 y 8): `/admin/usuarios` solo lista perfiles (nombre,
  rol de plataforma, acceso), sin datos de clientes; si se intenta quitar el acceso a la única propiedad de un cliente,
  se muestra el mensaje de la base de datos con los clientes. «Entrar con Google» en `/login` (no en la demo):
  `signInWithGoogleAction` y `/auth/confirm` (rama `code`: sin perfil activo → se cierra la sesión y `/sin-acceso`; `next`
  siempre por `safeNext`). Verificado: `npm run check` (136 pruebas, incl. la ruta `/auth/confirm` con Supabase Auth
  simulado y la acción), y un build sin demo con valores falsos de Supabase por curl: `/login?error=google` muestra el
  aviso y el botón, `/login` sin error no muestra el aviso, `/auth/confirm` sin parámetros o con `error` → 307 a
  `/login?error=google`. NO verificado: nada contra Google ni Supabase reales (consentimiento, intercambio del código,
  enlace de identidad con una cuenta invitada sin confirmar: alternativa en el README), ni en navegador; los dos casos
  nuevos del e2e (el segundo necesita `E2E_NON_DEMO=1` contra un servidor sin demo) no se han ejecutado.

## Diapositiva de contenido (2026-11-11)
Sustituye al PPTX de calendario y piezas. Se construyó cuando el trabajo multicliente iba por la tarea 3; las tareas
4–10 lo llevaron después a las rutas por cliente y al estilo nuevo.
- Migración `20261111000004_content_slides.sql`: campos `formats`, `creative_format` (estático / dinámico /
  carrusel), `inspo`, `copy_in`; tabla `deliverable_assets` (archivos de la creatividad final, ordenados, con RLS
  por cliente); estados nuevos `waiting_client`, `waiting_marketing`, `on_hold`, `discarded`; canales `linkedin` y
  `linkedin_ad`. «Aprobado» se muestra ahora como «Validado».
- Ficha del entregable = diapositiva: izquierda, información y copy out; derecha (gris), propuesta creativa y, cuando
  se sube, la creatividad final (imagen, vídeo reproducible o carrusel ordenable). Calendario → vista «Diapositivas»:
  todas las piezas del mes, una tras otra, en solo lectura.
- Decisiones: el copy in y subir o quitar archivos finales cuentan como cambio de contenido (nueva revisión; lo
  validado vuelve a revisión). Reordenar un carrusel, la inspo y los formatos no. Aparcar (espera / pausa) no es un
  atajo: solo se vuelve a «validado» si la revisión actual sigue validada. Lo descartado no cuenta como atrasado ni
  en el progreso de la campaña.
- Archivos: bucket privado `creatives` de Supabase Storage. El navegador sube directamente con una dirección firmada
  (`app/actions/assets.ts` → `lib/storage.ts`) y lee siempre a través de `/media/<id>`, que comprueba el acceso en
  la base de datos y redirige a un enlace firmado de 10 minutos. Límites: 20 archivos por pieza; imágenes 20 MB,
  vídeo 200 MB (el plan gratuito de Supabase limita a 50 MB por archivo). En la demo, disco local.
- Verificado entonces: `npm run check` (lint, tipos, 93 pruebas, build). En la demo, por HTTP: todas las pantallas, subida de
  tres imágenes a un carrusel (preparar → enviar → confirmar), lectura idéntica al original, rangos (206), y los
  rechazos (SVG, confirmar sin subir, reenviar a la misma ruta, sin sesión, ruta con `..`, persona sin acceso).
- NO verificado: nada en un navegador (visor, reproducción de vídeo, botones de orden y de quitar, barra de progreso)
  y nada contra Supabase Storage real (subida firmada con PUT, enlace firmado, creación del bucket).
- Pendiente conocido: una subida que no llega a confirmarse deja un fichero huérfano en el almacén (no hay
  limpieza). `all-migrations.sql` no incluye la migración nueva. Una demo con `WORKSPACE_DEMO_DIR` (antes `AMAPOLA_DEMO_DIR`) ya
  creada no recibe migraciones nuevas: hay que borrar la carpeta.

## Verificado (tarea 10, 2026-11-12)
- `npm run check`: lint y typecheck sin salida; `Test Files 12 passed (12)`, `Tests 141 passed (141)`; build
  `✓ Compiled successfully` y `✓ Generating static pages (12/12)`.
- Búsquedas sin resultados: estilo antiguo en `app` y `components` (`rounded-(xl|lg|full|pill)`, `shadow-`,
  `backdrop-blur`, colores y fuente antiguos, `bg-bg`) y «amapola» en el código, los tests, e2e y la configuración.
- Demo por HTTP con `WORKSPACE_DEMO=1` y la cookie `workspace_demo_user`, como Propiedad (Maite) y como Miembro
  (Sara): todas las pantallas de `app/(app)` → 200 (la administración → 200 para Maite y 307 a `/` para Sara); un
  cliente ajeno como Sara → 404; direcciones antiguas → 307 a `/`; sin cookie o con la cookie antigua → `/login`. La
  tabla completa está en el informe de la tarea 10.

## NO verificado / límites conocidos
1. **Nada en un navegador.** Playwright no se ha ejecutado nunca en este entorno (no puede lanzar un navegador): ni
   clics, ni formularios, ni la ventana «Crear», ni el arrastre, ni el aspecto, el foco o el móvil. Para hacerlo:
   `PW_CHANNEL=chrome npm run test:e2e`.
2. **Nada contra un proyecto real de Supabase**: las migraciones en Postgres real; el bloqueo de filas bajo
   concurrencia (la regla de la última Propiedad y el límite de invitaciones dependen de bloqueos de fila que la base de
   pruebas, de una sola conexión, no puede ejercitar); los emails de invitación y de recuperación; la entrada con Google;
   el enlace de la identidad de Google con una cuenta invitada que aún no ha confirmado su email; Supabase Storage.
3. Una persona con cuenta de Auth confirmada pero sin perfil no se puede añadir desde la aplicación (Supabase responde
   `email_exists`). El arreglo sería una función de búsqueda en la base de datos; no está hecho.
4. Detrás de un proxy inverso propio, la vuelta de Google puede redirigir al host interno, porque `/auth/confirm` crea
   las redirecciones a partir de la URL de la petición y no de `NEXT_PUBLIC_SITE_URL` (en Vercel no pasa).
5. Un trigger distingue «pertenece a otro cliente» de «no existe» al recibir un id, lo que revela que ese id existe.
6. Añadir personas por email le dice a la Propiedad si un email ya tiene cuenta; está limitado a 20 emails distintos
   por persona en 24 horas.
7. Los avisos de clientes archivados siguen contando en el número de no leídos; la búsqueda devuelve como mucho 15
   resultados por tipo entre todos los clientes.
8. Dos carreras estrechas: desactivar a la última Propiedad mientras otro cambio de Propiedad está sin confirmar, y
   restaurar un cliente mientras se desactiva a su única Propiedad.
9. La categoría sugerida de un enlace ya no reconoce `byamapolalab.com` como «Tienda» (se quitó al hacer neutros los
   nombres): esos enlaces se sugieren como «Otro» y se cambian a mano. Shopify sigue reconociéndose.
10. `e2e/zz-debug.spec.ts` es un archivo temporal de otra persona que todavía usa rutas antiguas (`/campanas/nueva`):
   fallará si se ejecuta Playwright. No se ha borrado; su dueño debe borrarlo o actualizarlo.

## Bloqueos / pendiente externo
- Crear el proyecto de Supabase, aplicar migraciones, variables de entorno, primeras administradoras (README).
- No se pudo crear `.env.example` (permisos del entorno): la plantilla está en `env.example`. Renombrar si se quiere.
- Sin despliegue. El código está en la rama `multi-client-content-slides` (2026-11-13); `main` no se ha tocado.
- La revisión final de todo el proyecto (multi-cliente + diapositivas juntos) no se ha hecho: se canceló a medias.

## Siguiente paso
1. Borrar o actualizar `e2e/zz-debug.spec.ts`; después `PW_CHANNEL=chrome npm run test:e2e` y corregir lo que falle.
2. Renombrar `AMAPOLA_DEMO*` a `WORKSPACE_DEMO*` en `.env.local` si aparecen, y borrar la carpeta de demo persistente
   si existe.
3. Conectar Supabase de pruebas y repasar a mano: migraciones, entrar con email y con Google, añadir por email,
   invitación, reenvío y recuperación de contraseña, enlace de identidad de una invitada sin confirmar, subida de
   archivos.
4. Elegir el nombre definitivo del producto (`APP_NAME` en `lib/brand.ts`).
