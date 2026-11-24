# Rentabilidad (escandallo, gastos y márgenes) · Diseño

Fecha: 2026-11-23 · Estado: aprobado por Marc (2026-11-24)

## Intención

Marc quiere una página en el CRM, **tipo panel**, donde ver de un vistazo **cuánto cuesta producir cada producto,
cuánto margen deja y cuánto ha aportado en total**, junto con los **gastos del negocio frente a las ventas** mes a mes.
La pregunta que debe responder: **qué potenciar** (lo que más margen y más dinero total deja) y qué no compensa.

Hoy esto vive en una hoja (escandallo de Amapola Lab, PDF de 3 páginas): ventas y gastos por mes con comentario,
supuestos generales, costes fijos (personal y estructura) y una tabla de ~47 productos con precio, minutos de
producción, coste de soporte y de embalaje. Los costes cambian a menudo (oficina, stock, una persona nueva), así que
**todo se edita desde el CRM** y los márgenes se recalculan solos.

Complementa la pestaña «Resultados» (`docs/superpowers/specs/2026-11-22-panel-resultados-design.md`): Resultados dice
cómo van las ventas; Rentabilidad dice cuánto se gana con ellas.

## Objetivos

- Pestaña **«Rentabilidad»** en cada cliente (`/c/<cliente>/rentabilidad`), después de «Resultados».
- Escandallo editable: supuestos generales, costes fijos y productos.
- Dos márgenes por producto: **contribución** (precio sin IVA − costes variables) y **completo** (además, personal y
  estructura repartidos por minuto de producción, como hace la hoja).
- Cruce con las **unidades y ventas reales** de Shopify por producto y mes: aportación total de cada producto en el
  periodo, con los descuentos reales.
- Gastos mensuales del negocio (con su comentario) frente a las ventas, y el resultado del mes.
- Punto de equilibrio: ventas al mes necesarias para cubrir los costes fijos.
- Ver qué productos de Shopify no tienen escandallo (p. ej. «Revelado para móvil en botella», que vende 127 al mes y
  no está en la hoja).

## No objetivos

- Contabilidad: ni facturas, ni IVA trimestral, ni impuestos sobre beneficio.
- Inventario o stock.
- Conexión automática con Shopify (se importa el CSV, como en Resultados).
- Simulador de precios («¿y si subo el A5 a 18 €?»): se puede hacer cambiando el precio y viendo el resultado, pero no
  hay un modo «borrador» aparte.

## Anti-objetivos

- Un margen que parece exacto con datos que faltan: si falta un supuesto (p. ej. el coste de envío), el producto lo
  dice («incompleto: falta envío») en vez de calcular como si fuera 0.
- Mezclar precios con y sin IVA: todos los márgenes son **sin IVA**.
- Cifras reales (precios, salarios, gastos) en git, en semillas o en tests.

## Enfoques considerados

- **A. Pestaña nueva «Rentabilidad» (elegido por Marc).** Separa lo que pasó con las ventas de lo que cuesta producir.
  Coste: una pestaña más (7 en la barra).
- **B. Secciones dentro de «Resultados».** Un solo sitio, pero la página crece mucho y mezcla lectura con edición.
- **C. Escandallo en una hoja de Google mostrada en el CRM.** Sin cruce con las ventas reales: no respondería a «qué
  potenciar».

## Datos

### Supuestos generales (uno por cliente, editables en un formulario)

| Campo | Ejemplo de la hoja | Uso |
|---|---|---|
| `iva` | 21 % | precio sin IVA = PVP ÷ (1 + IVA); ventas reales sin IVA |
| `horas_productivas_anuales` | 3.200 | coste por minuto de personal y estructura |
| `precio_tela_m2` | 7,00 € | coste de tela |
| `tinta_m2` | vacío (la tinta es fija, 90 €/mes) | coste de tinta por m² impreso |
| `merma_tela` | 35 % (confirmado por Marc) | tela desperdiciada |
| `reimpresion` | 15 % | unidades que se repiten (encarece tela + tinta) |
| `roturas` | 5 % | roturas y reenvíos (encarece todo el coste variable) |
| `comision_pct` | sin dato | comisión Shopify + pasarela + PayPal, en % del PVP |
| `comision_fija_pedido` | 0,25 € | pasarela, fijo por pedido |
| `envio_neto_pedido` | sin dato | lo que cuesta el envío por pedido menos lo que paga el cliente |
| `unidades_por_pedido` | 3,1 | reparte los costes por pedido entre unidades |

Cualquier campo puede quedar vacío (= sin dato).

### Costes fijos (lista editable)

Filas con grupo (**personal** o **estructura**), concepto, importe al mes y nota. Ejemplos: salarios brutos 2.000 €,
Seguridad Social 480 €, alquiler 816 €, marketing externo campañas 2.000 €… Total personal y total estructura al mes y
al año.
Coste por minuto: `personal anual ÷ (horas × 60)` y `estructura anual ÷ (horas × 60)`.

- **Quién ve qué (decidido con Marc):** la Propiedad ve y edita cada línea. El resto del equipo del cliente ve solo los
  totales de personal y de estructura (y el coste por minuto), nunca las líneas de salario. Lo hace cumplir la base de
  datos: la tabla de costes fijos solo es legible por la Propiedad y los totales salen de una función que devuelve
  importes por grupo.
- **Tinta (decidido con Marc):** es un coste fijo de 90 €/mes y va como línea de estructura. `tinta_m2` sigue existiendo
  por si cambia, y vacío o 0 significa «la tinta no depende de lo impreso».
- **Marketing (decidido con Marc):** la publicidad no es un coste fijo ni se reparte por minutos. La línea «Marketing
  externo: campañas 2.000 €» no se carga. El gasto real de Meta de cada mes sale de Resultados y entra en el punto de
  equilibrio (ver abajo).

### Productos (lista editable)

Por producto: familia («Foto revelada en tela», «Marcos madera»…), formato («A6 foto», «20*26»…), PVP con IVA,
medida de tela en cm (ancho × alto; vacío si no lleva tela), minutos de producción, coste de soporte, coste de
embalaje, nota, activo, y **cómo se reconoce en Shopify**: título del producto en Shopify (se elige entre los títulos
importados) y, opcional, un texto que debe aparecer en la variante («15x21cm», «A6»). La comparación ignora
mayúsculas y trata `*` como `x`. Una variante de Shopify cuenta para el primer producto del escandallo que la reconozca.

### Coste de una unidad

- tela = área m² × precio_tela × (1 + merma) × (1 + reimpresión)
- tinta = área m² × tinta_m2 × (1 + reimpresión); 0 si `tinta_m2` está vacío (la tinta va en costes fijos)
- materiales = tela + tinta + soporte + embalaje; con roturas: × (1 + roturas)
- comisiones = PVP × comision_pct + comision_fija_pedido ÷ unidades_por_pedido
- envío = envio_neto_pedido ÷ unidades_por_pedido
- **contribución** = PVP ÷ (1 + IVA) − materiales − comisiones − envío
- mano de obra = minutos × €/min de personal; estructura = minutos × €/min de estructura
- **margen completo** = contribución − mano de obra − estructura
- Porcentajes sobre el precio sin IVA.
- **Datos que faltan.** Imprescindibles: PVP, IVA y (si lleva tela) medida, precio de tela y tinta. Si falta uno, el
  producto queda «incompleto» y no se calcula. **Comisiones y envío** se calculan como 0 si faltan, pero el margen lleva
  la marca «sin comisiones» / «sin envío» en la tabla y un aviso arriba. Así el panel sirve desde el primer día, sin
  hacer pasar por exacto un margen que no lo es. Mano de obra y estructura: si faltan horas, solo hay margen de
  contribución.
- **Costes de hoy.** Todos los cálculos, también los de periodos pasados, usan el escandallo actual (no se guardan
  versiones con fecha). La página lo dice: «Márgenes con los costes y precios actuales».

### Ventas por producto (importadas)

Se importa el export de Shopify «Ventas mensuales por producto y variante» (formato de
`strategy/3b. Ventas mensuales por producto y variante, con cantidades y costes.csv`). **Cada fila trae dos meses**: el
de `Month` y el de comparación `Month (20250101)` con sus columnas «(20250101)»; se guardan los dos. Se usan título,
variante, ventas brutas, descuentos, devoluciones, ventas netas, unidades, unidades devueltas y pedidos. Volver a
subir sustituye los meses que trae (como el informe de Meta). Mismo botón «Importar CSV»; el tipo se reconoce por la
cabecera.

**Aportación real** de un producto en un periodo = ventas netas reales ÷ (1 + IVA) − unidades netas × coste variable
por unidad. Usa lo que de verdad se cobró (con descuentos), no el PVP.

### Punto de equilibrio

(Costes fijos al mes + gasto medio mensual en Meta del periodo, de Resultados) ÷ % de contribución medio, ponderado por las **ventas reales del periodo** de los productos con
escandallo completo. Se indica qué parte de las ventas del periodo cubre ese cálculo («calculado con el 78 % de las
ventas; el resto no tiene escandallo»).

### Gastos mensuales

Filas mes, gastos (€) y comentario («abrimos oficinas»). Se editan en la pestaña y también se pueden importar en CSV
(`mes,gastos,comentario`). **Los gastos llevan IVA y los envíos de Correos (decidido con Marc)**, así que se comparan con
las ventas **con IVA y con lo cobrado de envío**: `ventas_totales` de Resultados. Esta comparación se rotula «con IVA».
Un mes sin ventas en Resultados sale «sin dato» (nov–dic 2025 se completan subiendo esas filas al histórico mensual de
Resultados). Los gastos mensuales los ve y edita solo la Propiedad; el resto ve el resultado del mes (ventas − gastos).

### Importación del escandallo

Además de editar fila a fila, se admite subir un CSV de productos (columnas = campos de producto) y uno de costes
fijos (`grupo,concepto,importe_mes,nota`), que **sustituyen** la lista entera tras confirmar. Yo prepararé esos CSV a
partir del PDF en `strategy/` (ignorada por git) para la primera carga.

## La pantalla

```
Rentabilidad · Amapola                                     [2026 ▾]  [Importar CSV]
──────────────────────────────────────────────────────────────────────────────────
VENTAS (IVA)     GASTOS      RESULTADO     COSTES FIJOS/MES   PUNTO DE EQUILIBRIO
136.900 €        133.320 €   +3.580 €      10.013 €           19.600 €/mes en ventas
──────────────────────────────────────────────────────────────────────────────────
Ventas y gastos por mes (barras: ventas con IVA / gastos con IVA; resultado debajo; comentario en el mes)
 abr: «abrimos oficinas» · oct: «pago trimestre, stock 1000 marcos»
──────────────────────────────────────────────────────────────────────────────────
Qué potenciar (productos del periodo, ordenables)
Producto              Uds   Margen contrib.  Margen completo   Aportación real
Lámina clip 15x21     643   11,90 € · 72 %   6,20 € · 37 %     7.650 €   ★ mucho y bueno
Marco cristal A5      …                                          …        ▼ margen completo negativo
Botella móvil         127   sin escandallo                                ⚠ añadir al escandallo
──────────────────────────────────────────────────────────────────────────────────
Escandallo (editable) · Supuestos · Costes fijos · Productos
──────────────────────────────────────────────────────────────────────────────────
Gastos mensuales (editable): mes · gastos · comentario
```

- **Etiquetas en «Qué potenciar»**: «Potenciar» (margen completo ≥ mediana y aportación ≥ mediana), «Revisar
  precio» (margen completo negativo), «Poco volumen» (buen margen, pocas unidades), «Sin escandallo» (vendido en
  Shopify sin producto que lo reconozca), «Incompleto» (falta un dato). Ordenable por cualquier columna; por defecto,
  aportación real.
- Gráfica de aportación real por producto (barras horizontales, los 15 primeros).
- Periodo: año o últimos 12 meses, como Resultados.
- Móvil: tablas con desplazamiento horizontal; la barra inferior pasa a 7 elementos.

## Restricciones

- Mismas que Resultados: Next.js 16 del repo, sin dependencias nuevas, estilo negro/blanco/naranja, formato español,
  `null` = «sin dato», RLS por cliente, datos inventados en demo y tests.
- Reutilizar lo de Resultados: lector CSV (`lib/results/csv.ts`), formato (`lib/results/format.ts`), diálogo de
  importar, selector de periodo y `listMonthly` para las ventas del mes.

## Decidido con Marc

- Enfoque A: pestaña nueva «Rentabilidad».
- Todo editable desde el CRM; vista tipo panel con todo junto.
- Salarios: la Propiedad ve las líneas; el resto, totales.
- Marketing: gasto real de Meta, no 2.000 € fijos; no se reparte por minutos.
- Tinta fija (90 €/mes, en estructura) y merma de tela del 35 %.
- Gastos mensuales con IVA y envíos: se comparan con ventas con IVA.

## Decisiones mías (corregibles)

- Dos márgenes (contribución y completo) y aportación real con ventas netas reales.
- Reconocer productos de Shopify por título + texto de variante.
- Margen calculado aunque falten comisiones o envío, marcado; costes de hoy para todos los periodos; punto de
  equilibrio ponderado por las ventas reales del periodo.
- Etiquetas de «Qué potenciar» por medianas.
- Importar escandallo y costes fijos sustituye la lista entera.


## Queda para quien lo construya

- Componentes de edición (tabla editable o formularios por fila).
- Textos de ayuda y errores.
- Tests: cálculo del coste (cada término, datos que faltan), reconocimiento de variantes, lectura de los CSV (las dos
  mitades de cada fila del export de producto), RLS, y la página en la demo.
