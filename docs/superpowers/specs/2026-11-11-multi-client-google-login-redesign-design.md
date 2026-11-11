# Multi-client workspace, Google login and redesign

Date: 2026-11-11. Status: awaiting Marc's approval.

Lines marked **(Marc)** are things Marc said. Lines marked **(call)** were decided while writing this, because Marc
said "anything is fine for now"; he can overrule any of them.

## Why

The app was built as "Amapola Workspace": one team, one brand, one shared pool of data. Marc's team will now use it
for several clients, not just Amapola. The platform has to stay simple and comfortable while becoming flexible
enough to take on future clients. **(Marc)**

Three changes follow from that:

1. Work is organised by client, with access restricted per client.
2. People can sign in with email and password or with Google.
3. The interface stops looking like Amapola's and gets its own bold identity.

## Where the project is today

- Next.js 16 (App Router), React 19, Tailwind 4, TypeScript, npm. `AGENTS.md` warns that this Next.js version differs
  from older ones: read `node_modules/next/dist/docs/` before writing code.
- Supabase for Postgres and Auth only. The server talks to Postgres directly (`lib/db`), running each request in a
  transaction as the signed-in person, so row-level security always applies. Business rules live in Postgres
  triggers (`supabase/migrations/20261110000002_logic.sql`).
- Tables: `profiles`, `campaigns`, `deliverables`, `tasks`, `resources`, `resource_links`, `comments`,
  `activity_log`, `publications`. None has any notion of a client. Access is all-or-nothing: `is_member()` sees
  everything, `is_admin()` (a column on `profiles`) approves, deletes and invites.
- Login: email and password, invite-only (`app/login/page.tsx`, `app/actions/account.ts`, `app/auth/confirm/route.ts`).
- Demo mode and the test suite run the real migrations on an embedded Postgres (PGlite) with `lib/db/shim.sql`
  standing in for Supabase's `auth` schema. Demo login is "pick a person", no passwords.
- Interface text is Spanish (Spain). Design tokens are in `app/globals.css`: Roboto, soft corners, Amapola's blue
  `#334fb4` and yellow `#f6e6af`.
- Verified so far: lint, typecheck, 27 database-rule tests, production build. Never run: the Playwright browser
  tests, and anything against a real Supabase project. No git repository yet.
- The migrations have never been applied to a real database. Add new migration files anyway rather than editing the
  existing four. **(call)**

## Goals

- A person can create a client, becomes its owner, and gives others access by email. **(Marc)**
- People only see clients they have been given access to. **(Marc)**
- Everything relevant to one client is easy to see in one place. **(Marc)**
- Sign in with email and password, or with Google. **(Marc)**
- A bold, modern, clean look in black, white and orange that does not read as AI-generated. **(Marc)**
- Nothing about the app's name, colours or wording assumes Amapola. **(Marc: "more generic")**

## Non-goals (this round)

- Per-client branding, custom fields, custom channels or custom workflows. Every client uses the same campaign,
  deliverable and task model that exists today.
- A limited "client reviewer" role for the client's own staff. Two levels only: owner and member.
- Public sign-up, login providers other than Google, billing.
- Moving items from one client to another. Permanently deleting a client (archive only).
- Translating the interface. It stays in Spanish.

## Anti-goals

- A member of client A reading or changing anything of client B, by any route: screens, guessed links, search,
  people lists, notifications, or the Supabase API directly. This must be enforced in the database, not only in the
  screens.
- A stranger with a Google account getting in without having been invited.
- A redesign that makes daily work slower: more clicks to create a task, lower contrast, harder to scan lists.
- Losing or orphaning existing data during the move to clients.

## Part 1: Clients and access

### Model

- New table `clients`: name, optional short description, archived flag, created by, timestamps.
- New table `client_members`: client, person, role (`owner` or `member`), who added them, when.
- `campaigns`, `deliverables`, `tasks` and `resources` each belong to exactly one client (required).
- A deliverable and its campaign, a task and its parent, and a resource and whatever it is linked to must all be in
  the same client. The database rejects mismatches.
- `resource_links`, `comments`, `activity_log` and `publications` inherit their client from their parent. Whether
  that is done by joining or by copying the client onto the row is the builder's choice.

### Roles **(call, except where marked)**

| | Member | Owner |
|---|---|---|
| See the client and everything in it | yes | yes |
| Create and edit campaigns, deliverables, tasks, links, comments | yes | yes |
| Approve deliverables | no | yes |
| Permanently delete items | no | yes |
| Add and remove people, change their role | no | yes |
| Rename, archive, restore the client | no | yes |

- The creator of a client is its first owner. **(Marc)**
- A client can have several owners. It must always keep at least one: the last owner cannot be removed, demoted or
  leave.
- Any member can leave a client themselves.
- Everything today's `is_admin()` gates inside the work (approval, deletion) is gated by "owner of this item's
  client" instead. The editorial rules themselves do not change.
- Any active signed-in person can create a client. **(call)**

### Giving access by email **(Marc; details are calls)**

The owner enters an email, a display name and a role.

- Email already has an account: the person is added, and the client appears for them immediately. The name field is
  ignored for existing accounts.
- Email has no account: an invitation email is sent (as today, via the Supabase service role), a profile is created,
  and they are added to the client. They set a password from the link, or sign in with Google using that address.
- In demo mode no email is sent; the person is simply created, as today.
- Client settings show, for each person in that client: name, email, role, and whether they are active or have a
  pending invitation (never signed in). Owners see emails; members see names and roles only. **(call)**
- An owner learns nothing about people outside their own clients. Looking up an account by email needs elevated
  database rights; keep that inside one narrow function that only a client's owner can call for their own client,
  and that returns no more than "added" or "needs invitation".
- Invitation links expire. Any owner of a client the person belongs to can resend a pending invitation. Adding a
  still-pending person to another client also resends it. Removing a pending person from their only client leaves a
  dormant account with no access; no separate "cancel" action. **(call)**
- To stop invitation emails being used as spam, one person can trigger at most 20 invitation emails (new or resent)
  per day; beyond that the action explains and refuses. **(call)**

### Platform-level accounts **(call)**

- `profiles.role = 'admin'` stops meaning "sees and approves everything". It becomes a platform administrator who, at
  `/admin/usuarios`, can deactivate or reactivate accounts, rename people, and make or unmake other platform
  administrators (the existing "at least one active admin" guard stays). It grants no access to any client's data.
- Inviting from the admin page is removed. New people come in only by being added to a client by one of its owners.
- An account that is the only owner of a non-archived client cannot be deactivated. The admin page says which
  clients are in the way; the person (or the admin, by asking them) must appoint another owner or archive the client
  first. This keeps "admins have no client access" free of exceptions.
- A deactivated account sees nothing, as today.
- `bootstrap_admin(email, name)` stays as the way to create the very first account.
- A person can see the name of another person only if they share at least one client (plus platform admins on the
  admin page). Assignee and owner pickers list only the current client's people.
- When someone is removed from a client, their open tasks and deliverables in that client become unassigned. Their
  name on past comments and history must still display for the remaining members; how is the builder's choice.

### Moving existing data

One migration creates a client named "Amapola", puts every existing row in it, makes every current admin an owner
and every other active person a member. On an empty database it creates nothing.

### Screens

- **Client in the address.** Client screens live under a client segment, for example
  `/c/<client>/calendario`, `/c/<client>/trabajo`, `/c/<client>/campanas`, `/c/<client>/recursos`, and the detail and
  "new" pages beneath them. Links can be shared and two clients can be open in two tabs. **(call)**
- **Client switcher** at the top of the sidebar (and in the mobile header): current client's name, list of your
  clients, "All clients", "New client". Switching keeps you on the same section where that makes sense.
- **All clients home** at `/`: what needs you across every client you belong to (overdue, due soon, waiting for
  review or approval), grouped or labelled by client, plus a card per client with a few counts. With exactly one
  client, go straight to that client's overview. With none, show an empty state whose main action is "Create your
  first client".
- **Client overview** at `/c/<client>`: today's home page, scoped to that client.
- **Clients page** at `/clientes`: your clients, create, and archived ones (owners can restore).
- **Client settings** at `/c/<client>/ajustes` (owners; members see the people list read-only and a "leave" button):
  name, description, people and roles, add by email, archive.
- **Quick create** (the pop-up for task, deliverable, link) creates in the current client. From "All clients" it
  asks which client first.
- **Search**: searches all your clients and labels each result with its client. **(call)**
- **Notifications** (`/novedades`, the bell): across all your clients, labelled by client. "Owner" replaces "admin"
  in deciding who is told about items awaiting approval.
- A link to a client you have no access to, or that does not exist, shows the same "not found" page. Archived
  clients are hidden from the switcher and read-only until restored.

## Part 2: Sign-in

- The login page offers "Continuar con Google" and the existing email and password form, plus password reset.
- **Invite-only stays.** Public sign-up remains off in Supabase. A Google account gets in only if its email was
  already invited or added. Anyone else lands on a clear "you don't have access, ask whoever invited you" page and is
  signed out. **(call)**
- An invited person who has never set a password can sign in with Google straight away; Supabase should attach the
  Google identity to the invited account because the email matches. **This must be checked against a real Supabase
  project** before it is called done; if Supabase creates a second account or refuses, the fallback is to say so on
  the invitation screen and require the email link first.
- `app/auth/confirm/route.ts` currently sends every successful confirmation to "set your password". Google sign-in
  must go to the app instead; invitation and recovery links keep going to "set your password".
- Whatever the sign-in route, a session without an active profile sees nothing. That existing rule is the backstop.
- Demo mode keeps "pick a person" and shows no Google button.
- Marc has to do two things outside the code, to be documented step by step in the README: create OAuth credentials
  in Google Cloud, and enable the Google provider in Supabase with the right redirect address.

## Part 3: Look and feel

Direction **(Marc)**: bold, modern, black, white and orange; clean and easy; distinctive; not AI-looking.

What "not AI-looking" rules out **(call)**: gradients, glassy blur, soft drop shadows, pill-shaped everything,
rounded grey cards on a grey page, emoji, purple or blue accents, a generic system sans.

What to do instead **(call; the builder has latitude on exact values)**:

- **Colour.** Near-black ink, pure white surfaces, one orange (start from `#FF5A00`). Orange is for the primary
  action, the active navigation item, focus rings and key marks. Orange text on white fails contrast at small
  sizes, so orange carries black text when used as a fill and is never used for small text on white. Greys are
  neutral, few, and only for secondary text and hairlines.
- **Black as a surface.** The sidebar and the login page are black with white text; the working area is white.
- **Shape.** Square or nearly square corners (0–4px), solid 1–2px black rules instead of shadows, tables and lists
  separated by lines rather than boxed in cards.
- **Type.** A grotesque with character in heavy weights for headings and the client name, set large and tight; a
  monospace for dates, counts and statuses. Self-hosted through `@fontsource`, as the project already does. Not
  Roboto, not Inter. Suggested starting pair: Archivo and IBM Plex Mono.
- **Status.** Deliverable and task states must stay distinguishable at a glance without relying on colour alone
  (label always present). Keep a restrained red for destructive or blocked and a green for done or approved; the
  rest use black, white and orange.
- **Density and behaviour.** No screen gains steps. Inline editing, drag and drop, the quick-create pop-up and the
  mobile bottom bar all stay. Text contrast meets WCAG AA. Visible focus everywhere.
- **Name.** Remove "Amapola" from the product name, metadata, login page, README and the demo environment variable.
  The product name lives in one constant. Placeholder: "Workspace", until Marc picks a name. **(call)**
- All tokens stay in `app/globals.css`; components keep using the shared classes (`.btn`, `.field`, `.card`, …) so
  the change is mostly made in one place plus the layout, navigation and login.

**Checkpoint.** Before the new look is rolled across every screen, show Marc the login page, the sidebar with the
client switcher and one list screen in the new style, and get a yes.

## Order of work **(call)**

1. Clients and access in the database, with tests.
2. Client screens, switcher, routes, settings and people.
3. Google sign-in.
4. Redesign, with the checkpoint above.

Each step leaves the app working and `npm run check` passing.

## How we know it works

- Database tests (the existing PGlite suite, `tests/workflow.test.ts`) extended to prove, for every table: a member
  of client A cannot read, insert, update or delete in client B; a non-member sees nothing; a member cannot approve,
  delete, or manage people; the last owner cannot be removed; cross-client parent links are rejected; removed members
  lose access at once.
- Existing editorial-rule tests keep passing with "owner" in place of "admin".
- The demo seed has at least two clients and people with different memberships, including one person in both and
  one person in only one, so isolation can be seen by clicking around.
- `npm run check` (lint, typecheck, tests, build) passes.
- The Playwright file is updated for the new routes. It has never been run in this environment; say so plainly in
  `PROJECT_STATUS.md` rather than claiming browser coverage.
- Google sign-in and invitations are checked by hand against a real Supabase project once Marc has one. Until then
  they are reported as unverified.
- `README.md` and `PROJECT_STATUS.md` are updated (they currently list "several organisations" and "OAuth" as out of
  scope).

## Left to the builder

- Table and column details, whether child tables carry their own client column, index choices.
- Whether the client segment in the address is the id or a readable slug.
- Exact function and policy names; how the email lookup is exposed.
- Exact colour values, type scale, spacing and component styling within the direction above.
- How the "All clients" home groups its content.
- Renaming of the demo environment variable and package name.
