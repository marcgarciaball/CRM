// TEMPORAL: diagnóstico del fallo de «Crear entregable». Borrar tras usarlo.
import { expect, test } from "@playwright/test";

test("debug crear entregable desde una campaña", async ({ page }) => {
  page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("dialog", (d) => { console.log("DIALOG", d.type(), d.message()); void d.dismiss(); });
  page.on("response", (r) => { if (r.request().method() === "POST") console.log("POST", r.status(), r.url()); });
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("NAV", f.url()); });

  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar como Maite" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Maite");

  await page.goto("/campanas/nueva");
  await page.getByLabel("Nombre").fill(`DBG ${Date.now()}`);
  await page.getByLabel("Inicio").fill("2027-01-20");
  await page.getByLabel("Fin").fill("2027-02-10");
  await page.getByRole("button", { name: "Crear campaña" }).click();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Nueva campaña");

  await page.getByRole("link", { name: "Nuevo entregable" }).click();
  await page.getByLabel("Título").fill("DBG titulo");
  await page.getByLabel("Fecha prevista de publicación").fill("2027-01-24");
  console.log("FORM VALID?", await page.locator("form").evaluate((f: HTMLFormElement) => f.checkValidity()));
  await page.getByRole("button", { name: "Crear entregable" }).click();
  await page.waitForTimeout(4000);
  console.log("URL", page.url());
  console.log("ALERTS", await page.getByRole("alert").allInnerTexts());
  console.log("BODY", (await page.locator("main").innerText()).slice(0, 600));
});
