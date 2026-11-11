import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 60_000 },
  resolve: {
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/empty.ts"),
      "@": path.resolve(import.meta.dirname),
    },
  },
});
