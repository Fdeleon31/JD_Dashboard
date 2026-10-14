// =============================================================
// importar-excel.js
// Convierte la contabilidad (Google Sheet descargado como .xlsx)
// en los datos del panel de la junta.
//
// Lee:      privado/*.xlsx   (el único Excel que haya en la carpeta privado)
// Escribe:  privado/resumen-junta.json  -> PRIVADO: liquidez trimestral para la junta.
//           No se publica: cifrar-junta.js lo cifra para el panel.
//
// Uso:  node importar-excel.js
//       node importar-excel.js privado/otro-archivo.xlsx   (si quieres indicar el archivo)
// Después: node cifrar-junta.js   y luego   node validar.js
//
// Antes de generar nada revisa que los controles del Sheet estén en cero.
// Nunca lee las columnas "Descripción del banco" ni "Nota" (tienen nombres de personas).
// =============================================================

const fs = require('fs');
const path = require('path');
const { leerLibro, numeroAFecha } = require('./leer-xlsx');

const RAIZ = __dirname;

// ---------- Cómo se traduce la contabilidad al portal ----------

// Categoría del Plan_Cuentas  ->  nombre de la fuente de ingreso en el portal
// (deben coincidir con ORDEN_FUENTES de js/calculos.js)
const FUENTES_DE_INGRESO = {
  'Donaciones de personas': 'Donaciones individuales',
  'Donaciones de empresas': 'Donaciones empresas',
  'Eventos': 'Eventos',
  'Otros ingresos': 'Otros'
};

// Programa de la contabilidad que NO es un programa: sus gastos van a "Administración"
const PROGRAMA_GENERAL = 'General';
const NOMBRE_ADMINISTRACION = 'Administración';

// ---------- 1. Encontrar y leer el Excel ----------

function buscarExcel() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const carpeta = path.join(RAIZ, 'privado');
  const encontrados = fs.readdirSync(carpeta).filter(function (n) {
    return n.toLowerCase().endsWith('.xlsx') && !n.startsWith('~$'); // ~$ = archivo temporal de Excel abierto
  });
  if (encontrados.length === 0) detener('No hay ningún .xlsx en la carpeta privado/.');
  if (encontrados.length > 1) detener('Hay ' + encontrados.length + ' archivos .xlsx en privado/ (' + encontrados.join(', ') + '). Deja solo uno o indica cuál: node importar-excel.js privado/<archivo>.xlsx');
  return path.join(carpeta, encontrados[0]);
}

function detener(mensaje) {
  console.error('\nNO SE IMPORTÓ NADA: ' + mensaje + '\n');
  process.exit(1);
}

// Convierte una pestaña en una lista de objetos usando la fila 1 como encabezados.
// Solo copia las columnas pedidas, así nunca tocamos columnas con datos personales.
function tablaConEncabezados(filas, columnasQueSeUsan, nombrePestana) {
  const encabezados = filas[0] || [];
  const posiciones = {};
  columnasQueSeUsan.forEach(function (col) {
    const i = encabezados.indexOf(col);
    if (i === -1) detener('La pestaña ' + nombrePestana + ' no tiene la columna "' + col + '". ¿Se cambió el nombre en el Sheet?');
    posiciones[col] = i;
  });
  return filas.slice(1)
    .filter(function (fila) { return fila && fila[0] !== undefined; }) // sin filas vacías
    .map(function (fila) {
      const objeto = {};
      columnasQueSeUsan.forEach(function (col) { objeto[col] = fila[posiciones[col]]; });
      return objeto;
    });
}

// Lee una celda por su dirección, ej. celda(libro, 'Flujo_Caja', 'B13')
function celda(libro, pestana, direccion) {
  const m = direccion.match(/^([A-Z]+)(\d+)$/);
  let columna = 0;
  for (const letra of m[1]) columna = columna * 26 + (letra.charCodeAt(0) - 64);
  const fila = (libro[pestana] || [])[parseInt(m[2], 10) - 1] || [];
  return fila[columna - 1];
}

// Montos siempre en centavos enteros (igual que js/calculos.js)
const aCentavos = function (n) { return Math.round((Number(n) || 0) * 100); };
const aTexto = function (centavos) { return (centavos / 100).toFixed(2); };
const formato = function (centavos) {
  return 'B/. ' + (centavos / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ---------- 2. Programa principal ----------

const archivo = buscarExcel();
console.log('Leyendo ' + path.relative(RAIZ, archivo));
const libro = leerLibro(archivo);

['Config', 'Plan_Cuentas', 'Banco', 'Diario', 'Balanza', 'Resultados', 'Flujo_Caja'].forEach(function (p) {
  if (!libro[p]) detener('Falta la pestaña ' + p + '.');
});

// 2a. Controles del Sheet: deben estar en cero antes de publicar
const controles = [
  ['Diferencia entre el libro y el banco (Flujo_Caja B13)', celda(libro, 'Flujo_Caja', 'B13')],
  ['Movimientos "Por aclarar" (Flujo_Caja B14)', celda(libro, 'Flujo_Caja', 'B14')],
  ['Debe menos haber (Balanza E3)', celda(libro, 'Balanza', 'E3')],
  ['Suma de saldos (Balanza G3)', celda(libro, 'Balanza', 'G3')],
  ['Ingresos fuera de categoría (Resultados G22)', celda(libro, 'Resultados', 'G22')],
  ['Gastos fuera de categoría (Resultados G23)', celda(libro, 'Resultados', 'G23')]
];
console.log('\nControles del Sheet:');
let controlesMal = 0;
controles.forEach(function (c) {
  const ok = Math.abs(Number(c[1]) || 0) < 0.005;
  if (!ok) controlesMal++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + c[0] + ': ' + (c[1] === undefined ? '(vacío)' : c[1]));
});
if (controlesMal > 0) detener(controlesMal + ' control(es) no están en cero. Corrige el Sheet y vuelve a descargarlo.');

// 2b. Plan de cuentas: qué se publica y en qué categoría cae cada cuenta
const plan = {};
tablaConEncabezados(libro.Plan_Cuentas, ['Código', 'Nombre', 'Tipo', 'Categoría', 'Publicar'], 'Plan_Cuentas')
  .forEach(function (c) { plan[Math.round(c['Código'])] = c; });

// 2c. Movimientos de resultados (ingresos y gastos) de Banco y Diario.
//     NO se leen "Descripción del banco" ni "Nota".
const banco = tablaConEncabezados(libro.Banco,
  ['Fecha', 'Cuenta', 'Programa', 'Estado', 'Tipo', 'Monto en resultados'], 'Banco');
const diario = tablaConEncabezados(libro.Diario,
  ['Fecha', 'Cuenta', 'Programa', 'Tipo', 'Monto en resultados'], 'Diario');

const porRevisar = banco.filter(function (m) { return m.Estado === 'Propuesta'; }).length;
const porAclarar = banco.filter(function (m) { return m.Estado === 'Por aclarar'; }).length;
if (porAclarar > 0) detener(porAclarar + ' movimiento(s) en estado "Por aclarar".');

const movimientos = [];
banco.concat(diario).forEach(function (m) {
  if (m.Tipo !== 'Ingreso' && m.Tipo !== 'Gasto') return; // banco, caja, pasivos: no son resultados
  const codigo = Math.round(m.Cuenta);
  const cuenta = plan[codigo];
  if (!cuenta) detener('La cuenta ' + codigo + ' no existe en Plan_Cuentas.');
  if (cuenta.Publicar !== 'Sí') return;

  const tipo = m.Tipo === 'Ingreso' ? 'ingreso' : 'gasto';
  let categoria, programa;
  if (tipo === 'ingreso') {
    categoria = FUENTES_DE_INGRESO[cuenta['Categoría']];
    if (!categoria) detener('La categoría de ingreso "' + cuenta['Categoría'] + '" (cuenta ' + codigo + ') no está en FUENTES_DE_INGRESO de importar-excel.js.');
    programa = m.Programa === PROGRAMA_GENERAL ? '' : (m.Programa || '');
  } else {
    categoria = cuenta['Categoría'];
    programa = (!m.Programa || m.Programa === PROGRAMA_GENERAL) ? NOMBRE_ADMINISTRACION : m.Programa;
  }

  movimientos.push({
    fecha: typeof m.Fecha === 'number' ? numeroAFecha(m.Fecha) : String(m.Fecha),
    tipo: tipo,
    categoria: categoria,
    programa: programa,
    centavos: aCentavos(m['Monto en resultados'])
  });
});

// 2d. Agrupar en TOTALES ANUALES (año + tipo + categoría + programa).
//     Cada total lleva la fecha del último movimiento de ese año,
//     para que caiga dentro del período correcto en el portal.
const ultimaFechaDelAnio = {};
movimientos.forEach(function (m) {
  const anio = m.fecha.slice(0, 4);
  if (!ultimaFechaDelAnio[anio] || m.fecha > ultimaFechaDelAnio[anio]) ultimaFechaDelAnio[anio] = m.fecha;
});

const grupos = {};
movimientos.forEach(function (m) {
  const anio = m.fecha.slice(0, 4);
  const clave = [anio, m.tipo, m.categoria, m.programa].join('|');
  if (!grupos[clave]) grupos[clave] = { anio: anio, tipo: m.tipo, categoria: m.categoria, programa: m.programa, centavos: 0, cantidad: 0 };
  grupos[clave].centavos += m.centavos;
  grupos[clave].cantidad++;
});

const filasCSV = Object.keys(grupos).sort().map(function (k) { return grupos[k]; })
  .filter(function (g) { return g.centavos !== 0; });

const negativos = filasCSV.filter(function (g) { return g.centavos < 0; });
if (negativos.length > 0) detener('Hay totales negativos (ej. ' + negativos[0].categoria + ' ' + negativos[0].anio + '). Revisa devoluciones en el Sheet.');

// 2e. Fecha de corte (último movimiento) y nombre de la fundación
const anios = Object.keys(ultimaFechaDelAnio).sort();
const fechaCorte = ultimaFechaDelAnio[anios[anios.length - 1]];
const organizacion = celda(libro, 'Config', 'B3') || 'Fundación';

// 2f. Resumen PRIVADO para la junta: liquidez por trimestre (solo banco + caja chica)
const saldoInicial = aCentavos(celda(libro, 'Config', 'B7'));
const codigoCaja = Math.round(celda(libro, 'Config', 'B11') || 1102);
const movBanco = tablaConEncabezados(libro.Banco, ['Fecha', 'Retiro', 'Depósito'], 'Banco');
const movCaja = tablaConEncabezados(libro.Diario, ['Fecha', 'Cuenta', 'Debe', 'Haber'], 'Diario')
  .filter(function (m) { return Math.round(m.Cuenta) === codigoCaja; });

const trimestres = {};
const trimestreDe = function (fechaNumero) {
  const f = numeroAFecha(fechaNumero);
  return f.slice(0, 4) + '-T' + Math.ceil(parseInt(f.slice(5, 7), 10) / 3);
};
const nuevoTrimestre = function () { return { entradasBanco: 0, salidasBanco: 0, entradasCaja: 0, salidasCaja: 0 }; };
movBanco.forEach(function (m) {
  const t = trimestreDe(m.Fecha); trimestres[t] = trimestres[t] || nuevoTrimestre();
  trimestres[t].entradasBanco += aCentavos(m['Depósito']);
  trimestres[t].salidasBanco += aCentavos(m.Retiro);
});
movCaja.forEach(function (m) {
  const t = trimestreDe(m.Fecha); trimestres[t] = trimestres[t] || nuevoTrimestre();
  trimestres[t].entradasCaja += aCentavos(m.Debe);
  trimestres[t].salidasCaja += aCentavos(m.Haber);
});

let saldoBanco = saldoInicial, saldoCaja = 0;
const filasJunta = Object.keys(trimestres).sort().map(function (t) {
  const q = trimestres[t];
  saldoBanco += q.entradasBanco - q.salidasBanco;
  saldoCaja += q.entradasCaja - q.salidasCaja;
    return {
    trimestre: t,
    entradas: aTexto(q.entradasBanco + q.entradasCaja),
    salidas: aTexto(q.salidasBanco + q.salidasCaja),
    saldo_banco: aTexto(saldoBanco),
    saldo_caja_chica: aTexto(saldoCaja),
    liquidez_total: aTexto(saldoBanco + saldoCaja)
  };
});

// Meses que alcanza el dinero disponible, según lo que se gastó en promedio
// por mes en los últimos 4 trimestres (un año). Si la liquidez es negativa, 0.
const ultimos4 = Object.keys(trimestres).sort().slice(-4);
const salidasUltimoAnio = ultimos4.reduce(function (t, k) { return t + trimestres[k].salidasBanco + trimestres[k].salidasCaja; }, 0);
const salidaMensualPromedio = Math.round(salidasUltimoAnio / (ultimos4.length * 3));
const liquidezFinal = saldoBanco + saldoCaja;
const mesesCubiertos = salidaMensualPromedio === 0 ? null : Math.max(0, Math.round((liquidezFinal / salidaMensualPromedio) * 10) / 10);

// Fondos restringidos: saldo de la cuenta de activos netos con restricción (3102)
const filaRestringidos = (libro.Balanza || []).find(function (f) { return f && Math.round(f[0]) === 3102; });
const fondosRestringidos = filaRestringidos ? Math.abs(aCentavos(filaRestringidos[6])) : 0;

const saldoBancoSheet = aCentavos(celda(libro, 'Flujo_Caja', 'B11'));
if (saldoBanco !== saldoBancoSheet) detener('El saldo calculado del banco (' + formato(saldoBanco) + ') no coincide con el del estado de cuenta (' + formato(saldoBancoSheet) + ').');

fs.writeFileSync(path.join(RAIZ, 'privado', 'resumen-junta.json'), JSON.stringify({
  organizacion: organizacion,
  generado: new Date().toISOString().slice(0, 10),
  fecha_corte: fechaCorte,
  nota: 'PRIVADO. Liquidez por trimestre (banco + caja chica). No publicar.',
  liquidez: {
    banco: aTexto(saldoBanco),
    caja_chica: aTexto(saldoCaja),
    total: aTexto(liquidezFinal),
    fondos_restringidos: aTexto(fondosRestringidos),
    fondos_libres: aTexto(liquidezFinal - fondosRestringidos),
    salida_mensual_promedio: aTexto(salidaMensualPromedio),
    meses_cubiertos: mesesCubiertos,
    base_promedio: ultimos4[0] + ' a ' + ultimos4[ultimos4.length - 1]
  },
  trimestres: filasJunta
}, null, 2) + '\n', 'utf8');

// ---------- 3. Reporte ----------

console.log('\nIngresos y gastos por año (para tu revisión, no se publican):');
anios.forEach(function (a) {
  const ing = filasCSV.filter(function (g) { return g.anio === a && g.tipo === 'ingreso'; }).reduce(function (t, g) { return t + g.centavos; }, 0);
  const gas = filasCSV.filter(function (g) { return g.anio === a && g.tipo === 'gasto'; }).reduce(function (t, g) { return t + g.centavos; }, 0);
  console.log('  ' + a + ':  ingresos ' + formato(ing) + '   gastos ' + formato(gas) + '   resultado ' + formato(ing - gas));
});
const ultimo = filasJunta[filasJunta.length - 1];
console.log('\nLiquidez al ' + fechaCorte + ': banco B/. ' + ultimo.saldo_banco + ' + caja chica B/. ' + ultimo.saldo_caja_chica + ' = B/. ' + ultimo.liquidez_total);
console.log('Alcanza para ' + mesesCubiertos + ' mes(es), con un gasto promedio de ' + formato(salidaMensualPromedio) + ' al mes (' + ultimos4[0] + ' a ' + ultimos4[ultimos4.length - 1] + ').');
if (porRevisar > 0) console.log('\nAviso: ' + porRevisar + ' movimiento(s) siguen en estado "Propuesta" (clasificación sin revisar).');
console.log('\nArchivos generados:');
console.log('  privado/resumen-junta.json  (privado, no se publica)');
console.log('\nSiguientes pasos: node cifrar-junta.js   y luego   node validar.js\n');
