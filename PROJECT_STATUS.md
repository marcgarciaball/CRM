# Estado del proyecto · Amapola Workspace

Actualizado: 2026-11-11

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
- Diseño: tokens en `app/globals.css`. De la tienda se conservan los colores verificados (#121212 / #fff / #f3f3f3 /
  #f6e6af / #334fb4 / #242833) y Roboto Mono solo en el nombre. Propuesta propia: Roboto, esquinas suaves, colores
  de estado.

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

## Diapositiva de contenido (2026-11-11)
Sustituye al PPTX de calendario y piezas. Construido sobre el trabajo multicliente a medias (tareas 1–3 del plan
`docs/superpowers/plans/2026-11-11-multi-client-google-login-redesign.md`; las tareas 4–10 siguen pendientes).
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
- Verificado: `npm run check` (lint, tipos, 93 pruebas, build). En la demo, por HTTP: todas las pantallas, subida de
  tres imágenes a un carrusel (preparar → enviar → confirmar), lectura idéntica al original, rangos (206), y los
  rechazos (SVG, confirmar sin subir, reenviar a la misma ruta, sin sesión, ruta con `..`, persona sin acceso).
- NO verificado: nada en un navegador (visor, reproducción de vídeo, botones de orden y de quitar, barra de progreso)
  y nada contra Supabase Storage real (subida firmada con PUT, enlace firmado, creación del bucket).
- Pendiente conocido: una subida que no llega a confirmarse deja un fichero huérfano en el almacén (no hay
  limpieza). `all-migrations.sql` no incluye la migración nueva. Una demo con `AMAPOLA_DEMO_DIR` ya creada no recibe
  migraciones nuevas: hay que borrar la carpeta. Al retomar el plan multicliente, la tarea 5 debe mover también los
  enlaces de `components/slide.tsx`, y `isAdmin` de la ficha sigue mirando el rol global, no la propiedad del cliente.

## Bloqueos / pendiente externo
- Crear el proyecto de Supabase, aplicar migraciones, variables de entorno, primeras administradoras (README).
- No se pudo crear `.env.example` (permisos del entorno): la plantilla está en `env.example`. Renombrar si se quiere.
- Sin repositorio git inicializado ni despliegue.

## Siguiente paso
1. `PW_CHANNEL=chrome npm run test:e2e` y corregir lo que falle.
2. Conectar Supabase de pruebas y repasar a mano login, invitación y recuperación de contraseña.
