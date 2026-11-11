# Multi-client Workspace, Google Login and Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-team Amapola app into a neutral workspace where work is organised by client with per-client access, sign-in works by password or Google, and the interface is black, white and orange.

**Architecture:** Two new tables (`clients`, `client_members`) and a required `client_id` on campaigns, deliverables, tasks and resources. Access is enforced by row-level security through `is_client_member` / `is_client_owner`; elevated work (email lookup, invitations) goes through narrow `security definer` functions. Client screens move under `/c/<client-uuid>/…`; a per-client layout checks membership. Google sign-in uses Supabase OAuth through the existing `/auth/confirm` route. The redesign is made in `app/globals.css` tokens and shared classes plus layout, navigation and login.

**Tech Stack:** Next.js 16.4 (App Router, `proxy.ts`), React 19, Tailwind 4, TypeScript, Supabase Auth + Postgres, `pg` / PGlite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-multi-client-google-login-redesign-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (`AGENTS.md`). The request hook is `proxy.ts`, not `middleware.ts`.
- Never edit migrations `20261110000001`–`4`. Add new files in `supabase/migrations/`, numbered `20261111000001`, `…2`, `…3`. `lib/db/shim.sql` (PGlite only) may be edited.
- Interface text is Spanish (Spain). Vocabulary: "cliente", "propietaria/propietario" → use the neutral noun **"Propiedad"** for the role label and "Miembro" for members (matches the existing `ROLE_LABEL` style "Administración").
- Every data access runs through `withUser` / `load` / `run`; never query as the privileged connection role for user work.
- No new runtime dependencies except `@fontsource/archivo` and `@fontsource/ibm-plex-mono` (Task 9).
- Each task ends with `npm run lint && npm run typecheck && npm test` green; Tasks 5–10 also `npm run build`.
- The project has no git repository. Commit steps apply only if Marc has agreed to `git init`; otherwise skip them.
- Never claim browser, Supabase or Google verification that was not performed. Record what was not verified in `PROJECT_STATUS.md`.
- Two levels per client only: `owner`, `member`. A client always keeps at least one owner.
- At most 20 invitation emails (new or resent) per person per 24 hours.

## Review Focus

1. **Old addresses** (`/trabajo`, `/campanas/<id>`, `/calendario`, `/recursos/<id>` from bookmarks or old emails): redirect to `/`, never a crash. Test in Task 5.
2. **Malformed client segment** (`/c/abc/trabajo`, `/c/<uuid of someone else's client>`): the standard not-found page, never a 500 from a uuid cast. Test in Task 5.
3. **Email entered sloppily or twice** (`" Sara@Test.INVALID "`, or someone already in the client): matched case-insensitively and trimmed; a second add reports "ya tiene acceso" and creates nothing. Test in Task 3.
4. **Tampered `next` on the sign-in return** (`//evil.example`, `https://evil.example`, `/\evil`): falls back to `/`. Test in Task 8.
5. **Google sign-in cancelled or refused** (return with `?error=…` and no code): back to `/login` with a readable message, no blank page. Test in Task 8.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261111000001_clients.sql` | `clients`, `client_members`, `client_id` columns, `activity_log.client_id`, `invitation_log`, data move to "Amapola" |
| `supabase/migrations/20261111000002_client_access.sql` | access functions, RLS replacement, same-client guards, owner approval, archived = read-only |
| `supabase/migrations/20261111000003_client_people.sql` | membership rules, add-by-email functions, people listing, invitation limit, profile visibility, platform-admin guards |
| `lib/services/clients.ts` | all client and membership queries |
| `lib/paths.ts` | every in-app URL builder |
| `lib/brand.ts` | `APP_NAME` |
| `lib/auth-redirect.ts` | `safeNext` |
| `lib/load.ts` | adds `loadClient` |
| `app/(app)/c/[client]/…` | client-scoped screens (moved from `app/(app)/…`) |
| `app/(app)/clientes/page.tsx`, `app/(app)/page.tsx` | clients list, all-clients home |
| `app/actions/clients.ts` | client and people server actions |
| `components/client-switcher.tsx` | switcher in sidebar and mobile header |
| `tests/clients.test.ts`, `tests/access.test.ts`, `tests/people.test.ts`, `tests/paths.test.ts`, `tests/auth-redirect.test.ts` | new tests |

---

### Task 1: Clients in the schema, and services that carry a client

**Files:**
- Create: `supabase/migrations/20261111000001_clients.sql`, `lib/services/clients.ts`, `tests/clients.test.ts`
- Modify: `lib/db/pglite.ts`, `lib/db/shim.sql`, `tests/helpers.ts`, `tests/workflow.test.ts`, `lib/services/{campaigns,deliverables,tasks,resources}.ts`, `lib/demo/seed.ts`

**Interfaces:**
- Produces (SQL): `clients(id, name 1..120, description ≤2000 default '', archived_at, archived_by, created_by, created_at, updated_at, version)`; `client_members(client_id → clients on delete cascade, user_id → profiles, role in ('owner','member'), added_by, created_at, primary key (client_id, user_id))`; `client_id uuid not null references clients` on `campaigns`, `deliverables`, `tasks`, `resources`; `activity_log.client_id uuid` (filled by `log_activity` from the entity); `invitation_log(id, invited_by, email, created_at)`; index on every new `client_id`.
- Produces (SQL): trigger on `clients` insert that adds `auth.uid()` as `owner`; `set_creator` and `touch_row` triggers on `clients`.
- Produces (TS): `createPgliteDriver(dataDir?: string, opts?: { upTo?: string }): Promise<Driver>` (applies migrations whose filename is `<= upTo`), and `applyMigrationsAfter(driver: Driver, after: string): Promise<void>` exported from `lib/db/pglite.ts`.
- Produces (TS, `lib/services/clients.ts`): `type Client = { id: string; name: string; description: string; archived_at: Date | null; version: number; my_role: "owner" | "member" }`; `createClient(q, input: { name: string; description?: string }): Promise<string>`; `getClient(q, id: string): Promise<Client | null>`; `listMyClients(q, f?: { archived?: boolean }): Promise<Client[]>` (only clients where the caller is a member, by name).
- Produces (TS): `CampaignInput`, `DeliverableInput`, `TaskInput`, `ResourceInput` each gain required `client_id: string`. `addNewLink` takes the client from its target. `Campaign`, `Deliverable`, `Task`, `Resource` rows gain `client_id: string` and `client_name: string`. `TaskFilters`, `DeliverableFilters`, `ResourceFilters` and `listCampaigns`' filter gain optional `client?: string`. `campaignOptions(q, clientId)`, `deliverableOptions(q, clientId)`, `campaignsForRange(q, clientId, first, last)`, `findDuplicates(q, clientId, url, excludeId?)`.
- Produces (tests): `setupDb()` returns `{ driver, team, c }` where `c = { a: string; b: string }`. `Team` gains `lonely` (active profile, no client). Memberships: **A** — maite owner, ecommerce owner, ainhoa, sara, elisa members. **B** — ecommerce owner, elisa member. Shim `auth.users` gains `last_sign_in_at timestamptz`.

- [ ] **Step 1: Write the failing tests** in `tests/clients.test.ts`

```ts
it("crear un cliente convierte a quien lo crea en propietaria", async () => {
  const id = await as(t.sara, (q) => createClient(q, { name: "Cliente nuevo" }));
  expect(await as(t.sara, (q) => getClient(q, id))).toMatchObject({ name: "Cliente nuevo", my_role: "owner" });
});
it("listMyClients solo devuelve los clientes propios", async () => {
  expect((await as(t.elisa, (q) => listMyClients(q))).map((x) => x.id).sort()).toEqual([c.a, c.b].sort());
  expect(await as(t.lonely, (q) => listMyClients(q))).toEqual([]);
});
it("la migración mueve los datos existentes al cliente «Amapola»", async () => {
  const d = await createPgliteDriver(undefined, { upTo: "20261110000004_notifications.sql" });
  // insertar: 1 admin, 1 miembro activo, 1 inactivo, 1 campaña, 1 entregable, 1 tarea, 1 recurso
  await applyMigrationsAfter(d, "20261110000004_notifications.sql");
  // esperar: exactamente 1 cliente llamado "Amapola"; las 4 filas con ese client_id;
  // admin → owner, miembro activo → member, inactivo → sin fila en client_members
});
it("en una base vacía la migración no crea ningún cliente", async () => { /* count(*) from clients = 0 antes de setupDb add */ });
```

- [ ] **Step 2:** `npx vitest run tests/clients.test.ts` → FAIL (`createClient` not exported).
- [ ] **Step 3:** Write the migration. Add `client_id` nullable, backfill inside `do $$ … $$` only `if exists (select 1 from profiles)`, then `set not null`. Replace `log_activity` so it fills `client_id` from the deliverable or task.
- [ ] **Step 4:** Implement `lib/db/pglite.ts` changes, `lib/services/clients.ts`, the service signature changes above, and `setupDb`. RLS is still the old `is_member()` rules in this task; add a temporary permissive policy set for `clients` / `client_members` (`is_member()`), replaced in Task 2.
- [ ] **Step 5:** Update `tests/workflow.test.ts` and `lib/demo/seed.ts` call sites to pass `client_id: c.a` (seed: one client "Estudio Demo" for now).
- [ ] **Step 6:** `npm run typecheck && npm test` → all pass (27 existing + 4 new). The app's pages will not typecheck against the new signatures until Task 5; to keep this task green, give each changed page the smallest call-site fix that compiles (pass the first client from `listMyClients`), marked `// TODO(Task 5)`.
- [ ] **Step 7:** Commit `feat: clients table and client_id on work items`.

### Task 2: Isolation between clients

**Files:**
- Create: `supabase/migrations/20261111000002_client_access.sql`, `tests/access.test.ts`
- Modify: `tests/workflow.test.ts` (messages that said "administradora")

**Interfaces:**
- Produces (SQL, all `stable security definer set search_path = public`, execute granted to `authenticated`):
  `is_client_member(p_client uuid) returns boolean` (active profile and a membership row);
  `is_client_owner(p_client uuid) returns boolean`;
  `can_write_client(p_client uuid) returns boolean` (member and `clients.archived_at is null`).
- Produces (SQL): policies dropped and recreated for all work tables — `select` uses `is_client_member`, `insert`/`update` use `can_write_client`, `delete` uses `is_client_owner` and not archived (resource links and own comments: `can_write_client`). Child tables resolve the client through their parent (`resource_links` → resource; `comments` → deliverable or task; `publications` → deliverable; `activity_log` → its own `client_id`).
- Produces (SQL): `clients` — select `is_client_member(id)`, insert `is_member()`, update `is_client_owner(id)`, no delete grant. `client_members` — select `is_client_member(client_id)`; no direct insert/update/delete grants (Task 3 functions only).
- Produces (SQL): before-insert/update guard on `campaigns`, `deliverables`, `tasks`, `resources`, `resource_links`: `client_id` cannot change; a deliverable's campaign, a task's campaign or deliverable, and a link's resource and target must share the client; `owner_id` / `assignee_id` must be a member of that client. Exception text: `'Ese elemento pertenece a otro cliente.'` and `'Esa persona no tiene acceso a este cliente.'`, both `errcode = '42501'`.
- Produces (SQL): `deliverables_before_update` approves only if `is_client_owner(new.client_id)`; message `'Solo una persona propietaria del cliente puede aprobar un entregable.'`, `errcode = '42501'`.

- [ ] **Step 1: Write the failing tests** in `tests/access.test.ts`. Fixture: in `beforeAll`, ecommerce creates in **B** one campaign, deliverable (in review), task, resource, link, comment; maite does the same in **A**.

```ts
const TABLES = ["campaigns", "deliverables", "tasks", "resources", "resource_links", "comments", "activity_log", "publications"] as const;
it.each(TABLES)("sara (solo A) no ve filas de B en %s", async (table) => { /* count of B's rows = 0 */ });
it.each(TABLES)("lonely y outsider no ven nada en %s", …);
it("sara no puede crear, editar ni borrar en B", …);          // insert → 42501; update/delete → 0 rows
it("elisa (miembro de B) trabaja en B pero no aprueba ni borra", …); // approve → code 42501; deletePermanently → forbidden
it("ecommerce (propietaria de B) aprueba y borra en B", …);
it("maite (propietaria de A) no aprueba en B", …);
it("no se puede enlazar un entregable de A con una campaña de B", …);  // 'otro cliente'
it("no se puede asignar una tarea de B a sara", …);                    // 'no tiene acceso'
it("un recurso de A no se puede adjuntar a una tarea de B", …);
it("client_id no se puede cambiar", …);
it("cliente archivado: se lee, no se escribe", …);                      // after owner archives B: select ok, insert → 42501
it("listar sin filtro de cliente devuelve solo lo de mis clientes", …); // elisa: A+B, sara: A
```

- [ ] **Step 2:** `npx vitest run tests/access.test.ts` → FAIL (sara sees B's rows).
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** `npm test` → all pass.
- [ ] **Step 5:** Commit `feat: row-level isolation per client`.

### Task 3: People, roles and invitations

**Files:**
- Create: `supabase/migrations/20261111000003_client_people.sql`, `tests/people.test.ts`
- Modify: `lib/services/clients.ts`, `lib/services/core.ts` (`listProfiles`), `lib/labels.ts`

**Interfaces:**
- Produces (SQL, `security definer`, each raising `42501` unless the caller is an owner of `p_client` and the client is not archived):
  - `add_client_member(p_client uuid, p_email text, p_role text) returns text` → `'added'`, `'already_member'` or `'needs_invitation'`. Email compared `lower(trim(…))`. `'added'` only when an auth user **with a profile** exists.
  - `attach_invited_member(p_client uuid, p_user uuid, p_display_name text, p_role text) returns void` — creates the profile if missing (role `member`), adds the membership.
  - `set_client_member_role(p_client uuid, p_user uuid, p_role text) returns void`.
  - `remove_client_member(p_client uuid, p_user uuid) returns void` — also allowed when `p_user = auth.uid()` (leave). Clears `assignee_id` on that client's tasks not `done`, and `owner_id` on its deliverables not `published` and its campaigns not `completed`.
  - `client_people(p_client uuid) returns table (user_id uuid, display_name text, role text, email text, pending boolean, active boolean)` — callable by any member; `email` is null unless the caller is an owner; `pending` = `auth.users.last_sign_in_at is null`.
  - `record_invitation(p_email text) returns void` — callable by any active profile; inserts into `invitation_log`; raises `'Has alcanzado el límite de 20 invitaciones al día.'` when the caller already has 20 rows in the last 24 hours.
- Produces (SQL): last-owner rule inside the role/remove functions, locking the client's member rows first: `'El cliente debe conservar al menos una persona propietaria.'`
- Produces (SQL): `profiles_select` becomes `id = auth.uid() or is_admin() or` shares a client with the caller; `profiles_insert` grant removed. `profiles_guard` additionally refuses `active → false` for a sole owner of a non-archived client: `'Esta persona es la única propietaria de: <nombres>. Nombra a otra propietaria o archiva el cliente antes.'`
- Produces (TS, `lib/services/clients.ts`): `type ClientPerson = { user_id: string; display_name: string; role: "owner" | "member"; email: string | null; pending: boolean; active: boolean }`; `listClientPeople(q, clientId): Promise<ClientPerson[]>`; `addMemberByEmail(q, clientId, email, role): Promise<"added" | "already_member" | "needs_invitation">`; `attachInvited(q, clientId, userId, displayName, role)`; `setMemberRole(q, clientId, userId, role)`; `removeMember(q, clientId, userId)`; `recordInvitation(q, email)`; `updateClient(q, id, version, patch: { name?: string; description?: string })`; `setClientArchived(q, id, archived: boolean)`.
- Produces (TS): `listProfiles(q, clientId: string, onlyActive = true)` returns that client's people as `Profile[]`. `CLIENT_ROLE_LABEL = { owner: "Propiedad", member: "Miembro" }` in `lib/labels.ts`.

- [ ] **Step 1: Write the failing tests** in `tests/people.test.ts`

```ts
it("añadir por email a alguien con cuenta: aparece al instante", …);   // maite adds lonely@test.invalid to A → "added"; lonely lists A
it("email con mayúsculas y espacios se reconoce", …);                  // " Lonely@TEST.invalid " → "added"
it("añadir dos veces no duplica", …);                                   // second call → "already_member", count = 1
it("email sin cuenta → needs_invitation, y attachInvited crea perfil y acceso", …);
it("una miembro no puede añadir, cambiar roles ni quitar a otra", …);  // sara → 42501 on each
it("una propietaria de A no puede añadir a nadie a B", …);
it("no se puede quitar ni degradar a la última propietaria", …);       // B: ecommerce
it("con dos propietarias, una puede degradar a la otra", …);           // A
it("cualquiera puede salir; al salir pierde el acceso al momento", …); // ainhoa leaves A → listTasks empty
it("al quitar a alguien, sus tareas abiertas quedan sin asignar y las hechas conservan el historial", …);
it("las miembros ven nombres y roles pero no emails; las propietarias ven emails y «pendiente»", …);
it("no veo perfiles de personas con las que no comparto cliente", …);  // sara cannot read lonely's profile; elisa sees ecommerce
it("la invitación 21 del día se rechaza", …);
it("no se puede desactivar a la única propietaria de un cliente activo", …); // maite (admin) deactivating ecommerce → message names B
it("sí se puede tras archivar el cliente o nombrar otra propietaria", …);
it("administración de plataforma no ve datos de clientes ajenos", …);  // maite counts 0 rows of B
```

- [ ] **Step 2:** `npx vitest run tests/people.test.ts` → FAIL.
- [ ] **Step 3:** Write the migration and the service functions (thin wrappers over the SQL functions).
- [ ] **Step 4:** `npm test` → all pass.
- [ ] **Step 5:** Commit `feat: client membership, invitations and people visibility`.

### Task 4: Notices, search and summaries across clients

**Files:**
- Modify: `lib/services/inbox.ts`, `lib/services/clients.ts`, `tests/workflow.test.ts`, `tests/access.test.ts`

**Interfaces:**
- Produces: `listNotices(q, userId)` (the `isAdmin` parameter is removed; "awaiting review" notices go to people who are owner of that deliverable's client). `Notice` and `SearchHit` gain `client_id: string` and `client_name: string`. `searchAll(q, term)` unchanged in signature, searches every client the caller belongs to, skips archived clients.
- Produces: `type ClientSummary = Client & { open_tasks: number; overdue: number; in_review: number; next_publication: string | null }`; `clientSummaries(q, today: string): Promise<ClientSummary[]>` (non-archived clients of the caller).

- [ ] **Step 1: Failing tests** (append to `tests/access.test.ts`)

```ts
it("la búsqueda no devuelve resultados de clientes ajenos y etiqueta el cliente", …); // sara: no B hits; elisa: hits carry client_name
it("«en revisión» avisa a las propietarias de ese cliente, no a las de otro", …);     // B deliverable → ecommerce yes, maite no
it("clientSummaries cuenta por cliente", …);  // elisa gets two rows with the fixture's counts
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npm test` → pass. **Step 5:** Commit `feat: notices, search and summaries per client`.

### Task 5: Client-scoped routes

**Files:**
- Create: `lib/paths.ts`, `tests/paths.test.ts`, `app/(app)/c/[client]/layout.tsx`, `app/(app)/c/[client]/page.tsx`, `app/(app)/[...legacy]/page.tsx`
- Move: `app/(app)/{calendario,trabajo,campanas,recursos}` → `app/(app)/c/[client]/…` (all pages beneath them)
- Modify: `lib/load.ts`, `lib/action.ts`, `app/actions/{work,materials}.ts`, `app/(app)/layout.tsx`, `components/{nav,rows,quick,forms,next-step,danger-zone,materials,discussion,add-link-form,filter-bar}.tsx`, `app/(app)/{buscar,novedades}/page.tsx`

**Interfaces:**
- Produces (`lib/paths.ts`):
  `clientPath(clientId: string, ...rest: string[]): string` → `/c/<id>/<rest…>`;
  `taskPath(x: { client_id: string; id: string })` → `/c/<c>/trabajo/tareas/<id>`;
  `deliverablePath(x)` → `/c/<c>/trabajo/entregables/<id>`; `campaignPath(x)` → `/c/<c>/campanas/<id>`; `resourcePath(x)` → `/c/<c>/recursos/<id>`;
  `swapClient(pathname: string, toClientId: string): string` — same section (`calendario`, `trabajo`, `campanas`, `recursos`, `ajustes`) in the other client, dropping detail ids; anything else → `/c/<to>`.
- Produces (`lib/load.ts`): `loadClient<T>(clientParam: string, fn: (q, user, client: Client) => Promise<T>): Promise<T & { user: Profile; client: Client }>` — calls `notFound()` when the param is not a uuid or `getClient` returns null. `formOptions(q, clientId)`.
- Consumes: Tasks 1–4 services.
- Rules: no component builds an in-app URL by hand; all use `lib/paths.ts`. Every create/edit form posts a hidden `client_id`; actions read it with `uuid(fd, "client_id")` and redirect with the path helpers. `isAdmin` props on `NextStep` and `ArchiveControls` are renamed `isOwner` and fed from `client.my_role === "owner"`. `DELIVERABLE_TRANSITIONS[].adminOnly` → `ownerOnly`. Unknown author or assignee (profile not visible) renders as "Antiguo miembro".
- `app/(app)/c/[client]/page.tsx` is the old home page with every query passing `client: client.id`. `app/(app)/[...legacy]/page.tsx` redirects any unmatched path under the app to `/`.
- An archived client's screens show a banner "Cliente archivado: solo lectura" and hide create/edit controls.

- [ ] **Step 1: Failing tests** in `tests/paths.test.ts`

```ts
expect(clientPath("C", "trabajo")).toBe("/c/C/trabajo");
expect(taskPath({ client_id: "C", id: "T" })).toBe("/c/C/trabajo/tareas/T");
expect(swapClient("/c/A/trabajo/tareas/T", "B")).toBe("/c/B/trabajo");
expect(swapClient("/c/A/calendario", "B")).toBe("/c/B/calendario");
expect(swapClient("/novedades", "B")).toBe("/c/B");
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `lib/paths.ts`; run → PASS.
- [ ] **Step 4:** Move the route folders, add the client layout, `loadClient`, and update pages, actions and components per the rules. Remove every `// TODO(Task 5)`.
- [ ] **Step 5:** `MainNav` takes `clientId?: string`: with a client → Resumen, Calendario, Trabajo, Campañas, Recursos (prefixed); without → Inicio (`/`), Clientes (`/clientes`).
- [ ] **Step 6: Review Focus 1 and 2** — add to `e2e/workflow.spec.ts`: visiting `/trabajo` ends on `/`; visiting `/c/abc/trabajo` and `/c/00000000-0000-4000-8000-000000000000/trabajo` shows the not-found page with status 404. Also verify now with the demo server: `WORKSPACE_DEMO` is not renamed yet, so `AMAPOLA_DEMO=1 npx next start` after build, then `curl -s -o /dev/null -w "%{http_code}"` on those three URLs with the demo cookie → `307`/`308`, `404`, `404`.
- [ ] **Step 7:** `grep -rn 'href="/\(trabajo\|campanas\|calendario\|recursos\)' app components` → no output. `npm run check` → pass.
- [ ] **Step 8:** Commit `feat: client-scoped routes`.

### Task 6: Clients, switcher, settings and the all-clients home

**Files:**
- Create: `app/actions/clients.ts`, `components/client-switcher.tsx`, `app/(app)/clientes/page.tsx`, `app/(app)/c/[client]/ajustes/page.tsx`
- Modify: `app/(app)/page.tsx`, `app/(app)/layout.tsx`, `app/(app)/c/[client]/layout.tsx`, `components/quick.tsx`, `app/(app)/{buscar,novedades}/page.tsx`

**Interfaces:**
- Consumes: Task 3 service functions, `clientSummaries`, `swapClient`.
- Produces (`app/actions/clients.ts`, all `(prev, fd) => Promise<ActionState>` through `run`): `createClientAction` (redirects to `/c/<id>`), `updateClientAction`, `archiveClientAction` (field `archived`), `addMemberAction`, `setMemberRoleAction`, `removeMemberAction` (redirects to `/` when removing oneself), `resendInvitationAction`.
- `addMemberAction` flow: `addMemberByEmail` → if `needs_invitation`: require `display_name`, `recordInvitation`, then demo: insert into `auth.users`; real: `supabaseAdmin().auth.admin.inviteUserByEmail(email, { redirectTo: <site>/auth/confirm?next=/cuenta/contrasena })`; then `attachInvited`. Notices: `"<email> ya tiene acceso."`, `"Acceso concedido."`, `"Invitación enviada a <email>."`, demo `"Persona creada en la demo (no se envía email)."`
- When `addMemberByEmail` returns `added` and that person is still `pending` in `listClientPeople`, `addMemberAction` also sends the resend email below (spec: adding a pending person to another client resends).
- `resendInvitationAction`: owner only, target must be `pending` in `listClientPeople`; `recordInvitation`; `supabaseAuth().auth.resetPasswordForEmail(email, { redirectTo: <site>/auth/confirm?next=/cuenta/contrasena })`. Demo: returns `"No disponible en la demo."`
- `ClientSwitcher({ clients, currentId }: { clients: { id: string; name: string }[]; currentId?: string })` — client component; uses `usePathname` + `swapClient`; entries: each client, "Todos los clientes" (`/`), "Nuevo cliente" (`/clientes#nuevo`). Rendered at the top of the sidebar and in the mobile header.
- `/` : 0 clients → empty state with primary button "Crea tu primer cliente"; exactly 1 → `redirect(clientPath(id))`; otherwise "what needs you" lists (my open tasks, overdue, awaiting review where I am owner) each row labelled with `client_name`, then one block per client from `clientSummaries` linking to its overview.
- `/clientes`: active clients, a "Nuevo cliente" form (`id="nuevo"`, fields name, description), and archived clients with "Restaurar" for owners.
- `/c/<client>/ajustes`: owners — name/description form, people table (name, email, role select, "Pendiente" badge + "Reenviar invitación", "Quitar"), add form (email, name, role), archive button. Members — people list without emails and a "Salir de este cliente" button.
- `QuickCreate`: inside a client, unchanged plus hidden `client_id`, options from that client. Outside a client it renders a menu of the caller's clients linking to `/c/<id>?crear=1`; the client layout opens the pop-up when `crear=1`.
- Search results and notices show a client label and link through `lib/paths.ts`.

- [ ] **Step 1: Failing test** (append to `tests/people.test.ts`): `setClientArchived` by a member → 42501; by an owner → client disappears from `listMyClients(q)` and appears in `listMyClients(q, { archived: true })`; restoring brings it back.
- [ ] **Step 2:** Run → FAIL (or pass if Task 3 already covers it; if it passes, keep it and continue). **Step 3:** Implement the actions, pages and components above.
- [ ] **Step 4:** Update `lib/demo/seed.ts`: two clients, "Estudio Demo" (maite owner; ainhoa, sara, elisa members) and "Tienda Demo" (ecommerce owner; elisa member; sara **not** a member), work in both, `last_sign_in_at = now()` for all seeded people.
- [ ] **Step 5:** Extend `e2e/workflow.spec.ts`: sara sees one client and lands on its overview; elisa sees two and the all-clients home; ecommerce creates a client and adds `sara@demo.invalid`; sara then sees it in the switcher.
- [ ] **Step 6:** `npm run check` → pass. With the demo server running, `curl` as sara (cookie) to `/c/<Tienda Demo id>` → `404`; as elisa → `200`.
- [ ] **Step 7:** Commit `feat: client management, switcher and all-clients home`.

### Task 7: Platform administration page

**Files:**
- Modify: `app/(app)/admin/usuarios/page.tsx`, `app/actions/account.ts`, `app/sin-acceso/page.tsx`, `lib/labels.ts`

**Interfaces:**
- `inviteUserAction` is deleted. `adminUpdateUserAction` keeps name, platform role and active. The page lists all profiles (platform admins can see them), with no client data. A refused deactivation shows the database message naming the clients.
- `ROLE_LABEL = { admin: "Administración de plataforma", member: "Persona" }`.
- `/sin-acceso` copy: "No tienes acceso. Tu cuenta no ha sido invitada o está desactivada. Pide acceso a quien te invitó."

- [ ] **Step 1:** Failing test (append to `tests/people.test.ts`): a non-admin updating another profile's `active` → 42501 (regression guard for the rewritten `profiles_guard`). Run → should already pass; if it fails, fix the migration from Task 3.
- [ ] **Step 2:** Implement the page and action changes. **Step 3:** `npm run check` → pass. **Step 4:** Commit `feat: platform admin page without client access`.

### Task 8: Google sign-in

**Files:**
- Create: `lib/auth-redirect.ts`, `tests/auth-redirect.test.ts`
- Modify: `app/auth/confirm/route.ts`, `app/actions/account.ts`, `app/login/page.tsx`, `README.md`, `env.example`

**Interfaces:**
- Produces: `safeNext(raw: string | null | undefined): string` — returns `raw` only if it starts with a single `/`, contains no `\`, no `//`, and no control characters; otherwise `/`.
- Produces: `signInWithGoogleAction(): Promise<void>` — demo: throws; otherwise `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: <site>/auth/confirm?next=/ } })` and `redirect(data.url)`; on error `redirect("/login?error=google")`.
- `GET /auth/confirm`: `token_hash` branch → `/cuenta/contrasena` (unchanged). `code` branch → exchange, then look up the profile with `withUser`; no active profile → `signOut()` and redirect `/sin-acceso`; else redirect `safeNext(next)`. A request with `error` or with neither `code` nor `token_hash` → `/login?error=google`.
- Login page: the Google button above the email form, separated by a rule labelled "o"; when `searchParams.error === "google"` show "No se ha podido entrar con Google. Inténtalo de nuevo o usa tu email." Not rendered in demo mode.
- README: a "Entrar con Google" section — create an OAuth client (type Web) in Google Cloud; authorised redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`; paste client id and secret into Supabase → Authentication → Providers → Google; keep "Allow new users to sign up" **off**; add `<URL>/auth/confirm` to Redirect URLs. State plainly that identity linking for invited-but-unconfirmed accounts is unverified and what the fallback is (open the invitation link first).

- [ ] **Step 1: Failing tests** in `tests/auth-redirect.test.ts` (Review Focus 4)

```ts
expect(safeNext("/c/abc/trabajo")).toBe("/c/abc/trabajo");
expect(safeNext("/cuenta/contrasena")).toBe("/cuenta/contrasena");
for (const bad of [null, "", "//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "/a//b", "/a\nb"])
  expect(safeNext(bad)).toBe("/");
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `safeNext`; run → PASS.
- [ ] **Step 4:** Implement the action, route and login page.
- [ ] **Step 5: Review Focus 5** — add to `e2e/workflow.spec.ts`: `/login?error=google` shows the message. Verify now by `curl -s http://127.0.0.1:<port>/login?error=google | grep "No se ha podido entrar con Google"` against a non-demo build with dummy Supabase env values, or note in `PROJECT_STATUS.md` that it was only typechecked.
- [ ] **Step 6:** `npm run check` → pass. **Step 7:** Commit `feat: Google sign-in`.

### Task 9: New look — tokens, login, shell (stops for Marc's approval)

**Files:**
- Modify: `package.json` (add `@fontsource/archivo`, `@fontsource/ibm-plex-mono`; remove the two Roboto packages), `app/globals.css`, `app/layout.tsx`, `app/login/page.tsx`, `app/(app)/layout.tsx`, `components/{nav,client-switcher,ui}.tsx`
- Create: `lib/brand.ts`

**Interfaces:**
- Produces: `export const APP_NAME = "Workspace"` in `lib/brand.ts`; used by metadata, login and sidebar.
- Tokens in `@theme` (names the rest of the code already uses stay; values change; blue and yellow go):

```css
--font-sans: "Archivo", ui-sans-serif, system-ui, sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, monospace;
--color-bg: #ffffff;        --color-surface: #ffffff;
--color-ink: #0a0a0a;       --color-dark: #0a0a0a;
--color-muted: #5c5c5c;     --color-line: #d9d9d9;   --color-line-strong: #0a0a0a;
--color-accent: #ff5a00;    --color-accent-ink: #0a0a0a;   /* text on orange */
--color-highlight: #ff5a00; --color-subtle: #f4f4f4; /* hover and zebra rows */
--color-st-neutral-bg: #f4f4f4; --color-st-neutral-fg: #0a0a0a;
--color-st-info-bg: #0a0a0a;    --color-st-info-fg: #ffffff;
--color-st-warn-bg: #ff5a00;    --color-st-warn-fg: #0a0a0a;
--color-st-danger-bg: #fbe3df;  --color-st-danger-fg: #a11d0c;
--color-st-ok-bg: #dff3e3;      --color-st-ok-fg: #14602a;
```

- Rules: radius 0 on cards, fields and buttons, 2px on badges; no `shadow-*`, no `backdrop-blur`, no `rounded-pill` anywhere; `.card` = white with a 1px `line-strong` border; `.btn-primary` = orange fill, black text, black 1px border, hover black fill with white text; `.btn-secondary` = white, black border; `.link` = ink, underlined, hover orange underline; `:focus-visible` = 2px orange outline with 2px offset; `.eyebrow` and dates, counts, badges in the mono face, uppercase for eyebrows and badges. Orange is never used as text colour on white.
- Shell: sidebar black, white text, active item = orange block with black text; client name in the switcher in Archivo 800, uppercase. Top bar white with a 2px black bottom rule. Page titles Archivo 800, 28–40px, tight tracking. Lists and tables separated by 1px rules, not boxed cards.
- Login: full black page, `APP_NAME` large in white with an orange full stop, white form panel with square fields.

- [ ] **Step 1:** `npm install @fontsource/archivo @fontsource/ibm-plex-mono && npm uninstall @fontsource/roboto @fontsource/roboto-mono`. If the sandbox blocks the registry, stop and tell Marc the exact command to run.
- [ ] **Step 2:** Apply tokens, shared classes, shell and login.
- [ ] **Step 3:** `grep -rnE "rounded-(xl|lg|full|pill)|shadow-|backdrop-blur|#334fb4|#f6e6af|Roboto" app components` → no output.
- [ ] **Step 4:** Contrast check with a throwaway script in the scratchpad: ink on white, muted on white, white on ink, ink on orange, each status fg on its bg — all ≥ 4.5:1. Paste the ratios into the task report.
- [ ] **Step 5:** `npm run check` → pass.
- [ ] **Step 6: Checkpoint.** Stop. Ask Marc to run `npm run demo` and look at `/login`, the sidebar with the switcher, and a client's Trabajo list. Do not start Task 10 until he says yes; apply his changes here first.
- [ ] **Step 7:** Commit `feat: black, white and orange design system`.

### Task 10: Roll the look across every screen, rename, and document

**Files:**
- Modify: every page under `app/` and every file in `components/` still carrying old styling; `package.json` (`"name": "workspace"`, script `demo`), `lib/db/index.ts`, `lib/auth.ts`, `proxy.ts`, `playwright.config.ts`, `env.example`, `README.md`, `PROJECT_STATUS.md`, `app/layout.tsx`, migrations' comments untouched

**Interfaces:**
- Renames: env `AMAPOLA_DEMO` → `WORKSPACE_DEMO`, `AMAPOLA_DEMO_DIR` → `WORKSPACE_DEMO_DIR`; cookie `amapola_demo_user` → `workspace_demo_user`; global `__amapolaDriver` → `__workspaceDriver`.
- "Amapola" may remain only in: the data-move migration (client name), `Prompt para Amapola Workspace.md`, and history notes in `PROJECT_STATUS.md`.

- [ ] **Step 1:** Restyle remaining screens to the Task 9 rules: kanban, calendar, detail pages, forms, pop-ups, filter bar, mobile bottom bar, badges, empty states, error, loading and not-found pages. No screen gains a step; inline editing and drag and drop behave as before.
- [ ] **Step 2:** Apply the renames. `grep -rni "amapola" --include="*.ts" --include="*.tsx" --include="*.css" --include="*.json" --include="*.mts" app components lib e2e tests proxy.ts package.json playwright.config.ts env.example` → only the lines allowed above (none in these paths).
- [ ] **Step 3:** Rewrite `README.md` (clients and roles, first account via `bootstrap_admin` then "create your first client", Google setup, new env names, remove "varias organizaciones" and "integraciones OAuth" from out-of-scope, add the spec's non-goals) and `PROJECT_STATUS.md` (decisions, what was verified with command output counts, and a plain "NO verificado" list: browser tests if still unrun, real Supabase, Google sign-in, invitation emails, identity linking).
- [ ] **Step 4:** `npm run check` → pass. Run `PW_CHANNEL=chrome npm run test:e2e`; if the environment cannot launch a browser, record that and give Marc the command.
- [ ] **Step 5:** Demo smoke test over HTTP with the demo cookie for one owner and one member: every route in `app/(app)` returns 200 (or the expected 404 for a foreign client). List the routes and codes in the task report.
- [ ] **Step 6:** Commit `feat: redesign rollout, neutral naming and docs`.
