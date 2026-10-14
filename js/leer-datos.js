// =============================================================
// leer-datos.js
// Carga los archivos de la carpeta data/ y convierte el CSV en
// una lista de movimientos. También revisa que cada fila sea válida.
// =============================================================

// Columnas que debe tener el CSV (ver CLAUDE.md)
const COLUMNAS_REQUERIDAS = ['fecha', 'tipo', 'categoria', 'programa', 'descripcion', 'monto'];

// Descarga un archivo de texto. Si falla, lanza un error con un mensaje claro.
async function descargarTexto(ruta) {
  const respuesta = await fetch(ruta, { cache: 'no-store' });
  if (!respuesta.ok) {
    throw new Error('No se pudo cargar ' + ruta + ' (código ' + respuesta.status + ').');
  }
  return respuesta.text();
}

// Descarga un archivo JSON y lo convierte en objeto.
async function descargarJSON(ruta) {
  const texto = await descargarTexto(ruta);
  try {
    return JSON.parse(texto);
  } catch (e) {
    throw new Error('El archivo ' + ruta + ' no es un JSON válido: ' + e.message);
  }
}

// Divide UNA línea del CSV en columnas.
// Respeta comillas: "Compra de sillas, mesas" se queda como un solo campo.
function dividirLineaCSV(linea, separador) {
  const campos = [];
  let actual = '';
  let dentroDeComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      // Dos comillas seguidas ("") dentro de un campo significan una comilla literal
      if (dentroDeComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        dentroDeComillas = !dentroDeComillas;
      }
    } else if (c === separador && !dentroDeComillas) {
      campos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos.map(function (campo) { return campo.trim(); });
}

// Convierte el texto completo del CSV en una lista de movimientos.
// Devuelve { movimientos: [...], errores: [...] }.
// Cada movimiento guarda el monto en CENTAVOS (número entero) para que
// las sumas sean exactas (0.1 + 0.2 en JavaScript no da 0.3 exacto).
function leerMovimientosCSV(texto) {
  // Quitamos el BOM que a veces agrega Excel y separamos por líneas
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
  const errores = [];

  if (lineas.length === 0) {
    return { movimientos: [], errores: ['El archivo movimientos.csv está vacío.'] };
  }

  // Excel en algunos países exporta con punto y coma (;) en vez de coma
  const separador = lineas[0].includes(';') ? ';' : ',';
  const encabezados = dividirLineaCSV(lineas[0], separador).map(function (h) { return h.toLowerCase(); });

  const faltantes = COLUMNAS_REQUERIDAS.filter(function (col) { return !encabezados.includes(col); });
  if (faltantes.length > 0) {
    return { movimientos: [], errores: ['Faltan columnas en el CSV: ' + faltantes.join(', ')] };
  }

  const movimientos = [];
  for (let i = 1; i < lineas.length; i++) {
    const numeroLinea = i + 1; // como se ve en Excel (la línea 1 es el encabezado)
    const valores = dividirLineaCSV(lineas[i], separador);

    // Armamos un objeto { fecha: ..., tipo: ..., ... } usando los encabezados
    const fila = {};
    encabezados.forEach(function (nombre, posicion) { fila[nombre] = valores[posicion] || ''; });

    // --- Validaciones de la fila ---
    const problemas = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha)) problemas.push('fecha "' + fila.fecha + '" no tiene formato AAAA-MM-DD');
    const tipo = fila.tipo.toLowerCase();
    if (tipo !== 'ingreso' && tipo !== 'gasto') problemas.push('tipo "' + fila.tipo + '" debe ser ingreso o gasto');
    if (!/^\d+(\.\d{1,2})?$/.test(fila.monto)) problemas.push('monto "' + fila.monto + '" debe ser un número positivo con punto decimal (ej. 250.00)');
    if (fila.categoria === '') problemas.push('categoría vacía');
    if (tipo === 'gasto' && fila.programa === '') problemas.push('un gasto debe indicar su programa (o "Administración")');

    if (problemas.length > 0) {
      errores.push('Línea ' + numeroLinea + ': ' + problemas.join('; '));
      continue; // no usamos filas con errores, pero sí las reportamos
    }

    movimientos.push({
      fecha: fila.fecha,
      tipo: tipo,
      categoria: fila.categoria,
      programa: fila.programa,
      descripcion: fila.descripcion,
      centavos: aCentavos(fila.monto)
    });
  }

  return { movimientos: movimientos, errores: errores };
}

// "1675.56" -> 167556 (sin pasar por decimales, para no perder precisión)
function aCentavos(textoMonto) {
  const partes = textoMonto.split('.');
  const enteros = parseInt(partes[0], 10);
  const decimales = parseInt(((partes[1] || '') + '00').slice(0, 2), 10);
  return enteros * 100 + decimales;
}

// Carga los tres archivos de datos a la vez.
async function cargarTodosLosDatos() {
  const [info, impacto, textoCSV] = await Promise.all([
    descargarJSON('data/info.json'),
    descargarJSON('data/impacto.json'),
    descargarTexto('data/movimientos.csv')
  ]);
  const csv = leerMovimientosCSV(textoCSV);
  return { info: info, impacto: impacto, movimientos: csv.movimientos, erroresCSV: csv.errores };
}
