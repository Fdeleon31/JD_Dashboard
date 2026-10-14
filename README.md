# Portal de Transparencia — Fundación Wonder Panamá

Página web pública que muestra a los donantes cuánto dinero recibió la fundación,
en qué lo gastó y qué impacto logró.

Los datos publicados son **reales**: salen de la contabilidad de la fundación (Google Sheet) y se publican como **totales anuales**.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página que ven los donantes. |
| `css/estilos.css` | Colores, tamaños y diseño (primero celular). |
| `js/leer-datos.js` | Lee el CSV y los JSON; revisa que cada fila sea válida. |
| `js/calculos.js` | Totales, porcentajes y verificación de que todo cuadra. |
| `js/app.js` | Llena la página y dibuja los gráficos. |
| `data/movimientos.csv` | Movimientos contables (ingresos y gastos). |
| `data/impacto.json` | Métricas de impacto por programa y por año. |
| `data/info.json` | Nombre, períodos, fecha de corte, quién preparó, notas. |
| `servidor.js` | Servidor local para ver la página en tu computadora. |
| `validar.js` | Revisa los datos desde la terminal antes de publicar. |
| `importar-excel.js` | Convierte la contabilidad (.xlsx en `privado/`) en `data/movimientos.csv` y `data/info.json`. |
| `leer-xlsx.js` | Lee archivos .xlsx sin instalar paquetes (lo usa `importar-excel.js`). |
| `junta.html` + `js/junta.js` | Panel privado de la junta (liquidez y caja). Pide contraseña. |
| `cifrar-junta.js` | Cifra los datos de la junta con una contraseña → `data/junta.cifrado.json`. |
| `privado/` | Contabilidad original y resumen para la junta. **Nunca se publica.** |

No hay que instalar paquetes: solo hace falta **Node.js**.

## Ver la página en tu computadora

```
node servidor.js
```

Abre http://localhost:8000. Para detenerlo: `Ctrl + C`.

(Si abres `index.html` con doble clic, el navegador no deja leer los datos.)

## Actualizar los datos (cada trimestre)

1. En el Google Sheet **Contabilidad Fundación Wonder Panamá**, revisa que los controles estén en cero
   (Flujo_Caja, Balanza y Resultados) y que no haya movimientos "Por aclarar".
2. **Archivo → Descargar → Microsoft Excel (.xlsx)**.
3. Pon el archivo en la carpeta `privado/` y borra el anterior (debe haber **un solo** .xlsx ahí).
4. Ejecuta:

   ```
   node importar-excel.js
   node cifrar-junta.js
   node validar.js
   ```

   El primero revisa los controles del Sheet y genera los datos; si algo no cuadra, se detiene
   y no cambia nada. El segundo te pide la contraseña de la junta y cifra su panel.
   El tercero debe terminar con **TODO CORRECTO**.
5. Revisa la página con `node servidor.js` y publica.

Qué se publica y qué no:
- **Público** (`data/`): totales anuales por fuente de ingreso y por programa. Sin nombres ni movimientos individuales.
- **Junta** (`junta.html`): liquidez por trimestre (banco + caja chica). Se publica **cifrado** en `data/junta.cifrado.json`;
  sin la contraseña no se puede leer. La versión sin cifrar queda en `privado/resumen-junta.json`.
- Para cambiar la contraseña de la junta (por ejemplo, si alguien sale), corre `node cifrar-junta.js` de nuevo y publica.
- `importar-excel.js` nunca lee las columnas con nombres de personas (Descripción del banco y Nota).
- Las métricas de impacto se editan a mano en `data/impacto.json`.

## Publicar gratis en GitHub Pages

1. Crea un repositorio en GitHub y sube todos los archivos.
2. En el repositorio: **Settings → Pages → Branch: main → Save**.
3. En un par de minutos la página estará en `https://<tu-usuario>.github.io/<repositorio>/`.
