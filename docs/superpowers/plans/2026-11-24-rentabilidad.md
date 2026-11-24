# Rentabilidad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A «Rentabilidad» tab per client with an editable escandallo (assumptions, fixed costs, products), unit margins (contribution and full), real contribution per product from imported Shopify product sales, monthly expenses vs sales, break-even, and a «Qué potenciar» ranking.

**Architecture:** Pure modules in `lib/profit/` (costing, matching, ranking, CSV parsing) with no DB access, fully unit-tested. Five new per-client tables with RLS; fixed-cost lines readable only by the owner, with a `security definer` function exposing group totals to members. Service `lib/services/profit.ts`, actions `app/actions/profit.ts`, page `/c/<cliente>/rentabilidad` reusing the Resultados building blocks (`lib/results/csv.ts`, `lib/results/format.ts`, `components/results/charts.tsx`, period helpers in `lib/results/compute.ts`).

**Tech Stack:** Next.js 16.4 App Router, React 19, Tailwind 4, TypeScript, Postgres (Supabase / PGlite), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-rentabilidad-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` before Next.js code. `"use server"` files export only async functions. Upload limit 512 KB (action body cap 1 MB).
- New migration: `supabase/migrations/20261124000010_profit.sql` (another session uses low numbers on the same day). Never edit existing migrations.
- Every data access through `withUser` / `loadClient` / `run`.
- No new dependencies. Brand style (`#0a0a0a / #fff / #ff5a00`, `font-mono` figures, square corners, 1px rules), Spanish copy and number format via `lib/results/format.ts`.
- **`null` = «sin dato», never 0.** All margins are **sin IVA**. Monthly expenses vs sales are both **con IVA**.
- Real figures (prices, salaries, expenses) never in git, seeds or tests; `strategy/` is git-ignored.
- Permissions (spec): fixed-cost **lines** owner-only (read and write); members get totals only. Monthly expenses readable by members, written by owner. Settings and products readable and writable by any member of a non-archived client; product and fixed-cost **list replacement** (CSV import) owner-only. Product sales import: any member.
- Each task ends with `npm run lint && npm run typecheck && npm test` green; Task 6 also `npm run build`. Commit to `main` staging only this plan's paths (a concurrent session works in the same tree).

## Review Focus

1. **A product with missing commission/shipping data**: margin still shown, flagged «sin comisiones» / «sin envío», never presented as complete. Test in Task 1.
2. **A member opening the tab**: sees totals of personal and estructura and €/min, never a salary line — also when calling the database directly. Test in Task 4.
3. **A Shopify variant that matches two escandallo products, or none**: counted once (first match by position) or listed under «Sin escandallo» with its units and sales. Test in Task 2.
4. **Re-importing the product sales export**: each row's two months are both stored; months in the file are replaced, others kept. Test in Tasks 3 and 5.
5. **A month with expenses but no Resultados sales (nov–dic 2025)**: result «sin dato», not «−gastos». Test in Task 2.

---

### Task 1: Unit costing

**Files:** Create `lib/profit/types.ts`, `lib/profit/costing.ts` · Test `tests/profit-costing.test.ts`

**Interfaces (produces):**
```ts
// types.ts
export type CostSettings = { iva: number | null; horas_productivas_anuales: number | null; precio_tela_m2: number | null;
  tinta_m2: number | null; merma_tela: number | null; reimpresion: number | null; roturas: number | null;
  comision_pct: number | null; comision_fija_pedido: number | null; envio_neto_pedido: number | null; unidades_por_pedido: number | null };
export type FixedCostGroup = "personal" | "estructura";
export type FixedCostTotals = Record<FixedCostGroup, number>;              // € per month
export type Product = { id: string; position: number; family: string; format: string; price: number | null;
  fabric_w_cm: number | null; fabric_h_cm: number | null; minutes: number | null; support_cost: number | null;
  packaging_cost: number | null; shopify_title: string | null; variant_match: string | null; active: boolean; note: string };
// costing.ts
export type PerMinute = { personal: number; estructura: number } | null;   // null when hours missing/0
export function perMinute(totals: FixedCostTotals, s: CostSettings): PerMinute;
export type UnitCost = {
  status: "ok" | "incomplete"; missing: string[];        // Spanish field labels that block the calculation
  partial: ("comisiones" | "envío")[];                    // computed as 0 and flagged
  price_net: number | null; fabric: number; ink: number; materials: number; fees: number; shipping: number;
  contribution: number | null; contribution_pct: number | null;
  labour: number | null; structure: number | null; full: number | null; full_pct: number | null };
export function unitCost(p: Product, s: CostSettings, pm: PerMinute): UnitCost;
```
Formula exactly as the spec («Coste de una unidad»). Blocking: `price`, `iva`; if `fabric_w_cm`/`fabric_h_cm` both set then also `precio_tela_m2` (merma/reimpresión/roturas null → treated as 0 % and **not** blocking). Empty fabric size = no fabric. `tinta_m2` null → ink 0. `minutes` null or `pm` null → `labour/structure/full` null. Missing `comision_pct` → that part 0 + `partial` has «comisiones» (fixed fee still applied if present and `unidades_por_pedido` set); missing `envio_neto_pedido` or `unidades_por_pedido` → shipping 0 + «envío».

- [ ] **Step 1: Failing tests** (invented values): settings `iva .21, horas 3200, tela 7, tinta null, merma .35, reimpresion .15, roturas .05, comision_pct null, comision_fija .25, envio null, unidades 3.1`; totals `{personal: 5000, estructura: 4000}`; product PVP 20 €, 15×21 cm, 3 min, soporte 1.10, embalaje .50. Assert:
  - `perMinute` → personal `5000*12/(3200*60)`, estructura `4000*12/(3200*60)`; hours null → `null`.
  - `price_net = 20/1.21`; `fabric = 0.0315 * 7 * 1.35 * 1.15`; `ink = 0`; `materials = (fabric + 1.10 + 0.50) * 1.05`; `fees = 0.25/3.1`; `shipping = 0`; `partial = ["comisiones", "envío"]`; `status "ok"`.
  - `contribution = price_net − materials − fees`; `contribution_pct = contribution/price_net`; `full = contribution − 3*pm.personal − 3*pm.estructura`.
  - `tinta_m2: 2` → `ink = 0.0315*2*1.15`.
  - price null → `status "incomplete"`, `missing` contains «precio», contribution null.
  - fabric size set + `precio_tela_m2` null → incomplete, missing «precio de la tela»; fabric size null → fabric 0, ok.
  - minutes null → `full` null, contribution present.
- [ ] **Step 2:** `npx vitest run tests/profit-costing.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS; lint, typecheck, `npm test`.
- [ ] **Step 5:** Commit «Rentabilidad: coste por unidad y márgenes».

### Task 2: Matching, ranking, break-even, monthly result

**Files:** Create `lib/profit/match.ts`, `lib/profit/ranking.ts` · Test `tests/profit-ranking.test.ts`

**Interfaces:**
- Consumes Task 1; `Period`, `MonthlyRow`, `MetaMonth` and month helpers from `lib/results/compute.ts` / `lib/dates.ts`.
- Produces:
```ts
// match.ts
export const normalize = (s: string) => string;   // lower-case, trim, "*" → "x", collapse spaces
export function matchProduct(products: Product[], title: string, variant: string): Product | null; // active only, by position; title equal (normalized), variant_match empty or contained
// ranking.ts
export type ProductSale = { month: YearMonth; product_title: string; variant_title: string; net_sales: number | null;
  quantity: number | null; reversed_quantity: number | null; orders: number | null };
export type RankRow = { product: Product; cost: UnitCost; units: number; net_sales: number; real_contribution: number | null;
  tag: "potenciar" | "revisar_precio" | "poco_volumen" | "incompleto" | null };
export type Unmatched = { product_title: string; variant_title: string; units: number; net_sales: number };
export type Ranking = { rows: RankRow[]; unmatched: Unmatched[]; matched_share: number | null /* matched net sales ÷ all net sales */ };
export function rankProducts(i: { products: Product[]; settings: CostSettings; pm: PerMinute; sales: ProductSale[]; months: YearMonth[] }): Ranking;
export function breakEven(i: { totals: FixedCostTotals; metaMonthlyAvg: number | null; ranking: Ranking }): { sales: number | null; contribution_pct: number | null; covered_share: number | null };
export type MonthResult = { month: YearMonth; sales: number | null; expenses: number | null; result: number | null; comment: string };
export function monthlyResults(i: { months: YearMonth[]; monthly: MonthlyRow[]; expenses: { month: YearMonth; amount: number | null; comment: string }[] }): MonthResult[];
```
Rules: units = Σ(quantity) − Σ|reversed_quantity| over `months`; `real_contribution = net_sales/(1+iva) − units × (materials+fees+shipping)` (null if cost incomplete). Rows: every active product (units 0 if none). Tags (in this order): incomplete cost → `incompleto`; `full < 0` (or `contribution < 0` when full null) → `revisar_precio`; among rows with units > 0 and complete cost, `full_pct ≥ median` and `real_contribution ≥ median` → `potenciar`; `full_pct ≥ median` and units below median → `poco_volumen`. Default order: `real_contribution` desc, nulls last. `breakEven`: `contribution_pct` = Σ real_contribution ÷ Σ(net_sales/(1+iva)) over complete rows with sales; `sales = (personal + estructura + (metaMonthlyAvg ?? 0)) / contribution_pct × (1+iva)` (con IVA, comparable with monthly sales); `covered_share` = matched_share of complete rows. `monthlyResults`: `sales = ventas_totales` of that month's Resultados row (null if there is no row); `result = sales − expenses` only if both non-null; a partial month keeps its value and the page marks it «parcial».

- [ ] **Step 1: Failing tests:** normalize/match (`"15*21cm / Vertical"` matches `variant_match "15x21cm"`; two products matching → first by position; inactive skipped); rank with two products + one unmatched title → `unmatched` has it, `matched_share` correct; reversed units subtracted; tag cases (negative full → `revisar_precio`; incomplete → `incompleto`; median split → `potenciar` / `poco_volumen`); `breakEven` with totals 6000+4000, meta avg 1000 and 50 % contribution → `sales = 22000 × 1.21`; `monthlyResults` month with expenses but no monthly row → `sales null, result null`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS; full checks.
- [ ] **Step 5:** Commit «Rentabilidad: emparejar con Shopify, ranking y punto de equilibrio».

### Task 3: CSV parsers

**Files:** Create `lib/profit/parse.ts` · Test `tests/profit-parse.test.ts`

**Interfaces:**
- Consumes `parseCsv` (`lib/results/csv.ts`), `AppError`, Task 1–2 types.
- Produces:
```ts
export type ProductInput = Omit<Product, "id">;
export type FixedCostInput = { group: FixedCostGroup; concept: string; monthly_amount: number | null; note: string; position: number };
export type ExpenseInput = { month: YearMonth; amount: number | null; comment: string };
export type ParsedProfitFile =
  | { kind: "product_sales"; rows: ProductSale[] }
  | { kind: "products"; rows: ProductInput[] }
  | { kind: "fixed_costs"; rows: FixedCostInput[] }
  | { kind: "expenses"; rows: ExpenseInput[] };
export function parseProfitCsv(text: string): ParsedProfitFile | null;  // null = not one of these formats (caller then tries parseResultsCsv)
```
Formats (header detection):
- `product_sales`: header has `Month`, `Product title`, `Product variant title`, `Net sales`, `Quantity ordered`. Each row yields the `Month` half and, if `Month (20250101)` exists, the comparison half using the `… (20250101)` columns. Month = first 7 chars of the date. Drop halves where quantity and net sales are both 0 or empty. Sum duplicates by (month, title, variant). Use `Net sales`, `Quantity ordered`, `Reversed quantity`, `Orders`.
- `products`: header `familia,formato,precio,tela_ancho_cm,tela_alto_cm,minutos,soporte,embalaje,producto_shopify,variante_contiene,activo,nota`; `activo` «sí/no/1/0», default sí; position = row order.
- `fixed_costs`: header `grupo,concepto,importe_mes,nota`; grupo «personal»/«estructura».
- `expenses`: header `mes,gastos,comentario`.
Numbers: dot decimal like Resultados; empty → null; errors as Spanish AppError with row numbers.

- [ ] **Step 1: Failing tests** (invented rows): product sales row with both halves → two `ProductSale` (2026-03 and 2025-03); zero half dropped; duplicates summed; `products` row with blank fabric → nulls, `activo: no` → false; `fixed_costs` bad group → «Fila 2: grupo debe ser personal o estructura»; `expenses` `2026-04,18610,abrimos oficinas`; unknown header → `null`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; full checks. Also parse `strategy/3b…csv` once in a temporary test that is deleted before commit (count rows, no figures recorded). **Step 5:** Commit «Rentabilidad: lectura de los CSV».

### Task 4: Tables and access rules

**Files:** Create `supabase/migrations/20261124000010_profit.sql` · Test `tests/profit-access.test.ts`

**Interfaces (produces):**
- `client_cost_settings(client_id pk → clients on delete cascade, <11 CostSettings fields> numeric, updated_by default auth.uid(), updated_at)`.
- `client_fixed_costs(id uuid pk, client_id, grp text check in ('personal','estructura'), concept text 1–160, monthly_amount numeric, note text ≤ 500 default '', position int not null default 0)`.
- `client_products(id uuid pk, client_id, position int, family text 1–160, format text ≤ 160 default '', price numeric, fabric_w_cm numeric, fabric_h_cm numeric, minutes numeric, support_cost numeric, packaging_cost numeric, shopify_title text, variant_match text, active boolean default true, note text ≤ 1000 default '', version int default 1)`.
- `client_product_sales(client_id, month date day 1, product_title text, variant_title text default '', net_sales, quantity, reversed_quantity, orders numeric, imported_by, imported_at, primary key (client_id, month, product_title, variant_title))`.
- `client_monthly_expenses(client_id, month date day 1, amount numeric, comment text ≤ 300 default '', primary key (client_id, month))`.
- RLS: settings, products, product_sales → select `is_client_member`, insert/update `can_write_client`, delete `is_client_owner and can_write_client`. fixed_costs → **all** operations `is_client_owner(client_id)` (+ `can_write_client` for writes). monthly_expenses → select member, writes owner + writable.
- Functions (`security definer`, `set search_path = public`, revoke from public/anon/authenticated, grant to authenticated):
  - `fixed_cost_totals(p_client uuid) returns table (grp text, monthly numeric)` — raises 42501 unless `is_client_member`.
  - `import_product_sales(p_client uuid, p_rows jsonb)` — like `import_meta_ads`: `can_write_client`, non-empty, delete months in payload, insert.
  - `replace_products(p_client uuid, p_rows jsonb)` and `replace_fixed_costs(p_client uuid, p_rows jsonb)` — owner + writable only; delete all then insert.

- [ ] **Step 1: Failing tests** (`setupDb` helpers; A: maite owner, sara member): sara reads 0 rows of `client_fixed_costs` after maite inserts one, but `fixed_cost_totals(A)` returns the group total; sara cannot insert a fixed cost; lonely → `fixed_cost_totals` throws; sara inserts/updates a product and settings; sara cannot delete a product; sara `replace_products` throws, maite succeeds; sara reads monthly expenses but cannot insert; `import_product_sales` by sara replaces only the months it brings and refuses `[]`; archived client refuses writes; client B rows invisible to sara.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Write migration. **Step 4:** Run → PASS; full checks. **Step 5:** Commit «Rentabilidad: tablas y permisos».

### Task 5: Service and actions

**Files:** Create `lib/services/profit.ts`, `app/actions/profit.ts` · Test `tests/profit-actions.test.ts` (mock pattern of `tests/results-actions.test.ts`)

**Interfaces:**
- Service (numeric columns `::float8`, months `to_char(…,'YYYY-MM')`):
```ts
export function getSettings(q: Q, clientId: string): Promise<CostSettings>;            // all-null when no row
export function saveSettings(q: Q, clientId: string, s: CostSettings): Promise<void>;  // upsert
export function fixedCostTotals(q: Q, clientId: string): Promise<FixedCostTotals>;     // via function; missing group → 0
export type FixedCost = FixedCostInput & { id: string };
export function listFixedCosts(q: Q, clientId: string): Promise<FixedCost[]>;          // owner sees rows; member gets []
export function saveFixedCost(q: Q, clientId: string, id: string | null, c: Omit<FixedCostInput, "position">): Promise<void>;
export function deleteFixedCost(q: Q, id: string): Promise<void>;
export function replaceFixedCosts(q: Q, clientId: string, rows: FixedCostInput[]): Promise<number>;
export function listProducts(q: Q, clientId: string): Promise<Product[]>;               // by position
export function saveProduct(q: Q, clientId: string, id: string | null, p: Omit<ProductInput, "position">): Promise<void>;
export function deleteProduct(q: Q, id: string): Promise<void>;
export function replaceProducts(q: Q, clientId: string, rows: ProductInput[]): Promise<number>;
export function importProductSales(q: Q, clientId: string, rows: ProductSale[]): Promise<{ rows: number; months: number }>;
export function listProductSales(q: Q, clientId: string, first: YearMonth, last: YearMonth): Promise<ProductSale[]>;
export function shopifyTitles(q: Q, clientId: string): Promise<string[]>;              // distinct, for the product form select
export function listExpenses(q: Q, clientId: string): Promise<{ month: YearMonth; amount: number | null; comment: string }[]>;
export function saveExpense(q: Q, clientId: string, e: ExpenseInput): Promise<void>;  // upsert by month
export function deleteExpense(q: Q, clientId: string, month: YearMonth): Promise<void>;
export function replaceExpenses(q: Q, clientId: string, rows: ExpenseInput[]): Promise<number>; // upsert all rows of file
```
- Actions (`"use server"`, only async exports; each `run(...)` after `writableClient` like `app/actions/results.ts`):
  `saveSettingsAction`, `saveFixedCostAction`, `deleteFixedCostAction`, `saveProductAction`, `deleteProductAction`, `saveExpenseAction`, `deleteExpenseAction`, `importProfitAction` (file: tries `parseProfitCsv`, else AppError «No reconozco el archivo…» listing the four formats; `products` / `fixed_costs` require `confirm === "SUSTITUIR"` and owner; notices «Escandallo: 47 productos.», «Costes fijos: 20 líneas.», «Ventas por producto: 1.731 filas en 20 meses.», «Gastos: 18 meses.»).
  Form fields: numbers in Spanish or dot format (`"1.234,5"` and `"1234.5"` → 1234.5; empty → null); percentages entered as % (`35` → 0.35) for `iva, merma_tela, reimpresion, roturas, comision_pct`.

- [ ] **Step 1: Failing tests:** settings round trip with `%` conversion and Spanish decimals; member saving a fixed cost → error «Solo la Propiedad…»; owner CRUD fixed cost; product save/delete (member delete → error); `importProfitAction` for each kind (owner), products import without `SUSTITUIR` → error and nothing changed, as member → error; product sales re-import keeps other months; expenses member → error; archived → error; bad file → nothing written.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; full checks. **Step 5:** Commit «Rentabilidad: guardar escandallo, gastos e importar».

### Task 6: The «Rentabilidad» tab

**Files:** Create `app/(app)/c/[client]/rentabilidad/page.tsx`, `components/profit/summary.tsx`, `components/profit/ranking-table.tsx`, `components/profit/escandallo.tsx` (client: settings form, fixed costs list, products table with per-row edit), `components/profit/expenses.tsx` (client), `components/profit/import-dialog.tsx` · Modify `components/nav.tsx` (item after Resultados, icon `PiggyBank`, `grid-cols-7`), `lib/demo/seed.ts` (invented escandallo, product sales, expenses for «Tienda Demo»), `tests/seed.test.ts`, `PROJECT_STATUS.md` · Test `tests/profit-page.test.ts` (render `RankingTable` and `Summary` with `renderToStaticMarkup`, as in `tests/results-charts.test.ts`)

Page (period via `?periodo=`, reusing `parsePeriod`/`defaultPeriod`/`availableYears` over `listMonthly`):
1. Header «Rentabilidad», eyebrow `<cliente> · <periodo>`, «Importar CSV». Note «Márgenes con los costes y precios actuales.» Warning (orange box) when `partial` flags exist: «Faltan comisiones y/o envío: los márgenes no los incluyen.»
2. `Summary` tiles: Ventas (con IVA, Σ `ventas_totales` of months with expenses too), Gastos (con IVA), Resultado, Costes fijos/mes (personal + estructura), Punto de equilibrio («19.600 €/mes en ventas (con IVA) · calculado con el 78 % de las ventas»), Coste por minuto.
3. «Ventas y gastos por mes»: `MonthBars` from `components/results/charts.tsx` (adapt with a `MonthView`-like adapter or a small generic variant; series ventas = ink, gastos = orange), result row and comments listed under the chart.
4. «Qué potenciar»: `RankingTable` (columns: producto, uds, margen contrib. € · %, margen completo € · %, aportación real, etiqueta; flags «sin comisiones»/«sin envío» per row; sort via `?orden=`), then «Sin escandallo» list with units and sales and a link to add the product prefilled with that Shopify title. Horizontal bars of real contribution for the top 15.
5. «Escandallo» (editable unless archived): settings form; fixed costs — owner: lines editable; member: two totals only; products table with inline edit form per row (`ActionForm`), add product, Shopify title as `<select>` of `shopifyTitles`.
6. «Gastos mensuales»: list; owner edits/adds; members read only.
7. Owner-only «Opciones»: import escandallo/costes fijos (confirm SUSTITUIR) lives in the import dialog with that field shown only to owners.
Empty state when no products and no expenses: explain the four CSV files.

- [ ] **Step 1:** Failing tests: `profit-page.test.ts` — `RankingTable` renders tag labels («Potenciar», «Revisar precio», «Poco volumen», «Incompleto») and «sin envío»; `Summary` shows «sin dato» when break-even null. `seed.test.ts` — «Tienda Demo» has ≥ 8 products, ≥ 4 fixed costs, product sales in ≥ 6 months, expenses ≥ 6 months; «Estudio Demo» none.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement seed, nav, components, page. **Step 4:** `npm run check` green; demo over HTTP (`next start` with `WORKSPACE_DEMO=1`, stop it with TaskStop): owner of Tienda → 200 with «Qué potenciar», «Punto de equilibrio», a salary line concept; Elisa (member) → 200 without that concept text but with «Personal»; Estudio → empty state; outsider → 404. Record in `PROJECT_STATUS.md` what was and wasn't verified. **Step 5:** Commit «Rentabilidad: pestaña con escandallo, márgenes y gastos».

### Task 7: First load data for Amapola (not committed)

**Files:** Create in `strategy/` (git-ignored): `escandallo-productos.csv`, `escandallo-costes-fijos.csv`, `gastos-mensuales.csv`.

- [ ] Transcribe the PDF (shared by Marc in the conversation) into the three formats of Task 3. Products: fabric size from the format (A6 10,5×14,8; A5 14,8×21; A4 21×29,7; A3 29,7×42; wooden frames by their cm; others blank and listed in the hand-over); Shopify mapping by family → Shopify title (e.g. «Tablitas + clip … foto» → «Revelado en lámina de madera con clip», «… texto» → «Revelado texto en lámina de madera con clip»; A6 → «10x15cm», A5 → «15x21cm», A4 → «21x30cm», A3 → «30x42cm») — check against the titles in `strategy/3a…csv`. Fixed costs: the PDF lines **without** «Marketing externo: campañas» and **plus** «Tinta 90 €/mes» in estructura. Settings are entered by hand (listed in the hand-over).
- [ ] Parse each file with `parseProfitCsv` in a temporary test (deleted, not committed) to prove they import.
- [ ] Nothing to commit; list in the final message the products whose fabric size or Shopify match is a guess.
