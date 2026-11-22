# Panel de resultados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A «Resultados» tab per client showing sales, discounts, Meta spend, traffic, sales origin, customers and Meta campaigns by month, loaded by uploading two CSV formats, with CRM campaigns drawn over the monthly chart.

**Architecture:** Two new per-client tables (`client_metrics_monthly`, `client_meta_ads`) guarded by RLS like the rest. Pure modules in `lib/results/` parse the CSVs and compute period figures (no DB, fully unit-tested). A service in `lib/services/results.ts` reads/writes the tables; server actions in `app/actions/results.ts` import and clear. The page `/c/<cliente>/resultados` renders KPI tiles, hand-drawn SVG charts and tables as server components; only the import dialog is a client component.

**Tech Stack:** Next.js 16.4 App Router, React 19, Tailwind 4, TypeScript, Postgres (Supabase / PGlite), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-22-panel-resultados-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (`AGENTS.md`). Server actions accept `File` in `FormData`; the default action body cap is **1 MB** (`serverActions.bodySizeLimit`), so the upload limit is **512 KB** (real files are 4 KB and 25 KB). Do not raise the Next limit.
- Never edit existing migrations. New migration: `supabase/migrations/20261122000001_results.sql`.
- Every data access goes through `withUser` / `loadClient` / `run` (RLS always applies).
- No new runtime dependencies. Charts are hand-written SVG. Load the `dataviz` skill before writing chart code.
- Style: `#0a0a0a / #fff / #ff5a00`, Archivo + IBM Plex Mono for figures (`font-mono`), square corners, 1px rules, no shadows/gradients; orange never as text colour on white. Series must be distinguishable without colour (direct labels, fill vs outline, stroke width).
- Spanish UI text and Spanish number format: `1.234,56 €`, `3,2 %`, month names in Spanish (use `Intl` with `es-ES`, as `lib/dates.ts` does).
- **A missing value is `null`, never `0`.** It renders «sin dato». Partial months render «parcial (hasta el N)».
- Real figures from `strategy/` never go into the repo, seeds or tests. Demo and tests use invented numbers.
- Postgres `numeric` comes back as a string from both drivers: select numeric columns cast `::float8`.
- Each task ends with `npm run lint && npm run typecheck && npm test` green; Task 5 also `npm run build`.
- Commit to `main` directly after each task (Marc's rule: no branches or PRs).

## Review Focus

1. **Re-uploading the same monthly file** (or an overlapping one): months are replaced, not duplicated; months absent from the file are untouched; the summary says «N nuevos, M sustituidos». Test in Task 4.
2. **A partial month (`datos_hasta` before month end, or the current month)** must not count in totals or year comparisons and must appear in «Datos que faltan». Test in Task 2.
3. **Comparison when the previous year lacks months or a field** (2025 has no January and no Meta spend): compare only months complete in both years for that figure, show the span; no comparable months → no comparison. Test in Task 2.
4. **Wrong file uploaded** (Shopify raw export, an `.xlsx` renamed, an empty file, a semicolon-separated file from Excel ES): a clear Spanish error naming what was expected, nothing written. Test in Task 1 (parser) and Task 4 (action writes nothing).
5. **Someone without access, or a member on an archived client:** cannot read another client's figures, cannot import into an archived client, and a member cannot clear everything. Test in Task 4.

---

### Task 1: CSV parser

**Files:**
- Create: `lib/results/columns.ts`, `lib/results/csv.ts`, `lib/results/parse.ts`
- Test: `tests/results-parse.test.ts`

**Interfaces:**
- Produces (`lib/results/columns.ts`):
  ```ts
  export const MONTHLY_FIELDS = [
    "ventas_brutas","descuentos","devoluciones","ventas_netas","envios","ventas_totales","pedidos",
    "pedido_medio_shopify","articulos","sesiones","sesiones_carrito","sesiones_checkout","sesiones_compra","conversion",
    "ventas_google_bing_org","ventas_directo","ventas_instagram_sin_pago","ventas_meta_pago_utm","ventas_email",
    "ventas_otros","ventas_sin_atribuir","clientes_nuevos","clientes_recurrentes","ventas_clientes_nuevos",
    "ventas_clientes_recurrentes",
  ] as const;                                   // 25 fields; DB column names are identical
  export const IGNORED_MONTHLY = ["meta_gasto","meta_compras_segun_meta","meta_impresiones","meta_clics"] as const;
  export type MonthlyField = (typeof MONTHLY_FIELDS)[number];
  export type MonthlyRow = { month: YearMonth; data_until: LocalDate | null } & Record<MonthlyField, number | null>;
  export type MetaAdRow = { month: YearMonth; campaign_name: string; ad_name: string;
    reach: number | null; impressions: number | null; clicks: number | null; spend: number | null; purchases: number | null };
  ```
- Produces (`lib/results/csv.ts`): `parseCsv(text: string): string[][]` — RFC 4180 (quoted fields, `""` escapes, commas and newlines inside quotes, CRLF), strips a leading BOM, drops fully empty lines.
- Produces (`lib/results/parse.ts`):
  ```ts
  export type ParsedFile =
    | { kind: "monthly"; rows: MonthlyRow[]; warnings: string[] }
    | { kind: "meta"; rows: MetaAdRow[]; warnings: string[] };
  export function parseResultsCsv(text: string): ParsedFile;   // throws AppError (Spanish message) on any error
  ```
  Detection: header contains `mes` → monthly; contains `Nombre de la campaña` and `Importe gastado (EUR)` → meta; otherwise AppError «No reconozco el archivo. Sube el histórico mensual (columna «mes») o el informe de Meta Ads (columna «Nombre de la campaña»).». A header that is one single cell containing `;` → AppError mentioning «separado por punto y coma: expórtalo con comas».

- [ ] **Step 1: Write failing tests** in `tests/results-parse.test.ts` (invented numbers only):
  - `parseCsv` handles `"a, b","c""d"\r\n1,2` → `[["a, b",'c"d'],["1","2"]]` and a leading `﻿`.
  - monthly: header `mes,ventas_brutas,descuentos,conversion,meta_gasto` + row `2026-01,1000.5,-20,0.031,99` → `kind:"monthly"`, row `{month:"2026-01", ventas_brutas:1000.5, descuentos:-20, conversion:0.031, data_until:null}`, every other `MONTHLY_FIELDS` key `null`, no `meta_gasto` key; `warnings` contains a line listing missing columns.
  - monthly: empty cell → `null` (not 0); `datos_hasta` = `2026-11-02` → `data_until:"2026-11-02"`.
  - monthly errors (each `toThrow` with the quoted fragment): unknown column `foo` → «Columnas desconocidas: foo»; `mes` = `2026-13` → «Fila 2: mes no válido»; `ventas_brutas` = `1.234,5` → «Fila 2: ventas_brutas no es un número»; same month twice → «El mes 2026-01 aparece dos veces»; `datos_hasta` outside its month → «Fila 2: datos_hasta no es de 2026-01»; header only → «El archivo no tiene filas».
  - meta: header as in the real export (`"Nombre de la campaña","Nombre del anuncio",Mes,Alcance,Divisa,"CPC (Coste por clic en el enlace)","Clics (todos)",Impresiones,Frecuencia,"Importe gastado (EUR)",Compras,"Coste por compra","Inicio del informe","Fin del informe"`), a totals row with empty campaign name (skipped), and two rows `"Camp, A","Ad 1","2026-03-01 - 2026-03-31",…,12.5,3,…` → two `MetaAdRow` with `month:"2026-03"`, `spend:12.5`, `purchases:3`; empty `Compras` → `null`.
  - meta: two rows with the same campaign, ad and month → one row with summed numbers.
  - unrecognised header and semicolon header → the two messages above.
- [ ] **Step 2: Run** `npx vitest run tests/results-parse.test.ts` — expect FAIL (modules missing).
- [ ] **Step 3: Implement** the three files. Numbers: `Number(cell)` after trim, only `/^-?\d+(\.\d+)?$/` accepted. Meta `Mes` takes the first `YYYY-MM-DD` of the cell.
- [ ] **Step 4: Run** the test file — expect PASS; then lint, typecheck, `npm test`.
- [ ] **Step 5: Commit** «Resultados: lectura de los CSV mensual y de Meta».

### Task 2: Period figures

**Files:**
- Create: `lib/results/compute.ts`, `lib/results/format.ts`
- Test: `tests/results-compute.test.ts`

**Interfaces:**
- Consumes: `MonthlyRow` (Task 1); `todayMadrid`, `addMonths`, `monthRange` from `lib/dates.ts`.
- Produces (`lib/results/compute.ts`):
  ```ts
  export type MetaMonth = { month: YearMonth; spend: number | null; impressions: number | null; clicks: number | null; purchases: number | null };
  export type Period = { kind: "year"; year: number } | { kind: "last12" };
  export function parsePeriod(v: string | undefined, fallback: Period): Period;   // "2026" | "12m"; anything else → fallback
  export function defaultPeriod(monthly: MonthlyRow[], today: LocalDate): Period;  // year of latest month with data; none → year of today
  export function availableYears(monthly: MonthlyRow[], meta: MetaMonth[]): number[]; // descending
  export type MonthState = "complete" | "partial" | "missing" | "future";
  export type MonthView = { month: YearMonth; state: MonthState; data_until: LocalDate | null;
    m: MonthlyRow | null; meta: MetaMonth | null; prev: MonthlyRow | null /* same month previous year, complete only */ };
  export type KpiKey = "ventas_totales" | "pedidos" | "pedido_medio" | "descuentos" | "pct_descuento" | "inversion_meta"
    | "gasto_ventas" | "conversion" | "clientes_nuevos" | "pct_recurrentes";
  export type Kpi = { key: KpiKey; value: number | null; missing: YearMonth[];
    compare: { previous: number; months: YearMonth[] /* current-year months used */ } | null };
  export type Results = { period: Period; months: MonthView[]; kpis: Record<KpiKey, Kpi>; gaps: string[] };
  export function computeResults(i: { monthly: MonthlyRow[]; meta: MetaMonth[]; period: Period; today: LocalDate }): Results;
  ```
- Produces (`lib/results/format.ts`): `eur(n: number | null): string` (`1.234,56 €`, null → «sin dato»), `int(n)`, `pct(fraction)` (`0.032` → `3,2 %`), `ratio(cur, prev)` (`≥ 2` → `×4,9`, else `+9 %` / `−12 %`), `monthSpan(months: YearMonth[]): string` (`["2025-02",…,"2025-10"]` → `feb–oct 2025`; across years `nov 2025–ene 2026`; non-contiguous → comma-joined spans).

Rules (from the spec, all pinned by tests):
- Period months: `year` → Jan–Dec of that year; `last12` → current month and the 11 before.
- State: month after today's month → `future`; no monthly row → `missing`; row with `data_until` before month end, or month == today's month → `partial`; else `complete`.
- Sums use **complete** months only. Ratios are ratios of sums: `pedido_medio = Σventas_totales / Σpedidos`, `pct_descuento = |Σdescuentos| / Σventas_brutas`, `conversion = Σsesiones_compra / Σsesiones`, `gasto_ventas = Σspend / Σventas_totales` (over months where both exist), `pct_recurrentes = Σrecurrentes / (Σnuevos + Σrecurrentes)`. `descuentos` value is `|Σdescuentos|`. `inversion_meta` sums `MetaMonth.spend` over complete months that have a meta row.
- `missing` per KPI: non-future months in the period where that KPI's inputs are absent or the month is not complete.
- Comparison per KPI: months M in the period, complete with the KPI inputs present, whose month −12 is also complete with inputs present; compute the KPI over M and over M−12. Empty M → `compare: null`.
- `gaps` (Spanish lines, in this order, only non-future months): «Sin ventas: <monthSpan>», one «<mes> parcial (hasta el N)» per partial month (current month without `data_until` → «<mes> en curso»), «Sin gasto de Meta: <monthSpan>» for complete months with a monthly row but no meta row.

- [ ] **Step 1: Write failing tests** with an invented fixture: 2025-02…2025-10 complete (ventas_totales 100 each, pedidos 2, sesiones 100, sesiones_compra 4), 2026-01…2026-10 complete (ventas_totales 500, pedidos 10, sesiones 200, sesiones_compra 6), 2026-11 with `data_until:"2026-11-02"`, meta rows 2025-11…2026-10 spend 10. `today = "2026-11-22"`, period year 2026. Assert:
  - `months.length === 12`; 2026-11 `partial`, 2026-12 `future`.
  - `kpis.ventas_totales.value === 5000` (Jan–Oct only; November excluded); `missing` = `["2026-11"]`.
  - `kpis.ventas_totales.compare` = `{ previous: 900, months: ["2026-02",…,"2026-10"] }` (January excluded: 2025-01 missing).
  - `kpis.conversion.value` = `60/2000`; `kpis.pedido_medio.value === 50`.
  - `kpis.inversion_meta.value === 100` and `compare === null` (no 2025 meta in Feb–Oct).
  - period 2026: `gaps` equals `["noviembre 2026 parcial (hasta el 2)"]`.
  - period 2025: `gaps` equals `["Sin ventas: ene 2025, nov–dic 2025", "Sin gasto de Meta: feb–oct 2025"]` (meta rows exist for nov–dic 2025 but those months have no monthly row, so they are covered by «Sin ventas»).
  - `computeResults` with no data: every KPI `value: null`, `compare: null`.
  - `parsePeriod("12m")`, `parsePeriod("abc", fb) === fb`, `defaultPeriod` → year 2026.
  - `format.ts` (use `Intl.NumberFormat("es-ES", …)` with `useGrouping: "always"`, because es-ES only groups from 5 digits by default; compare after replacing `\u00a0`/`\u202f` with spaces): `eur(1234.5) === "1.234,50 €"`, `int(3200) === "3.200"`, `pct(0.032) === "3,2 %"`, `ratio(4900, 1000) === "×4,9"`, `ratio(109, 100) === "+9 %"`, `monthSpan` cases above, `eur(null) === "sin dato"`.
- [ ] **Step 2: Run** `npx vitest run tests/results-compute.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `compute.ts` and `format.ts`.
- [ ] **Step 4: Run** — PASS; lint, typecheck, `npm test`.
- [ ] **Step 5: Commit** «Resultados: cálculo de periodos, huecos y comparación».

### Task 3: Tables and access rules

**Files:**
- Create: `supabase/migrations/20261122000001_results.sql`
- Test: `tests/results-access.test.ts`

**Interfaces:**
- Produces tables:
  - `client_metrics_monthly(client_id uuid not null references clients on delete cascade, month date not null check (extract(day from month) = 1), data_until date check (data_until is null or date_trunc('month', data_until)::date = month), <25 MONTHLY_FIELDS> numeric, imported_by uuid references profiles default auth.uid(), imported_at timestamptz not null default now(), primary key (client_id, month))`
  - `client_meta_ads(id uuid pk default gen_random_uuid(), client_id … on delete cascade, month date not null check (day = 1), campaign_name text not null check (char_length between 1 and 300), ad_name text not null default '' check (≤ 300), reach, impressions, clicks, spend, purchases numeric, imported_by, imported_at, unique (client_id, month, campaign_name, ad_name))`, index `(client_id, month)`.
- RLS (enable on both): select `is_client_member(client_id)`; insert and update `can_write_client(client_id)`; delete `is_client_owner(client_id) and can_write_client(client_id)`.
- Function `public.delete_meta_months(p_client uuid, p_months date[]) returns void`, `security definer`, `set search_path = public`: raises `insufficient_privilege` unless `can_write_client(p_client)`; deletes `client_meta_ads` rows of that client in those months. `revoke all … from public, anon, authenticated; grant execute … to authenticated` (same pattern as `20261111000002_client_access.sql:28-31`).

- [ ] **Step 1: Write failing tests** using `setupDb()` / `as()` from `tests/helpers.ts`:
  - sara (member of A) inserts a monthly row for A and reads it back; elisa (A member) reads it; `lonely` (no client) reads 0 rows.
  - ecommerce (owner of B) inserts a row into B; sara (not in B) reads 0 rows of B.
  - sara inserting into B → throws (RLS).
  - sara `delete from client_metrics_monthly where client_id = A` deletes 0 rows; maite (owner) deletes them.
  - sara calls `select delete_meta_months($A, array['2026-03-01']::date[])` → succeeds and removes only March rows; sara calling it for B → throws.
  - after archiving A (as the privileged connection: `update clients set archived_at = now()`), maite insert into A → throws; select still works.
  - `month = '2026-03-15'` → check violation; `data_until = '2026-04-01'` for March → check violation.
- [ ] **Step 2: Run** `npx vitest run tests/results-access.test.ts` — FAIL (tables missing).
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run** — PASS; lint, typecheck, `npm test` (other suites must still pass with the new migration).
- [ ] **Step 5: Commit** «Resultados: tablas y permisos por cliente».

### Task 4: Service and import actions

**Files:**
- Create: `lib/services/results.ts`, `app/actions/results.ts`
- Test: `tests/results-actions.test.ts` (mock pattern from `tests/client-actions.test.ts:1-50`)

**Interfaces:**
- Consumes: `MonthlyRow`, `MetaAdRow`, `MONTHLY_FIELDS`, `parseResultsCsv` (Task 1); `MetaMonth` (Task 2); tables and `delete_meta_months` (Task 3).
- Produces (`lib/services/results.ts`):
  ```ts
  export function upsertMonthly(q: Q, clientId: string, rows: MonthlyRow[]): Promise<{ added: number; replaced: number }>;
  export function replaceMetaAds(q: Q, clientId: string, rows: MetaAdRow[]): Promise<{ rows: number; months: number }>;
  export function listMonthly(q: Q, clientId: string): Promise<MonthlyRow[]>;          // month as "YYYY-MM", numbers as number|null
  export function listMetaMonths(q: Q, clientId: string): Promise<MetaMonth[]>;        // sums per month; null when every row's value is null
  export type MetaCampaign = { campaign_name: string; months: YearMonth[]; spend: number | null; clicks: number | null;
    impressions: number | null; purchases: number | null };
  export function listMetaCampaigns(q: Q, clientId: string, first: YearMonth, last: YearMonth): Promise<MetaCampaign[]>; // spend desc
  export type LastImport = { by: string | null; at: Date } | null;                     // by = display_name
  export function lastImports(q: Q, clientId: string): Promise<{ monthly: LastImport; meta: LastImport }>;
  export function clearResults(q: Q, clientId: string): Promise<void>;                 // deletes both tables' rows for the client
  ```
  `upsertMonthly`: read existing months for the client first (to count `replaced`), then one `insert … on conflict (client_id, month) do update set <every field>, data_until, imported_by = auth.uid(), imported_at = now()`.
  `replaceMetaAds`: `select delete_meta_months($1, $2::date[])` with the file's distinct months, then insert all rows.
- Produces (`app/actions/results.ts`, `"use server"`):
  ```ts
  export async function importResultsAction(prev: ActionState, fd: FormData): Promise<ActionState>; // fields: client_id, file
  export async function clearResultsAction(prev: ActionState, fd: FormData): Promise<ActionState>;  // fields: client_id, confirm === "BORRAR"
  ```
  Import checks before `run`: `file` is a `File`, size > 0 and ≤ 512 KB («El archivo pesa más de 512 KB.»), name ends in `.csv` («Sube un archivo .csv.»). Parse **before** opening the transaction; on success `state.notice` = «Histórico mensual: 12 meses (10 nuevos, 2 sustituidos).» or «Meta Ads: 145 filas en 12 meses.», and parser `warnings` joined into `state.warning`. `clearResultsAction` requires `is_client_owner` (check via `getClient(q, id).my_role === "owner"`, AppError «Solo la Propiedad puede borrar los resultados.»); RLS enforces it too.

- [ ] **Step 1: Write failing tests:**
  - sara imports a monthly CSV (invented, 3 months) into A → `notice` «… 3 meses (3 nuevos, 0 sustituidos).»; re-import with 2 of those months + 1 new → «3 meses (1 nuevo, 2 sustituidos).» and `listMonthly` returns 4 months; the month absent from the second file is unchanged.
  - meta CSV import, then a second meta file covering only one of its months → the other months' rows remain; the covered month has only the new rows.
  - bad file (unknown header) → `error` set and `select count(*)` of both tables unchanged; 600 KB file → size error; `.xlsx` name → extension error.
  - sara importing into B (not a member) → `error`, nothing written.
  - archived A → import returns `error`.
  - `clearResultsAction` as sara → error «Solo la Propiedad…»; as maite with `confirm: "BORRAR"` → both tables empty for A, B untouched; without confirm → error.
  - `listMetaMonths` and `listMetaCampaigns(q, A, "2026-01", "2026-12")` return numbers (not strings) and campaigns sorted by spend desc.
  - `lastImports` returns sara's display name after her import.
- [ ] **Step 2: Run** `npx vitest run tests/results-actions.test.ts` — FAIL.
- [ ] **Step 3: Implement** service and actions (mirror `app/actions/clients.ts` for `run` usage and `revalidatePath`).
- [ ] **Step 4: Run** — PASS; lint, typecheck, `npm test`.
- [ ] **Step 5: Commit** «Resultados: importar CSV y borrar resultados».

### Task 5: The «Resultados» tab

**Files:**
- Create: `app/(app)/c/[client]/resultados/page.tsx`, `components/results/kpis.tsx`, `components/results/charts.tsx`, `components/results/tables.tsx`, `components/results/import-dialog.tsx` (client)
- Modify: `components/nav.tsx` (item + `grid-cols-6`), `lib/demo/seed.ts` (invented results for «Tienda Demo»), `PROJECT_STATUS.md`
- Test: `tests/seed.test.ts` (extend), `tests/results-format.test.ts` only if chart helpers get logic worth pinning (scales, ticks)

**Interfaces:**
- Consumes: everything above; `campaignsForRange(q, clientId, first, last)` from `lib/services/campaigns.ts` for the campaign bands; `campaignPath`; `PageHeader`, `Section`, `Empty` from `components/ui.tsx`; `ActionForm` from `components/action-form.tsx`; dialog pattern from `components/quick.tsx:156-260`.
- Page: `searchParams.periodo` → `parsePeriod(…, defaultPeriod(…))`. Period selector = links (`?periodo=2026`, `?periodo=12m`) styled like `Tabs` in `components/ui.tsx:133`. Import button and «Borrar todos los resultados» (owner only, inside a `Collapsed` «Opciones») hidden when `client.archived_at`.

Layout (top to bottom, as in the spec sketch):
1. `PageHeader` «Resultados», eyebrow `<client> · <period label>`, actions: period links + «Importar CSV». Below: «Última importación» line for each file.
2. `KpiGrid`: tiles ventas totales, pedidos, pedido medio, descuentos (`eur` + `pct_descuento`), inversión Meta (+ `gasto_ventas` «de las ventas»), conversión, clientes nuevos, % que repiten. Each tile: value in `font-mono`; comparison line `ratio(...) vs <monthSpan(months−12)>` or nothing; if `missing.length` → «parcial: faltan <monthSpan>». Two columns on mobile, 4–5 on desktop.
3. `SalesChart` (SVG): bars per month = ventas_totales (filled ink), previous-year same month = outline bar beside it, Meta spend = orange line with its own right axis; missing month → hatched placeholder with «sin dato», partial → bar with dashed outline and «parcial»; future → empty. Under the x-axis, one row per CRM campaign overlapping the period: a bar from start to end month, labelled with the campaign name, linking to `campaignPath`.
4. `OriginChart`: stacked bars per month — orgánico (google_bing_org + directo + instagram_sin_pago + email), Meta pago (meta_pago_utm), resto (otros + sin_atribuir); direct labels in legend with patterns, not colour alone.
5. `CustomersChart`: bars per month nuevos vs recurrentes.
6. `MetaCampaignsTable`: campaña, meses (`monthSpan`), gasto, clics, compras (Meta)*, coste/compra; footnote «* Compras que cuenta Meta; no son pedidos de Shopify.»
7. `MonthlyTable`: mes, ventas totales, descuentos (€ and %), pedidos, conversión, gasto Meta, gasto/ventas; «sin dato» / «parcial» per cell.
8. «Datos que faltan»: `results.gaps` as a list (hidden if empty).
- Empty state (no monthly and no meta rows): what the two files are, the monthly header line, and the import button.
- Charts and tables overflow horizontally on mobile (`overflow-x-auto`), SVG has `role="img"` and an `aria-label` summary; each chart also has a visually hidden table or relies on `MonthlyTable` (say so in `aria-describedby`).

- [ ] **Step 1: Load the `dataviz` skill**, then extend `tests/seed.test.ts`: after `seedDemo`, «Tienda Demo» has ≥ 18 monthly rows (invented, Jan of last year → last month, one partial current month) and meta rows for ≥ 6 months; «Estudio Demo» has none (exercises the empty state).
- [ ] **Step 2: Run** `npx vitest run tests/seed.test.ts` — FAIL.
- [ ] **Step 3: Implement** the seed data (deterministic invented numbers, relative to today like the rest of the seed; write via `upsertMonthly` / `replaceMetaAds` as the owner with `runAsUser`), the nav item `{ href: clientPath(clientId, "resultados"), label: "Resultados", icon: ChartColumn }` after «Campañas», and the page and components.
- [ ] **Step 4: Verify:** `npm run check` green. Then the demo: `npm run demo`, and with `curl` as the demo owner of «Tienda Demo» (cookie `workspace_demo_user`): `/c/<tienda>/resultados` → 200 and HTML contains «Resultados», «Ventas totales», «Datos que faltan», «parcial»; `?periodo=12m` → 200; `/c/<estudio>/resultados` → 200 with the empty-state text; as Sara `/c/<tienda>/resultados` → 404. Record in `PROJECT_STATUS.md` what was verified and that nothing was checked in a browser.
- [ ] **Step 5: Commit** «Resultados: pestaña con cifras, gráficas y tablas» and push to `main`.
