# Panel de resultados · Diseño

Fecha: 2026-11-22 · Estado: aprobado por Marc (2026-11-22)

## Intención

El equipo quiere una pestaña nueva dentro de cada cliente donde ver **de un vistazo** cuánto se ha invertido, cuánto se
ha vendido y **por qué** ha ido así: qué campañas coinciden con cada subida, cuánto se regala en descuentos, de dónde
vienen las ventas (orgánico frente a pago) y si los clientes repiten.

Los datos viven en **Shopify** (ventas, descuentos, devoluciones, pedidos, sesiones, origen, clientes) y **Meta Ads**
(gasto, impresiones, clics, compras según Meta, campañas). De momento **no hay integración**: Marc prepara los datos a
mano en archivos CSV (hoy en `strategy/`, carpeta ignorada por git) y los carga desde la app.

## Objetivos

- Pestaña «Resultados» en cada cliente (`/c/<cliente>/resultados`), visible para **todas las personas del cliente**.
- Guardar los datos en la base de datos, por cliente, con las mismas reglas de acceso que el resto (RLS).
- Cargar los datos **subiendo los CSV desde la propia pestaña**. Subir otra vez un mes ya cargado lo sustituye, así
  que completar noviembre y diciembre es volver a subir el archivo.
- Ver juntas las fechas de las campañas del CRM y la evolución de ventas e inversión (la parte del «por qué»).
- Dejar claro qué datos faltan: un mes o una cifra sin dato se muestra como «sin dato», nunca como 0.

## No objetivos (esta fase)

- Conexión automática con Shopify o Meta (la estructura queda lista para añadirla después).
- Detalle por producto (archivo `3b`, ~860 filas) y margen/beneficio (falta el coste por producto). Fase 2.
- Cohortes (`5c`), embudo por dispositivo (`2b`) y por tipo de tráfico (`2c`). Fase 2 si se echan en falta.
- Google Ads (no se ha invertido).
- Editar cifras sueltas a mano en la app: se corrige el CSV y se vuelve a subir.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que un hueco de datos se lea como un cero y lleve a conclusiones falsas (p. ej. «en noviembre de 2025 no se vendió»).
- Comparar periodos que no son comparables sin decirlo (2025 empieza en febrero; noviembre 2026 es parcial).
- Presentar las «compras según Meta» como ventas reales (Meta las infla: 735 frente a ~85 pedidos con UTM de Meta).
- Que las cifras reales de ventas acaben en git (repositorio, semillas de demo o tests).
- Que alguien sin acceso al cliente vea sus cifras.

## Enfoques considerados

1. **Base de datos + importar CSV desde la app** (elegido por Marc). Dos tablas por cliente; botón «Importar CSV».
   Sirve para cualquier cliente, el equipo actualiza sin pasar por código y una integración futura solo tiene que
   escribir en las mismas tablas.
2. **Leer `strategy/` desde el código.** Lo más rápido, pero las cifras irían al repositorio, solo valdría para un
   cliente y cada actualización pasaría por un desarrollador.
3. **Importar los exports originales de Shopify y Meta y calcularlo todo en la app.** Más fiel y sin preparar
   archivos, pero bastante más trabajo y frágil ante cambios de formato. Queda como evolución.

## Datos

### Archivos que se importan

El tipo se detecta por la cabecera (se ignora el BOM inicial).

**A. Histórico mensual** — formato de `strategy/historico-mensual-2025-2026.csv`: una fila por mes, separador coma,
decimales con punto, celda vacía = sin dato. Columnas (todas numéricas salvo `mes`, `AAAA-MM`):

`ventas_brutas, descuentos, devoluciones, ventas_netas, envios, ventas_totales, pedidos, pedido_medio_shopify,
articulos, sesiones, sesiones_carrito, sesiones_checkout, sesiones_compra, conversion, meta_gasto,
meta_compras_segun_meta, meta_impresiones, meta_clics, ventas_google_bing_org, ventas_directo,
ventas_instagram_sin_pago, ventas_meta_pago_utm, ventas_email, ventas_otros, ventas_sin_atribuir, clientes_nuevos,
clientes_recurrentes, ventas_clientes_nuevos, ventas_clientes_recurrentes`

- `descuentos` y `devoluciones` llegan en negativo; se guardan tal cual y se muestran en positivo con su etiqueta.
- `conversion` es una fracción (0,0315 = 3,15 %).
- Columna opcional nueva **`datos_hasta`** (`AAAA-MM-DD`): si un mes no está completo (p. ej. noviembre con solo
  los días 1 y 2), se indica el último día con datos. Un mes con `datos_hasta` anterior a su último día es
  **parcial**: se pinta con marca «parcial (hasta el 2)», no entra en totales ni comparaciones y aparece en «Datos que
  faltan». El mes en curso es siempre parcial aunque no lleve la columna.
- Las columnas `meta_gasto`, `meta_compras_segun_meta`, `meta_impresiones` y `meta_clics` se **aceptan e ignoran**:
  las cifras de Meta salen solo del informe de Meta (B). Así no hay dos fuentes que puedan contradecirse, y el gasto
  de nov–dic 2025, que solo está en el informe de Meta, entra igual.
- Columnas desconocidas → error con la lista; columnas que faltan → se guardan como sin dato y se avisa.
- Un mes que existe en la tabla y no aparece en el archivo **no se toca**.

**B. Informe de Meta Ads** — export de Meta por campaña, anuncio y mes (formato de
`strategy/Informe-nov-25-oct-26-meta.csv`). Se usan: `Nombre de la campaña`, `Nombre del anuncio`, `Mes`
(«2025-11-01 - 2025-11-30» → mes del primer día), `Alcance`, `Clics (todos)`, `Impresiones`,
`Importe gastado (EUR)`, `Compras`. Se descarta la fila de totales (nombre de campaña vacío). Al importar se
**sustituyen todas las filas de Meta de los meses que contiene el archivo**.

### Tablas (migración nueva)

- `client_metrics_monthly` — `client_id`, `month` (date, día 1), `data_until` (date, anulable), una columna
  `numeric` **anulable** por cada columna de A salvo las `meta_*`, `imported_by`, `imported_at`. Clave `(client_id, month)`. Importar = `upsert` por mes.
- `client_meta_ads` — `client_id`, `month`, `campaign_name`, `ad_name`, `reach`, `impressions`, `clicks`, `spend`,
  `purchases` (anulables), `imported_by`, `imported_at`. Importar = borrar meses del archivo + insertar.
- RLS: leer con `is_client_member(client_id)`; escribir/borrar con `can_write_client(client_id)` (cualquier persona
  del cliente si no está archivado). Las demás pantallas siguen la misma regla.
- No se usa `activity_log` (solo admite tareas y entregables). La pestaña muestra «Última importación: <persona>,
  <fecha>» para cada uno de los dos archivos, a partir de `imported_by` / `imported_at`.
- Botón «Borrar todos los resultados» solo para la Propiedad del cliente, en la zona de peligro de la pestaña.

### Cifras calculadas (en el servidor, no se guardan)

- Pedido medio de un periodo = ventas_totales / pedidos de ese periodo (el `pedido_medio_shopify` mensual se guarda
  pero no se promedia, porque una media de medias engaña).
- % descuento = |descuentos| / ventas_brutas.
- Inversión Meta de un mes = suma de `spend` de `client_meta_ads` de ese mes (lo mismo para impresiones, clics y
  compras según Meta). Un mes sin filas de Meta es «sin dato», no 0.
- Gasto / ventas = inversión Meta / ventas_totales (solo si los dos existen).
- Conversión de un periodo = suma de `sesiones_compra` / suma de `sesiones` (no media de conversiones mensuales).
- Ventas orgánicas = google_bing_org + directo + instagram_sin_pago + email; de pago = meta_pago_utm;
  resto = otros + sin_atribuir.
- % clientes recurrentes = recurrentes / (nuevos + recurrentes).
- Totales de un periodo: suma solo de meses con dato; si algún mes del periodo no tiene dato para esa cifra, el total
  lleva la marca «parcial» con los meses que faltan.

## La pantalla

Pestaña **«Resultados»** (icono de gráfico) después de «Campañas». Arriba, selector de periodo: **año** (2026, 2025…
según los datos) o **últimos 12 meses**; por defecto, el año más reciente con datos. Cada cifra se compara con el año
anterior **usando solo los meses que tienen dato completo en los dos años**, y se indica el tramo
(«×4,9 vs feb–oct 2025»). Si no hay ningún mes comparable, no se muestra comparación. Las cifras del boceto son
ilustrativas; las de verdad salen de esta regla (p. ej. ×4,9 y no ×5,2).

```
Resultados · Amapola                                [2026 ▾]  [Importar CSV]
─────────────────────────────────────────────────────────────────────────────
VENTAS TOTALES   PEDIDOS    PEDIDO MEDIO   DESCUENTOS        INVERSIÓN META
165.652 €        3.200      51,77 €        12.061 € · 7,1 %  5.294 €
×5,2 vs 2025     ×5,1       +9 %           vs 1,9 % en 2025  3,2 % de ventas
CONVERSIÓN 3,2 % (4,2 % en 2025) · CLIENTES NUEVOS 2.576 · REPITEN 557 (18 %)
─────────────────────────────────────────────────────────────────────────────
Ventas e inversión por mes
 €│        ▇▇                     ■ ventas 2026   □ mismo mes 2025
  │     ▇▇ ▇▇ ▇▇ ▇▇               ─ inversión Meta (eje derecho)
  │  ▇▇ ▇▇ ▇▇ ▇▇ ▇▇ ▇▇
  └─ene─feb─mar─abr─may─jun─jul─ago─sep─oct─nov─dic
     [Rebajas ████████]   [Black Friday ██]      ← campañas del CRM por fechas
─────────────────────────────────────────────────────────────────────────────
De dónde vienen las ventas (barras apiladas por mes: orgánico / Meta pago / resto)
Clientes nuevos y que repiten (barras por mes)
─────────────────────────────────────────────────────────────────────────────
Campañas de Meta          Meses     Gasto    Compras (Meta)*  Coste/compra
Ventas · Top productos    ago–oct   762 €    304              2,51 €
…
* Compras que cuenta Meta; no son pedidos de Shopify.
─────────────────────────────────────────────────────────────────────────────
Mes a mes (tabla: ventas, descuentos, pedidos, conversión, gasto Meta, gasto/ventas)
─────────────────────────────────────────────────────────────────────────────
Datos que faltan: nov–dic 2025 · noviembre 2026 parcial · gasto Meta antes de nov 2025
```

- **Campañas del CRM sobre la gráfica:** las campañas no archivadas del cliente con fechas en el periodo se dibujan
  como franjas bajo el eje de meses, con enlace a su ficha. Es la manera de ligar «qué hicimos» con «qué pasó».
  No se intenta emparejar campañas del CRM con campañas de Meta por nombre.
- **Huecos:** un mes sin fila sale vacío en la gráfica con la marca «sin dato» y en la tabla como «sin dato».
- **Sin ningún dato:** estado vacío que explica qué archivos subir y el formato, con el botón «Importar CSV».
- **Importar:** ventana emergente (como «Crear») con un campo de archivo `.csv`; tras importar se muestra el resumen
  («12 meses: 10 nuevos, 2 sustituidos» o «Meta: 145 filas en 12 meses») o los errores por fila. Límite 1 MB.
- **Cliente archivado:** solo lectura (sin importar ni borrar), como el resto de pantallas.
- Móvil: las cifras clave en dos columnas, las gráficas a todo el ancho con desplazamiento horizontal, las tablas con
  desplazamiento horizontal. La barra inferior pasa de 5 a 6 elementos (`grid-cols-6`).

## Restricciones

- Next.js 16 de este repo (leer `node_modules/next/dist/docs/` antes de usar APIs), Tailwind 4, sin dependencias
  nuevas salvo que sea imprescindible: **las gráficas se dibujan en SVG propio** (no hay librería de gráficos y son
  pocas y sencillas).
- Estilo del proyecto: negro, blanco y naranja (#0a0a0a / #fff / #ff5a00), Archivo + IBM Plex Mono para cifras,
  esquinas cuadradas, reglas de 1px, sin sombras ni degradados; el naranja nunca como color de texto sobre blanco.
  Las series de las gráficas tienen que distinguirse también sin color (patrón, grosor o etiqueta directa).
- Cifras en formato español (`1.234,56 €`, `3,2 %`), meses en español.
- Patrón de código existente: servicio en `lib/services/`, acción en `app/actions/`, página con `loadClient`,
  transacciones con `withUser` (RLS siempre), migración en `supabase/migrations/`.
- La demo (`WORKSPACE_DEMO=1`) y los tests usan **datos inventados**; nunca las cifras de `strategy/`.

## Decidido con Marc

- Enfoque 1 (base de datos + importar CSV desde la app).
- Fuentes: Shopify y Meta, cargadas a mano a partir de los CSV que prepara Marc.
- Lo ve todo el equipo del cliente.
- Comparación con el año anterior solo sobre los meses con dato completo en los dos años, indicando el tramo.

## Decisiones mías (corregibles)

- Nombre de la pestaña «Resultados» y su posición tras «Campañas».
- Gasto, impresiones, clics y compras de Meta salen solo del informe de Meta; las columnas `meta_*` del mensual se
  ignoran.
- Meses parciales marcados con la columna opcional `datos_hasta`; quedan fuera de totales y comparaciones.
- La última importación se muestra en la pestaña, no en Novedades.
- Cualquier persona del cliente puede importar; solo la Propiedad puede borrarlo todo.
- Productos, margen y cohortes, fuera de esta fase.
- Periodo por año o últimos 12 meses, comparación con los mismos meses del año anterior.
- Gráficas en SVG propio, sin librería.

## Queda para quien lo construya

- Estructura interna del parser y de los componentes de gráfica.
- Textos exactos de ayuda y de errores.
- Tests: parser (ambos formatos, BOM, vacíos, negativos, columnas raras), cálculos (huecos, parciales, comparación),
  RLS (otra persona no ve ni importa), y la página cargando en la demo.
