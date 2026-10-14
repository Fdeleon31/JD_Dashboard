// =============================================================
// validar.js
// Revisa los datos ANTES de publicar, desde la terminal.
// Usa exactamente las mismas funciones que la página
// (js/leer-datos.js y js/calculos.js), así que si aquí cuadra,
// en la página también.
//
// Uso:  node validar.js
// Termina con "TODO CORRECTO" o con la lista de problemas.
// =============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = __dirname;
const leer = function (ruta) { return fs.readFileSync(path.join(RAIZ, ruta), 'utf8'); };

// Cargamos los dos archivos de la página en un "entorno" aparte,
// como si fuera el navegador, para poder usar sus funciones.
const entorno = vm.createContext({});
vm.runInContext(leer('js/leer-datos.js'), entorno, { filename: 'js/leer-datos.js' });
vm.runInContext(leer('js/calculos.js'), entorno, { filename: 'js/calculos.js' });

const problemas = [];
const formato = function (centavos) {
  return 'B/. ' + (centavos / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 1. Archivos JSON
let info, impacto;
try { info = JSON.parse(leer('data/info.json')); } catch (e) { problemas.push('data/info.json: ' + e.message); }
try { impacto = JSON.parse(leer('data/impacto.json')); } catch (e) { problemas.push('data/impacto.json: ' + e.message); }

// 2. Filas del CSV
const csv = entorno.leerMovimientosCSV(leer('data/movimientos.csv'));
csv.errores.forEach(function (e) { problemas.push('movimientos.csv ' + e); });
console.log('Movimientos válidos en el CSV: ' + csv.movimientos.length);

// 3. Totales y cuadre por cada período publicado
if (info) {
  console.log('');
  info.periodos.forEach(function (periodo) {
    const r = entorno.calcularResumen(csv.movimientos, periodo);
    console.log('== ' + periodo.nombre + ' (' + r.cantidadMovimientos + ' movimientos) ==');
    console.log('   Ingresos:        ' + formato(r.totalIngresos));
    console.log('   Gastos:          ' + formato(r.totalGastos));
    console.log('   Saldo:           ' + formato(r.saldo));
    console.log('   Programas:       ' + r.porcentajeProgramas.toFixed(1) + '%   Administración: ' + r.porcentajeAdministracion.toFixed(1) + '%');
    r.verificaciones.forEach(function (v) {
      console.log('   ' + (v.cuadra ? '✓' : '✗') + ' ' + v.descripcion);
      if (!v.cuadra) problemas.push(periodo.nombre + ': ' + v.descripcion + ' (esperado ' + formato(v.esperado) + ', obtenido ' + formato(v.obtenido) + ')');
    });
    if (r.cantidadMovimientos === 0) problemas.push(periodo.nombre + ': no tiene ningún movimiento.');
  });

  // Movimientos que no caen en ningún período
  const fuera = csv.movimientos.filter(function (m) {
    return !info.periodos.some(function (p) { return m.fecha >= p.desde && m.fecha <= p.hasta; });
  });
  if (fuera.length > 0) problemas.push(fuera.length + ' movimiento(s) con fecha fuera de los períodos de info.json.');
}

// 4. Impacto: cada programa con gastos debería tener métricas (y viceversa)
if (impacto) {
  const programasCSV = new Set(csv.movimientos
    .filter(function (m) { return m.tipo === 'gasto' && m.programa !== 'Administración'; })
    .map(function (m) { return m.programa; }));
  const programasImpacto = new Set(impacto.programas.map(function (p) { return p.programa; }));
  programasCSV.forEach(function (p) { if (!programasImpacto.has(p)) problemas.push('El programa "' + p + '" tiene gastos pero no tiene métricas en impacto.json.'); });
  programasImpacto.forEach(function (p) { if (!programasCSV.has(p)) problemas.push('El programa "' + p + '" está en impacto.json pero no tiene gastos en el CSV.'); });
}

// 5. Panel de la junta: el archivo cifrado debe tener la misma fecha de corte que el portal
const rutaJunta = path.join(RAIZ, 'data', 'junta.cifrado.json');
if (!fs.existsSync(rutaJunta)) {
  console.log('\nAviso: todavía no existe data/junta.cifrado.json (corre: node cifrar-junta.js).');
} else if (info) {
  const junta = JSON.parse(fs.readFileSync(rutaJunta, 'utf8'));
  if (junta.fecha_corte !== info.fecha_corte) {
    problemas.push('El panel de la junta tiene corte ' + junta.fecha_corte + ' y el portal ' + info.fecha_corte + '. Corre: node cifrar-junta.js');
  } else {
    console.log('\n✓ Panel de la junta al día (corte ' + junta.fecha_corte + ').');
  }
}

// 6. Resultado final
console.log('');
if (problemas.length === 0) {
  console.log('TODO CORRECTO: los datos están listos para publicar.');
} else {
  console.log('SE ENCONTRARON ' + problemas.length + ' PROBLEMA(S):');
  problemas.forEach(function (p) { console.log(' - ' + p); });
  process.exitCode = 1; // código de error, útil si algún día se automatiza
}
