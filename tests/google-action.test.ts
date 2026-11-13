import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// redirect() lanza como en Next; Supabase Auth es un mock: solo se comprueba qué se le pide.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` }); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
const oauth = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAuth: async () => ({ auth: { signInWithOAuth: oauth.signIn } }) }));

const { signInWithGoogleAction } = await import("@/app/actions/account");

const redirectOf = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (err: { digest?: string }) => err);
  return e?.digest?.split(";")[2] ?? null;
};

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.WORKSPACE_DEMO;
  process.env.NEXT_PUBLIC_SITE_URL = "https://crm.example/";
});
afterEach(() => {
  delete process.env.WORKSPACE_DEMO;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("signInWithGoogleAction", () => {
  it("pide a Supabase entrar con Google con regreso a la URL del sitio y redirige a la dirección que devuelve", async () => {
    oauth.signIn.mockResolvedValue({ data: { url: "https://accounts.google.example/auth?x=1" }, error: null });
    expect(await redirectOf(signInWithGoogleAction())).toBe("https://accounts.google.example/auth?x=1");
    expect(oauth.signIn).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "https://crm.example/auth/confirm?next=/" } });
  });

  it("si Supabase falla o no devuelve dirección va a /login?error=google", async () => {
    oauth.signIn.mockResolvedValue({ data: { url: null }, error: new Error("proveedor desactivado") });
    expect(await redirectOf(signInWithGoogleAction())).toBe("/login?error=google");
    oauth.signIn.mockResolvedValue({ data: { url: null }, error: null });
    expect(await redirectOf(signInWithGoogleAction())).toBe("/login?error=google");
  });

  it("en la demo lanza y no llama a Supabase", async () => {
    process.env.WORKSPACE_DEMO = "1";
    await expect(signInWithGoogleAction()).rejects.toThrow("No disponible en la demo.");
    expect(oauth.signIn).not.toHaveBeenCalled();
  });
});
