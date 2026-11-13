import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth-redirect";

describe("safeNext", () => {
  it("conserva rutas internas", () => {
    expect(safeNext("/c/abc/trabajo")).toBe("/c/abc/trabajo");
    expect(safeNext("/cuenta/contrasena")).toBe("/cuenta/contrasena");
    expect(safeNext("/")).toBe("/");
  });

  it("un valor aún codificado se devuelve tal cual", () => {
    // Es seguro: la redirección se construye como URL absoluta en el origen de la aplicación, y `%2F%2F` no se decodifica allí.
    expect(safeNext("/%2F%2Fevil")).toBe("/%2F%2Fevil");
  });

  it("todo lo demás vuelve a /", () => {
    for (const bad of [null, undefined, "", "//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "/a//b", "/a\nb", "/a\tb", "/a\u0000b", "/a\u007fb", "c/abc", "?x=/"]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
