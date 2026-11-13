# Proyecto: Panel de la junta directiva — Fundación Wonder Panamá

## Qué es
Una página privada donde la junta directiva de Fundación Wonder Panamá ve la **liquidez** de la
fundación: cuánto dinero hay disponible, para cuántos meses alcanza y cómo cambió por trimestre.
Se publica en GitHub Pages (repo `JD_Dashboard`, carpeta `docs/`).

El objetivo es que la junta entienda las cifras **sin depender de la Dirección de Finanzas**:
el panel saca sus propias conclusiones a partir de los datos y las explica en lenguaje sencillo.

Historia: el proyecto empezó como un portal público de transparencia para donantes. Ese portal
se retiró (queda en el historial de git). Hoy solo existe el panel de la junta.

## Usuarios
- **Junta directiva:** no son contadores. Abren el panel en el celular o en una reunión.
- **Director de finanzas (yo):** actualiza los datos cada trimestre desde su computadora.

## Estructura
```
docs/           Lo ÚNICO que se publica: index.html, css/, js/, fonts/, data/junta.cifrado.json
herramientas/   Programas de Node.js que preparan los datos (corren solo en mi computadora)
privado/        Contabilidad original (.xlsx) y resumen sin cifrar. NUNCA se publica (.gitignore)
```

## Flujo de datos
Google Sheet de contabilidad → descarga .xlsx en `privado/` → `node herramientas/actualizar.js`
(importar → cifrar → validar) → `git push`. Detalle paso a paso en README.md.

- `importar-excel.js` revisa seis controles del Sheet (deben estar en cero) y genera
  `privado/resumen-junta.json`.
- `cifrar-junta.js` cifra ese resumen con la contraseña de la junta (PBKDF2 + AES-256-GCM)
  y escribe `docs/data/junta.cifrado.json`.
- `docs/js/junta.js` descifra en el navegador e interpreta los datos: estado de la reserva,
  frases, regla de meses, gráfico y tabla.

## Reglas que no se rompen
- **Nada privado en `docs/`.** Ahí solo va el archivo cifrado. Nunca Excel, CSV ni JSON sin cifrar.
- **Nunca leer ni publicar datos personales:** las columnas "Descripción del banco" y "Nota"
  del Sheet tienen nombres de personas y no se leen.
- **Las cifras del panel deben cuadrar con la contabilidad.** Si un control no está en cero,
  no se publica. Al cambiar el importador, comprobar que el resumen sale igual.
- **El formato de `resumen-junta.json` y del archivo cifrado no cambia sin avisar:** el archivo
  ya publicado debe seguir abriéndose con la misma contraseña.
- **Sin servicios externos en la página.** Tipografía, gráfico y código viven en `docs/`.
  La página tiene una política de seguridad (CSP) que bloquea todo lo que no sea del propio sitio.
- **Sin paquetes de npm.** Solo Node.js, para que cualquiera pueda correrlo.
- **La contraseña nunca se escribe en un archivo ni en un comando.**

## Cómo trabajar en este proyecto
- Código simple y comentado en español: estoy aprendiendo.
- Textos del panel en lenguaje llano, sin jerga contable; cada cifra dice qué significa.
- Primero celular. Debe funcionar en modo claro, modo oscuro e impresión.
- El estado nunca se comunica solo con color: siempre lleva ícono y texto.
- Git solo por consola (línea de comandos), nunca GitHub Desktop.
- Ver la página: `node herramientas/servidor.js` → http://localhost:8000

## Criterios de la junta
Están al inicio de `docs/js/junta.js`: meta de reserva (3 meses de salidas), mínimo crítico
(1 mes) y días de gracia para avisar que faltan datos (45). Cambiarlos ahí cambia todo el panel.

## Pendiente
- Lectura automática del Google Sheet con una cuenta de servicio de solo lectura
  (reemplaza la descarga manual del .xlsx).
- Opcional, a decidir: actualización programada sin intervención.
