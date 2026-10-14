# Proyecto: Portal de Transparencia para ONGs

> **Estado actual (oct 2026):** el portal público para donantes se retiró. Lo publicado es solo
> el **panel privado de la junta** (index.html, con contraseña y datos cifrados). La versión pública
> quedó en el historial de git por si se retoma. Flujo vigente: ver README.md.

## Qué es
Una página web pública donde una ONG muestra a sus donantes, de forma clara y verificable, cuánto dinero recibió, en qué lo gastó y qué impacto logró. El primer cliente y caso de prueba es **Fundación Wonder Panamá**.

## Problema que resuelve
Las ONGs pequeñas en Panamá pierden donantes y credibilidad porque no pueden mostrar fácilmente el uso de los fondos. Sus reportes financieros (libro diario, mayor, estado de resultados) no son entendibles para un donante común.

## Usuario objetivo
- **Donante / público general:** quiere saber, en 1 minuto, si su dinero se usó bien.
- **Director de finanzas de la ONG (yo):** quiere publicar esa información sin rehacer su contabilidad.

## Fase 1 — MVP (lo único que construimos primero)
Una página estática que lee un archivo de datos (CSV exportado de la contabilidad) y muestra:

1. **Resumen del período:** total de ingresos, total de gastos y saldo.
2. **De dónde viene el dinero:** ingresos por fuente (donaciones individuales, empresas, eventos, otros).
3. **A dónde va el dinero:** gastos por programa vs. gastos administrativos, con porcentaje de cada uno.
4. **Indicadores de impacto:** 3 a 5 métricas sencillas por programa (ej. beneficiarios atendidos, eventos realizados).
5. **Nota metodológica:** período cubierto, fecha de corte y quién preparó la información.

Fuera de alcance en la Fase 1: login, panel de administración, base de datos, múltiples ONGs, pagos o donaciones en línea.

## Datos de entrada
Archivo `data/movimientos.csv` con estas columnas:

| columna     | ejemplo               | descripción                                         |
|-------------|-----------------------|-----------------------------------------------------|
| fecha       | 2026-03-15            | Formato AAAA-MM-DD                                  |
| tipo        | ingreso / gasto       | Naturaleza del movimiento                           |
| categoria   | Donaciones empresas   | Fuente del ingreso o tipo de gasto                  |
| programa    | Programa educativo    | Programa al que se asigna (o "Administración")      |
| descripcion | Compra de materiales  | Texto corto                                         |
| monto       | 250.00                | Siempre positivo, en USD (B/.)                      |

Archivo `data/impacto.json` con las métricas de impacto por programa.

Mientras no haya datos reales, usar **datos ficticios de ejemplo** claramente marcados como tales.

## Stack técnico
- HTML + CSS + JavaScript sencillo (o Vite si hace falta), sin backend.
- Gráficos con Chart.js.
- Publicación gratuita en GitHub Pages o Vercel.
- Debe verse bien en el celular (la mayoría de donantes lo abrirá ahí).

## Principios
- Claridad antes que diseño complejo: un donante sin conocimientos contables debe entenderlo.
- Los totales de la página deben cuadrar exactamente con el CSV (validar sumas).
- Nunca publicar datos personales de donantes ni beneficiarios.
- Código simple y comentado en español: estoy aprendiendo.

## Fases siguientes (más adelante)
- Fase 2: panel privado para subir el CSV sin tocar código.
- Fase 3: soporte para varias ONGs, cada una con su propia página.
- Fase 4: comparación entre períodos y descarga del reporte en PDF.
