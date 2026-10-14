// =============================================================
// leer-xlsx.js
// Lee un archivo de Excel (.xlsx) SIN instalar paquetes.
//
// Un .xlsx es en realidad un archivo .zip con varios XML adentro:
//   - xl/workbook.xml          -> nombres de las pestañas
//   - xl/_rels/workbook.xml.rels -> en qué archivo está cada pestaña
//   - xl/sharedStrings.xml     -> todos los textos (las celdas guardan solo un número de índice)
//   - xl/worksheets/sheetN.xml -> las celdas de cada pestaña
//
// Este archivo abre el .zip con zlib (viene con Node.js) y lee esos XML.
// Solo lee VALORES (lo que se ve en la celda), no fórmulas ni formatos.
// Las fórmulas sí se leen como su resultado, porque Google Sheets y Excel
// guardan el último valor calculado dentro del archivo.
//
// Uso:
//   const { leerLibro } = require('./leer-xlsx');
//   const libro = leerLibro('privado/contabilidad.xlsx');
//   libro['Banco']        -> lista de filas; cada fila es una lista de valores
//   libro['Banco'][0][0]  -> celda A1
// =============================================================

const fs = require('fs');
const zlib = require('zlib');

// ---------- 1. Abrir el .zip ----------

// Devuelve un objeto { 'ruta/dentro/del/zip': Buffer con el contenido }
function abrirZip(bufferZip) {
  // Al final de todo .zip hay un "índice" (End of Central Directory).
  // Lo buscamos por su firma 0x06054b50, empezando desde el final.
  let fin = -1;
  for (let i = bufferZip.length - 22; i >= 0; i--) {
    if (bufferZip.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin === -1) throw new Error('El archivo no parece un .xlsx válido (no es un zip).');

  const cantidad = bufferZip.readUInt16LE(fin + 10);   // cuántos archivos hay adentro
  let posicion = bufferZip.readUInt32LE(fin + 16);     // dónde empieza la lista de archivos
  const archivos = {};

  for (let n = 0; n < cantidad; n++) {
    if (bufferZip.readUInt32LE(posicion) !== 0x02014b50) throw new Error('Índice del zip dañado.');
    const metodo = bufferZip.readUInt16LE(posicion + 10);           // 0 = sin comprimir, 8 = comprimido
    const tamanoComprimido = bufferZip.readUInt32LE(posicion + 20);
    const largoNombre = bufferZip.readUInt16LE(posicion + 28);
    const largoExtra = bufferZip.readUInt16LE(posicion + 30);
    const largoComentario = bufferZip.readUInt16LE(posicion + 32);
    const inicioLocal = bufferZip.readUInt32LE(posicion + 42);
    const nombre = bufferZip.toString('utf8', posicion + 46, posicion + 46 + largoNombre);

    // Cada archivo tiene además un encabezado "local" antes de sus datos
    const largoNombreLocal = bufferZip.readUInt16LE(inicioLocal + 26);
    const largoExtraLocal = bufferZip.readUInt16LE(inicioLocal + 28);
    const inicioDatos = inicioLocal + 30 + largoNombreLocal + largoExtraLocal;
    const datos = bufferZip.subarray(inicioDatos, inicioDatos + tamanoComprimido);

    if (metodo === 0) archivos[nombre] = datos;
    else if (metodo === 8) archivos[nombre] = zlib.inflateRawSync(datos);
    // otros métodos de compresión no se usan en .xlsx

    posicion += 46 + largoNombre + largoExtra + largoComentario;
  }
  return archivos;
}

// ---------- 2. Ayudas para leer XML ----------

// Convierte &amp; &lt; &#233; etc. en sus caracteres reales
function decodificarXML(texto) {
  return texto
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Lee un atributo de una etiqueta XML: atributo('<sheet name="Banco"/>', 'name') -> 'Banco'
function atributo(etiqueta, nombre) {
  const m = etiqueta.match(new RegExp('\\s' + nombre + '="([^"]*)"'));
  return m ? decodificarXML(m[1]) : null;
}

// "C" -> 2 (columna A = 0)
function columnaANumero(letras) {
  let n = 0;
  for (const letra of letras) n = n * 26 + (letra.charCodeAt(0) - 64);
  return n - 1;
}

// ---------- 3. Leer el libro ----------

function leerLibro(rutaArchivo) {
  const archivos = abrirZip(fs.readFileSync(rutaArchivo));
  const texto = function (ruta) {
    if (!archivos[ruta]) throw new Error('Falta ' + ruta + ' dentro del .xlsx.');
    return archivos[ruta].toString('utf8');
  };

  // Textos compartidos: cada <si> es un texto; puede venir partido en varios <t>
  const textos = [];
  if (archivos['xl/sharedStrings.xml']) {
    const xml = texto('xl/sharedStrings.xml');
    (xml.match(/<si>[\s\S]*?<\/si>/g) || []).forEach(function (si) {
      const partes = si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || [];
      textos.push(partes.map(function (t) { return decodificarXML(t.replace(/<[^>]+>/g, '')); }).join(''));
    });
  }

  // Qué archivo XML corresponde a cada pestaña
  const relaciones = {};
  (texto('xl/_rels/workbook.xml.rels').match(/<Relationship\b[^>]*>/g) || []).forEach(function (r) {
    relaciones[atributo(r, 'Id')] = atributo(r, 'Target');
  });

  const libro = {};
  (texto('xl/workbook.xml').match(/<sheet\b[^>]*>/g) || []).forEach(function (etiqueta) {
    const nombre = atributo(etiqueta, 'name');
    let destino = relaciones[atributo(etiqueta, 'r:id')];
    destino = destino.startsWith('/') ? destino.slice(1) : 'xl/' + destino;
    libro[nombre] = leerPestana(texto(destino), textos);
  });
  return libro;
}

// Convierte el XML de una pestaña en una lista de filas
function leerPestana(xml, textos) {
  const filas = [];
  (xml.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(function (celda) {
    const apertura = celda.match(/<c\b[^>]*>/)[0];
    const referencia = atributo(apertura, 'r');        // ej. "B12"
    if (!referencia) return;
    const partes = referencia.match(/^([A-Z]+)(\d+)$/);
    const columna = columnaANumero(partes[1]);
    const fila = parseInt(partes[2], 10) - 1;
    const tipo = atributo(apertura, 't');               // s = texto compartido, str = texto de fórmula, b = verdadero/falso

    let valor = null;
    const v = celda.match(/<v>([\s\S]*?)<\/v>/);
    if (tipo === 'inlineStr') {
      const t = celda.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      valor = t ? decodificarXML(t[1]) : '';
    } else if (v) {
      if (tipo === 's') valor = textos[parseInt(v[1], 10)];
      else if (tipo === 'str' || tipo === 'e') valor = decodificarXML(v[1]);
      else if (tipo === 'b') valor = v[1] === '1';
      else valor = Number(v[1]);                         // número (las fechas también son números)
    }
    if (valor === null || valor === '') return;

    while (filas.length <= fila) filas.push([]);
    filas[fila][columna] = valor;
  });
  return filas;
}

// En Excel una fecha es un número de días desde el 30/12/1899.
// 45658 -> '2025-01-01'
function numeroAFecha(numero) {
  const ms = Math.round((numero - 25569) * 86400 * 1000); // 25569 = días entre 1899-12-30 y 1970-01-01
  return new Date(ms).toISOString().slice(0, 10);
}

module.exports = { leerLibro: leerLibro, numeroAFecha: numeroAFecha };
