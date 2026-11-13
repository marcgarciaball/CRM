import { expect, test, type Page } from "@playwright/test";

const stamp = Date.now().toString(36);
const campaignName = `E2E Bodas ${stamp}`;
const title = `E2E Newsletter ${stamp}`;
// Fechas en meses futuros para no depender del día en que se ejecute.
const now = new Date();
const ym = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
const month1 = ym(2), month2 = ym(3);

// La demo tiene dos clientes. Con uno solo, el inicio lleva a su resumen (`/c/<cliente>`); con varios (Elisa), se entra
// en `client` desde el inicio de todos los clientes. Ese resumen es la base de las demás rutas.
let base = "";
async function loginAs(page: Page, name: string, client = "Estudio Demo") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: `Entrar como ${name}` }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Hola, ${name}`);
  if (!/\/c\/[0-9a-f-]{36}$/.test(new URL(page.url()).pathname)) {
    await page.getByRole("main").getByRole("link", { name: client, exact: true }).click();
  }
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  base = new URL(page.url()).pathname;
}
/** Selector de cliente de la barra lateral, abierto. */
async function openSwitcher(page: Page) {
  const switcher = page.locator("aside details").first();
  await switcher.locator("summary").click();
  return switcher;
}
const status = (page: Page) => page.getByRole("region", { name: "Estado y siguiente paso" });
async function addLink(page: Page, kind: "campaign" | "deliverable" | "task", linkTitle: string, url: string, primary = false) {
  const form = page.locator("#materiales form");
  if (!(await form.isVisible())) await page.locator("#materiales summary", { hasText: "Añadir enlace" }).click();
  await page.locator(`#add-${kind}-title`).fill(linkTitle);
  await page.locator(`#add-${kind}-url`).fill(url);
  if (primary) await form.getByLabel(/Fijar como material principal/).check();
  await form.getByRole("button", { name: "Añadir enlace" }).click();
  await expect(page.locator("#materiales").getByRole("link", { name: new RegExp(linkTitle) }).first()).toBeVisible();
}

test.describe.configure({ mode: "serial" });
let deliverableUrl = "";
let campaignUrl = "";

test("Maite crea la campaña, la newsletter y reparte las tareas", async ({ page }) => {
  await loginAs(page, "Maite");
  await page.goto(`${base}/campanas/nueva`);
  await page.getByLabel("Nombre").fill(campaignName);
  await page.getByLabel("Inicio").fill(`${month1}-20`);
  await page.getByLabel("Fin").fill(`${month2}-10`);
  await page.getByRole("button", { name: "Crear campaña" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(campaignName);
  campaignUrl = page.url();
  await addLink(page, "campaign", "Carpeta de campaña", "https://example.com/e2e/carpeta", true);
  await addLink(page, "campaign", "Landing", "https://example.com/e2e/landing");

  await page.getByRole("link", { name: "+ Entregable" }).click();
  await page.getByLabel("Título").fill(title);
  await page.getByLabel("Fecha prevista de publicación").fill(`${month1}-24`);
  await page.getByRole("button", { name: "Crear entregable" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  deliverableUrl = page.url();
  await expect(page.locator("#materiales")).toContainText(`De la campaña «${campaignName}»`);
  await expect(page.locator("#materiales")).toContainText("Carpeta de campaña");

  for (const [task, person] of [["E2E Copy", "Sara"], ["E2E Diseño", "Ainhoa"]]) {
    await page.goto(deliverableUrl);
    await page.getByRole("link", { name: "+ Tarea" }).click();
    await page.getByLabel("Título").fill(`${task} ${stamp}`);
    await page.getByLabel("Asignada a").selectOption({ label: person });
    await page.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${task} ${stamp}`);
    // La tarea muestra los enlaces heredados del entregable y de la campaña.
    await expect(page.locator("#materiales")).toContainText(`Del entregable «${title}»`);
    await expect(page.locator("#materiales")).toContainText("Carpeta de campaña");
  }
  await addLink(page, "task", "Referencias de diseño", "https://example.com/e2e/refs");
  await addLink(page, "task", "Plantilla de Figma", "https://example.com/e2e/plantilla");
});

test("Sara guarda copy, enlaces y comentario y pide revisión; no puede aprobar", async ({ page }) => {
  await loginAs(page, "Sara");
  await expect(page.getByRole("link", { name: `E2E Copy ${stamp}` })).toBeVisible(); // su tarea en Inicio
  await page.goto(deliverableUrl);
  await page.locator("#f-copy").fill("Copy de prueba E2E");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Entregable guardado.")).toBeVisible();
  await addLink(page, "deliverable", "Texto de Sara", "https://example.com/e2e/copy");
  await page.getByLabel("Nuevo comentario").fill("Listo para revisar (E2E)");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.locator("#comentarios")).toContainText("Listo para revisar (E2E)");
  await status(page).getByRole("button", { name: "Pedir revisión" }).click();
  await expect(status(page)).toContainText("En revisión");
  await expect(status(page).getByRole("button", { name: "Validar" })).toHaveCount(0);
  await expect(status(page)).toContainText("Esperando la validación");
  // Los enlaces no válidos se rechazan.
  await page.locator("#materiales summary", { hasText: "Añadir enlace" }).click();
  await page.locator("#add-deliverable-title").fill("Malo");
  await page.locator("#add-deliverable-url").fill("https://usuario:clave@example.com/x");
  await page.locator("#materiales form").getByRole("button", { name: "Añadir enlace" }).click();
  await expect(page.locator("#materiales form").getByRole("alert")).toContainText("usuario ni contraseña");
});

test("Ainhoa añade el diseño final; Maite aprueba; Elisa programa y publica", async ({ page }) => {
  await loginAs(page, "Ainhoa");
  await page.goto(deliverableUrl);
  await addLink(page, "deliverable", "Diseño de Ainhoa", "https://example.com/e2e/figma", true);
  await expect(page.locator("#materiales")).toContainText("Requiere aprobación");

  await loginAs(page, "Maite");
  await page.goto(deliverableUrl);
  await status(page).getByRole("button", { name: "Validar" }).click();
  await expect(status(page)).toContainText("Validado");
  await expect(status(page)).toContainText("Validado por Maite");

  await loginAs(page, "Elisa");
  await page.goto(deliverableUrl);
  // Una referencia no invalida la aprobación.
  await addLink(page, "deliverable", "Referencia", "https://example.com/e2e/ref");
  await expect(status(page)).toContainText("Validado");
  await status(page).getByRole("button", { name: "Marcar como programado" }).click();
  await expect(status(page)).toContainText("Programado para el");
  await status(page).getByLabel("¿Qué día se publicó?").fill(`${month1}-25`);
  await status(page).getByRole("button", { name: "Marcar como publicado" }).click();
  await expect(status(page)).toContainText("Publicado");
  await page.reload(); // persistencia
  await expect(status(page)).toContainText("Publicado");
  await expect(page.getByText("Publicaciones registradas")).toBeVisible();
  await expect(page.locator("#comentarios")).toContainText("Listo para revisar (E2E)");
});

test("calendario: lista mensual con enlaces, campaña en dos meses y filtros", async ({ page }) => {
  await loginAs(page, "Elisa");
  await page.goto(`${base}/calendario?vista=lista&mes=${month1}`);
  const row = page.locator("li", { has: page.getByRole("link", { name: title, exact: true }) }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name: /Diseño de Ainhoa/ })).toHaveAttribute("href", "https://example.com/e2e/figma");
  await expect(row.getByRole("link", { name: /Diseño de Ainhoa/ })).toHaveAttribute("rel", /noopener/);
  await row.getByText(/Todos los materiales/).click();
  await expect(row.getByRole("link", { name: /Texto de Sara/ })).toBeVisible();
  await expect(row.getByRole("link", { name: /Carpeta de campaña/ })).toBeVisible();
  // La campaña abarca dos meses y es un único registro.
  await expect(page.getByRole("list", { name: "Campañas de este mes" }).getByRole("link", { name: new RegExp(campaignName) })).toBeVisible();
  await page.goto(`${base}/calendario?vista=lista&mes=${month2}`);
  await expect(page.getByRole("list", { name: "Campañas de este mes" }).getByRole("link", { name: new RegExp(campaignName) })).toBeVisible();
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);
  // Filtro por canal: fuera el canal equivocado, dentro el correcto.
  await page.goto(`${base}/calendario?vista=lista&mes=${month1}`);
  await page.getByText("Filtros", { exact: true }).click();
  await page.getByLabel("Canal").selectOption({ label: "Anuncio Meta" });
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);
  await page.getByLabel("Canal").selectOption({ label: "Newsletter" });
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
  // Rejilla mensual y lo no fechado.
  await page.goto(`${base}/calendario?mes=${month1}`);
  await expect(page.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
  await expect(page.locator("#sin-planificar")).toContainText("Landing: packs de boda");
});

test("cambiar el copy publicado exige nueva revisión y conserva el historial; mover de mes conserva todo", async ({ page }) => {
  await loginAs(page, "Sara");
  await page.goto(deliverableUrl);
  await page.locator("#f-copy").fill("Copy corregido E2E");
  await page.getByText("Brief y datos del entregable").click();
  await page.locator("#f-planned").fill(`${month2}-03`);
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(status(page)).toContainText("En revisión");
  await expect(status(page)).toContainText("necesita validarse de nuevo");
  await expect(page.getByText("Publicaciones registradas")).toBeVisible();
  await expect(status(page).getByRole("button", { name: "Marcar como programado" })).toHaveCount(0);
  await page.goto(`${base}/calendario?vista=lista&mes=${month2}`);
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
  await page.goto(deliverableUrl);
  for (const text of ["Texto de Sara", "Diseño de Ainhoa", "Referencia", "Carpeta de campaña"]) await expect(page.locator("#materiales")).toContainText(text);
  await expect(page.locator("#comentarios")).toContainText("Listo para revisar (E2E)");
  await expect(page.getByRole("link", { name: `E2E Copy ${stamp}` })).toBeVisible();
});

test("reutilizar un recurso en dos registros y desvincularlo de uno", async ({ page }) => {
  await loginAs(page, "Ainhoa");
  await page.goto(`${base}/trabajo`);
  await page.getByRole("link", { name: `E2E Diseño ${stamp}` }).click();
  await page.locator("#materiales summary", { hasText: "Añadir enlace" }).click();
  await page.getByLabel("Uno que ya está en Recursos").check();
  const option = await page.locator("#add-task-resource option", { hasText: "Texto de Sara" }).first().getAttribute("value");
  await page.locator("#add-task-resource").selectOption(option!);
  await page.locator("#materiales form").getByRole("button", { name: "Añadir enlace" }).click();
  const ownRow = page.locator("#materiales > ul > li", { hasText: "Texto de Sara" });
  await expect(ownRow).toContainText(`También en: Entregable «${title}»`);
  // En Recursos sigue siendo un único registro con dos usos.
  await page.goto(`${base}/recursos?q=example.com/e2e/copy`);
  await expect(page.getByRole("link", { name: /Texto de Sara/ })).toHaveCount(1);
  await page.goBack();
  page.once("dialog", (d) => d.accept());
  await ownRow.getByText("Opciones", { exact: true }).click();
  await ownRow.getByRole("button", { name: "Quitar de aquí" }).click();
  await expect(page.locator("#materiales > ul > li", { hasText: "Texto de Sara" })).toHaveCount(0);
  await page.goto(deliverableUrl);
  await expect(page.locator("#materiales")).toContainText("Texto de Sara");
});

test("aviso de edición simultánea", async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const pa = await a.newPage(), pb = await b.newPage();
  await loginAs(pa, "Sara");
  await loginAs(pb, "Elisa");
  await pa.goto(campaignUrl);
  await pb.goto(campaignUrl);
  for (const p of [pa, pb]) await p.getByText("Editar la campaña").click();
  await pa.getByLabel("Objetivo").fill("Objetivo de Sara");
  await pb.getByLabel("Objetivo").fill("Objetivo de Elisa");
  await pb.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(pb.getByText("Campaña guardada.")).toBeVisible();
  await pa.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(pa.getByRole("alert")).toContainText("Otra persona ha modificado este registro");
  await pa.getByRole("button", { name: "Sobrescribir con mis cambios" }).click();
  await expect(pa.getByText("Campaña guardada.")).toBeVisible();
  await pb.reload();
  await expect(pb.getByLabel("Objetivo")).toHaveValue("Objetivo de Sara");
  await a.close();
  await b.close();
});

test("crear y editar sin salir de la página, arrastrar, novedades y búsqueda", async ({ page }) => {
  const quick = `E2E Rápida ${stamp}`;
  await loginAs(page, "Maite");
  // Crear en la ventana emergente: la persona sigue en Inicio.
  await page.getByRole("button", { name: "Crear" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("¿Qué hay que hacer?").fill(quick);
  await dialog.getByLabel("Para quién").selectOption({ label: "Ainhoa" });
  await dialog.getByRole("button", { name: "Crear tarea" }).click();
  await expect(dialog.getByText("Tarea creada.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}$`));

  // Edición en la lista: fecha y estado sin abrir la tarea.
  await page.goto(`${base}/trabajo`);
  const row = page.locator("li", { has: page.getByRole("link", { name: quick, exact: true }) });
  await row.getByLabel(`Fecha límite de «${quick}»`).fill(`${month1}-12`);
  await expect(row.getByLabel(`Fecha límite de «${quick}»`)).toHaveValue(`${month1}-12`);
  await page.reload();
  await expect(row.getByLabel(`Fecha límite de «${quick}»`)).toHaveValue(`${month1}-12`);

  // Kanban: arrastrar a «En curso».
  await page.goto(`${base}/trabajo?vista=kanban`);
  await page.getByRole("link", { name: quick, exact: true }).dragTo(page.getByRole("region", { name: "En curso" }));
  await expect(page.getByRole("region", { name: "En curso" }).getByRole("link", { name: quick, exact: true })).toBeVisible();

  // Calendario: arrastrar la publicación a otro día.
  await page.goto(`${base}/calendario?mes=${month2}`);
  await page.getByRole("link", { name: title, exact: true }).first().dragTo(page.getByRole("link", { name: /Nuevo entregable el .* 15 de/ }).locator("xpath=ancestor::div[2]"));
  await page.goto(`${base}/calendario?vista=lista&mes=${month2}`);
  await expect(page.locator("li", { has: page.getByRole("link", { name: title, exact: true }) }).first().getByLabel(/Fecha prevista/)).toHaveValue(`${month2}-15`);

  // Novedades de Ainhoa y búsqueda global.
  await loginAs(page, "Ainhoa");
  await page.getByRole("link", { name: /Novedades: \d+ sin leer/ }).click();
  await expect(page.locator("li", { hasText: quick })).toContainText("Maite te asignó esta tarea");
  await page.getByRole("button", { name: "Marcar todo como leído" }).click();
  await expect(page.getByRole("link", { name: "Novedades", exact: true })).toBeVisible();
  await page.getByLabel(/Buscar tareas/).fill(stamp);
  await page.getByLabel(/Buscar tareas/).press("Enter");
  await expect(page.getByRole("link", { name: quick, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: campaignName, exact: true })).toBeVisible();
});

test("una miembro no ve administración; sin sesión no hay acceso", async ({ page }) => {
  await loginAs(page, "Sara");
  await page.goto("/admin/usuarios");
  await expect(page.getByText("Invitar a una persona")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${base}$`));
  await page.context().clearCookies();
  await page.goto("/trabajo");
  await expect(page).toHaveURL(/\/login$/);
});

test("rutas antiguas y clientes que no existen o no son de la persona", async ({ page }) => {
  await loginAs(page, "Sara");
  // Una ruta sin cliente (de antes de los clientes) lleva al inicio, que con un solo cliente abre su resumen.
  const legacy = await page.request.get("/trabajo", { maxRedirects: 0 });
  expect([307, 308]).toContain(legacy.status());
  expect(new URL(legacy.headers()["location"], page.url()).pathname).toBe("/");
  await page.goto("/trabajo");
  await expect(page).toHaveURL(new RegExp(`${base}$`));
  // Identificador no válido y cliente inexistente (o ajeno): la misma página de «No encontrado», con 404.
  for (const url of ["/c/abc/trabajo", "/c/00000000-0000-4000-8000-000000000000/trabajo"]) {
    const response = await page.goto(url);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "No encontrado" })).toBeVisible();
  }
});

let tiendaUrl = "";
test("Sara ve un cliente y entra en su resumen; Elisa ve dos y el inicio de todos los clientes", async ({ page }) => {
  await loginAs(page, "Sara");
  const own = await openSwitcher(page);
  await expect(own.getByRole("list", { name: "Clientes" }).getByRole("link")).toHaveText(["Estudio Demo"]);

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar como Elisa" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hola, Elisa");
  await expect(page).toHaveURL(/\/$/);
  const main = page.getByRole("main");
  for (const name of ["Estudio Demo", "Tienda Demo"]) await expect(main.getByRole("link", { name, exact: true })).toBeVisible();
  // Lo que la necesita, con el cliente de cada fila.
  await expect(main.locator("li", { hasText: "Fotografiar los tres tamaños del marco" })).toContainText("Tienda Demo");

  // «Crear» fuera de un cliente: primero el cliente; llega con la ventana abierta.
  await page.locator("aside").getByText("Crear", { exact: true }).click();
  await page.getByRole("list", { name: "Crear en el cliente" }).getByRole("link", { name: "Tienda Demo" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  tiendaUrl = new URL(page.url()).pathname;
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();

  // Cambiar de cliente conserva la sección.
  await page.goto(`${tiendaUrl}/trabajo`);
  await (await openSwitcher(page)).getByRole("link", { name: "Estudio Demo" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/trabajo$/);
  expect(new URL(page.url()).pathname).not.toBe(`${tiendaUrl}/trabajo`);

  // Sara no es de la tienda: 404.
  await loginAs(page, "Sara");
  expect((await page.goto(tiendaUrl))?.status()).toBe(404);
});

test("ecommerce crea un cliente y añade a Sara; Sara lo ve en su selector", async ({ page }) => {
  const name = `E2E Cliente ${stamp}`;
  await loginAs(page, "Responsable ecommerce");
  await page.goto("/clientes#nuevo");
  await page.locator("#nc-name").fill(name);
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("main")).toContainText(`${name} · Propiedad`);

  await page.getByRole("link", { name: "Ajustes" }).click();
  const add = page.locator("form", { has: page.getByRole("button", { name: "Añadir" }) });
  await add.getByLabel("Email").fill(" Sara@Demo.invalid ");
  await add.getByRole("button", { name: "Añadir" }).click();
  await expect(add.getByRole("status")).toHaveText("Acceso concedido.");
  await add.getByLabel("Email").fill("sara@demo.invalid");
  await add.getByRole("button", { name: "Añadir" }).click();
  await expect(add.getByRole("status")).toHaveText("sara@demo.invalid ya tiene acceso.");
  await expect(page.getByRole("row", { name: /Sara/ })).toHaveCount(1);

  // Sara tiene ahora dos clientes: el inicio de todos, y el nuevo en el selector.
  await loginAs(page, "Sara");
  const switcher = await openSwitcher(page);
  await expect(switcher.getByRole("list", { name: "Clientes" }).getByRole("link", { name })).toBeVisible();
});

// Entrar con Google no existe en la demo: la página de entrada no ofrece el botón ni el aviso.
test("la demo no ofrece entrar con Google", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/login?error=google");
  await expect(page.getByRole("button", { name: "Entrar con Google" })).toHaveCount(0);
  await expect(page.getByText("No se ha podido entrar con Google")).toHaveCount(0);
});

// Solo con un servidor que no sea la demo (con valores cualquiera de Supabase): E2E_NON_DEMO=1 contra ese servidor.
test("/login?error=google muestra el aviso y el botón de Google", async ({ page }) => {
  test.skip(process.env.E2E_NON_DEMO !== "1", "Necesita un servidor sin WORKSPACE_DEMO.");
  await page.context().clearCookies();
  await page.goto("/login?error=google");
  await expect(page.getByRole("alert")).toHaveText("No se ha podido entrar con Google. Inténtalo de nuevo o usa tu email.");
  await expect(page.getByRole("button", { name: "Entrar con Google" })).toBeVisible();
});
