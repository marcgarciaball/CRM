/** Dirección pública de la aplicación (enlaces de los emails de Supabase Auth). */
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Destino de los enlaces de invitación y de cambio de contraseña: confirmar la sesión y elegir contraseña. */
export const passwordLinkTarget = () => `${siteUrl()}/auth/confirm?next=/cuenta/contrasena`;
