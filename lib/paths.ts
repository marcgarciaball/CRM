/** Rutas internas de la aplicación. Ningún componente construye a mano una URL de la app: todas salen de aquí. */

type Ref = { client_id: string; id: string };

/** `/c/<cliente>/<resto…>` */
export const clientPath = (clientId: string, ...rest: string[]): string => ["/c", clientId, ...rest].join("/");

export const taskPath = (x: Ref) => clientPath(x.client_id, "trabajo", "tareas", x.id);
export const deliverablePath = (x: Ref) => clientPath(x.client_id, "trabajo", "entregables", x.id);
export const campaignPath = (x: Ref) => clientPath(x.client_id, "campanas", x.id);
export const resourcePath = (x: Ref) => clientPath(x.client_id, "recursos", x.id);

const SECTIONS = ["calendario", "trabajo", "campanas", "recursos", "ajustes"];

/** La misma sección en otro cliente, sin identificadores de detalle; cualquier otra ruta lleva al resumen del cliente. */
export function swapClient(pathname: string, toClientId: string): string {
  const section = /^\/c\/[^/]+\/([^/?#]+)/.exec(pathname)?.[1];
  return section && SECTIONS.includes(section) ? clientPath(toClientId, section) : clientPath(toClientId);
}

/** Formulario «Nuevo cliente» de la lista de clientes. */
export const newClientPath = () => "/clientes#nuevo";

/** Parámetro que abre «Crear» al llegar a un cliente (lo lee `QuickCreate`). */
export const QUICK_CREATE_PARAM = "crear";
/** Resumen del cliente con la ventana «Crear» abierta. */
export const quickCreatePath = (clientId: string) => `${clientPath(clientId)}?${QUICK_CREATE_PARAM}=1`;
