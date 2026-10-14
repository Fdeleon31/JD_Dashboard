# Panel de la junta — Fundación Wonder Panamá

Página privada para la junta directiva: liquidez y caja de la fundación por trimestre.
La página pide una contraseña; los datos se publican **cifrados** y solo se abren en el
navegador de quien tenga la clave.

Los datos salen de la contabilidad de la fundación (Google Sheet **Contabilidad Fundación Wonder Panamá**).

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` + `js/junta.js` | La página: pide la contraseña y muestra el panel. |
| `junta.html` | Dirección anterior del panel; lleva a la página principal. |
| `css/estilos.css` | Colores, tamaños y diseño (primero celular). |
| `data/junta.cifrado.json` | Datos del panel, cifrados. **Lo único que se publica en `data/`.** |
| `importar-excel.js` | Lee la contabilidad (.xlsx en `privado/`) y genera `privado/resumen-junta.json`. |
| `leer-xlsx.js` | Lee archivos .xlsx sin instalar paquetes (lo usa `importar-excel.js`). |
| `cifrar-junta.js` | Cifra el resumen con la contraseña de la junta → `data/junta.cifrado.json`. |
| `validar.js` | Revisa que todo esté listo antes de publicar. |
| `servidor.js` | Servidor local para ver la página en tu computadora. |
| `privado/` | Contabilidad original y resumen sin cifrar. **Nunca se publica.** |

No hay que instalar paquetes: solo hace falta **Node.js**.

## Ver la página en tu computadora

```
node servidor.js
```

Abre http://localhost:8000. Para detenerlo: `Ctrl + C`.

## Actualizar cada trimestre

1. En el Google Sheet, agrega los movimientos nuevos del banco, clasifícalos y revisa que los
   controles estén en cero (Flujo_Caja, Balanza y Resultados) y que no haya nada "Por aclarar".
2. **Archivo → Descargar → Microsoft Excel (.xlsx)**.
3. Pon el archivo en `privado/` y borra el anterior (debe haber **un solo** .xlsx ahí).
4. Ejecuta:

   ```
   node importar-excel.js
   node cifrar-junta.js
   node validar.js
   ```

   El primero revisa los controles del Sheet y prepara los datos; si algo no cuadra, se detiene.
   El segundo pide la contraseña de la junta (usa la misma de siempre). El tercero debe terminar
   con **TODO CORRECTO**.
5. Revisa con `node servidor.js`. En GitHub Desktop confirma que no aparezca nada de `privado/`,
   haz commit ("Actualización corte DD/MM/AAAA") y **Push**.

## Contraseña

- No se guarda en ningún archivo. Si la olvidas, corre `node cifrar-junta.js` con una nueva y publica.
- Si alguien sale de la junta, cámbiala de la misma forma y compártela con los demás.
- Comparte el enlace y la contraseña por canales distintos.

## Publicación

GitHub Pages: https://fdeleon31.github.io/JD_Dashboard/
