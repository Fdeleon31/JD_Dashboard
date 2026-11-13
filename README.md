# Panel de la junta directiva — Fundación Wonder Panamá

Página privada para la junta directiva: cuánto dinero tiene disponible la fundación,
para cuántos meses alcanza y cómo ha cambiado por trimestre.

La página pide una contraseña. Los datos se publican **cifrados** y solo se abren en el
navegador de quien tenga la clave. Salen de la contabilidad de la fundación
(Google Sheet **Contabilidad Fundación Wonder Panamá**).

Publicación: https://fdeleon31.github.io/JD_Dashboard/ (GitHub Pages, carpeta `docs/`).

## Cómo está organizado

| Carpeta | Qué contiene | ¿Se publica? |
|---|---|---|
| `docs/` | La página: `index.html`, `css/`, `js/`, `fonts/` y `data/junta.cifrado.json`. | **Sí. Es lo único.** |
| `herramientas/` | Los programas que preparan los datos. Corren solo en tu computadora. | No se sirve en la página. |
| `privado/` | La contabilidad original y el resumen sin cifrar. | **Nunca** (está en `.gitignore`). |

Herramientas:

| Archivo | Para qué sirve |
|---|---|
| `actualizar.js` | Un solo comando: importa, cifra y valida. |
| `importar-excel.js` | Lee la contabilidad (.xlsx en `privado/`) y genera `privado/resumen-junta.json`. |
| `leer-xlsx.js` | Lee archivos .xlsx sin instalar paquetes. |
| `cifrar-junta.js` | Cifra el resumen con la contraseña de la junta. |
| `validar.js` | Revisa que todo esté listo antes de publicar. |
| `servidor.js` | Servidor local para ver la página en tu computadora. |

No hay que instalar paquetes: solo hace falta **Node.js**. La página tampoco usa servicios
externos (la tipografía y el gráfico están dentro de `docs/`).

## Ver la página en tu computadora

```
node herramientas/servidor.js
```

Abre http://localhost:8000. Para detenerlo: `Ctrl + C`.

## Actualizar cada trimestre

1. En el Google Sheet, agrega los movimientos nuevos del banco, clasifícalos y revisa que los
   controles estén en cero (Flujo_Caja, Balanza y Resultados) y que no haya nada "Por aclarar".
2. **Archivo → Descargar → Microsoft Excel (.xlsx)**.
3. Pon el archivo en `privado/` y borra el anterior (debe haber **un solo** .xlsx ahí).
4. Ejecuta:

   ```
   node herramientas/actualizar.js
   ```

   Revisa los controles del Sheet, pide la contraseña de la junta (la misma de siempre) y
   debe terminar con **TODO CORRECTO**. Si algo no cuadra, se detiene y dice qué corregir.
5. Revisa el panel con `node herramientas/servidor.js`.
6. Publica desde la consola:

   ```
   git status
   git add docs/data/junta.cifrado.json
   git commit -m "Actualización corte DD/MM/AAAA"
   git push
   ```

   En `git status` no debe aparecer nada de `privado/`.

## Qué le dice el panel a la junta

Todo se calcula solo a partir de los datos; no hay textos que escribir cada trimestre.

- **Estado de la reserva:** saludable, por debajo de la meta o crítica.
- **Para cuántos meses alcanza** el dinero disponible y cuánto falta para la meta.
- **Qué cambió** en el último trimestre frente al anterior.
- **Aviso automático** si pasan 45 días del cierre de un trimestre sin datos nuevos.
- Botón para **imprimir o guardar en PDF** (para el acta de la reunión).

Los criterios están al inicio de `docs/js/junta.js` y la junta puede cambiarlos:

| Criterio | Valor | Significado |
|---|---|---|
| `META_MESES` | 3 | Meta de reserva: meses de salidas que debería cubrir el dinero disponible. |
| `MINIMO_MESES` | 1 | Por debajo de esto, la reserva se marca como crítica. |
| `DIAS_DE_GRACIA` | 45 | Días tras un cierre de trimestre antes de avisar que faltan datos. |

## Contraseña

- No se guarda en ningún archivo. Si la olvidas, corre `node herramientas/cifrar-junta.js`
  con una nueva y publica.
- Si alguien sale de la junta, cámbiala de la misma forma y compártela con los demás.
- Comparte el enlace y la contraseña por canales distintos.
- El repositorio es público: cualquiera puede descargar el archivo cifrado. Lo único que
  protege los datos es que la contraseña sea larga y no se pueda adivinar.

## Pendiente

- Lectura automática del Google Sheet (hoy la descarga del .xlsx es manual).
