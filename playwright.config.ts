import { defineConfig } from "@playwright/test";

/** E2E contra la demo local (PGlite + datos ficticios). No toca Supabase ni ningún servicio externo. */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  // PW_CHANNEL=chrome usa el Chrome instalado; PW_EXECUTABLE apunta a un binario concreto.
  use: {
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {},
    baseURL: "http://127.0.0.1:3917", locale: "es-ES", timezoneId: "Europe/Madrid" },
  webServer: {
    command: "npm run build && npx next start -p 3917",
    env: { AMAPOLA_DEMO: "1" },
    url: "http://127.0.0.1:3917/login",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
