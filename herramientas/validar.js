// =============================================================
// validar.js
// Revisa, ANTES de publicar, que el panel de la junta esté listo.
//
// Uso:  node herramientas/validar.js
// Termina con "TODO CORRECTO" o con la lista de problemas.
// =============================================================

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..'); // la carpeta del proyecto
const problemas = [];

const rutaResumen = path.join(RAIZ, 'privado', 'resumen-junta.json');
const rutaCifrado = path.join(RAIZ, 'docs', 'data', 'junta.cifrado.json');

// 1. Datos de la junta generados por importar-excel.js
let resumen = null;
if (!fs.existsSync(rutaResumen)) {
  problemas.push('No existe privado/resumen-junta.json. Corre: node herramientas/importar-excel.js');
} else {
  resumen = JSON.parse(fs.readFileSync(rutaResumen, 'utf8'));
  const l = resumen.liquidez;
  console.log('Corte:            ' + resumen.fecha_corte);
  console.log('Total disponible: B/. ' + l.total + '  (banco ' + l.banco + ' + caja chica ' + l.caja_chica + ')');
  console.log('Trimestres:       ' + resumen.trimestres.length);

  // La liquidez total debe ser banco + caja chica, y la del último trimestre igual al total
  const suma = Math.round(Number(l.banco) * 100) + Math.round(Number(l.caja_chica) * 100);
  if (suma !== Math.round(Number(l.total) * 100)) problemas.push('Banco + caja chica no es igual al total disponible.');
  const ultimo = resumen.trimestres[resumen.trimestres.length - 1];
  if (!ultimo || ultimo.liquidez_total !== l.total) problemas.push('El último trimestre no coincide con el total disponible.');
}

// 2. Archivo cifrado que se publica: debe existir y estar al día
if (!fs.existsSync(rutaCifrado)) {
  problemas.push('No existe docs/data/junta.cifrado.json. Corre: node herramientas/cifrar-junta.js');
} else if (resumen) {
  const cifrado = JSON.parse(fs.readFileSync(rutaCifrado, 'utf8'));
  if (cifrado.fecha_corte !== resumen.fecha_corte) {
    problemas.push('El panel publicado tiene corte ' + cifrado.fecha_corte + ' y los datos nuevos ' + resumen.fecha_corte + '. Corre: node herramientas/cifrar-junta.js');
  } else {
    console.log('✓ Panel cifrado al día.');
  }
}

// 3. Nada privado dentro de docs/, que es la carpeta que se publica.
//    En docs/data/ solo puede estar el archivo cifrado, y en todo docs/
//    no puede haber Excel, CSV ni otros JSON.
function recorrer(carpeta) {
  fs.readdirSync(carpeta, { withFileTypes: true }).forEach(function (entrada) {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) return recorrer(ruta);
    const relativa = path.relative(RAIZ, ruta).split(path.sep).join('/');
    const extension = path.extname(entrada.name).toLowerCase();
    const esDato = ['.xlsx', '.xls', '.csv', '.json'].includes(extension);
    if (esDato && relativa !== 'docs/data/junta.cifrado.json') {
      problemas.push(relativa + ' se publicaría. Bórralo o muévelo a privado/.');
    }
  });
}
recorrer(path.join(RAIZ, 'docs'));

console.log('');
if (problemas.length === 0) {
  console.log('TODO CORRECTO: listo para publicar.');
} else {
  console.log('SE ENCONTRARON ' + problemas.length + ' PROBLEMA(S):');
  problemas.forEach(function (p) { console.log(' - ' + p); });
  process.exitCode = 1;
}
