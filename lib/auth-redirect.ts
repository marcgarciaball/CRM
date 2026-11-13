/**
 * Destino interno tras entrar. Solo se acepta una ruta de esta misma aplicación: empieza por una única `/`,
 * sin `\`, sin `//` y sin caracteres de control. Cualquier otra cosa (incluidas URLs absolutas) vuelve a `/`.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.includes("\\") || raw.includes("//") || /[\u0000-\u001f\u007f]/.test(raw)) return "/";
  return raw;
}
