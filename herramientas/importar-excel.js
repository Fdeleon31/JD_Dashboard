// =============================================================
// importar-excel.js
// Convierte la contabilidad (Google Sheet descargado como .xlsx)
// en los datos del panel de la junta: la liquidez por trimestre.
//
// Lee:      privado/*.xlsx   (el único Excel que haya en la carpeta privado)
// Escribe:  privado/resumen-junta.json  -> PRIVADO. No se publica:
//           cifrar-junta.js lo cifra para el panel.
//
// Uso:  node herramientas/importar-excel.js
//       node herramientas/importar-excel.js privado/otro-archivo.xlsx   (para indicar el archivo)
//
// Antes de generar nada revisa que los controles del Sheet estén en cero.
// Solo lee fechas, cuentas y montos: nunca las columnas "Descripción del banco"
// ni "Nota", que tienen nombres de personas.
// =============================================================

const fs = require('fs');
const path = require('path');
const { leerLibro, numeroAFecha } = require('./leer-xlsx');

const RAIZ = path.join(__dirname, '..'); // la carpeta del proyecto (un nivel arriba de herramientas/)
const DESTINO = path.join(RAIZ, 'privado', 'resumen-junta.json');

// ---------- 1. Utilidades ----------

function detener(mensaje) {
  console.error('\nNO SE IMPORTÓ NADA: ' + mensaje + '\n');
  process.exit(1);
}

// Busca el Excel de la contabilidad en privado/ (debe haber uno solo)
function buscarExcel() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const carpeta = path.join(RAIZ, 'privado');
  if (!fs.existsSync(carpeta)) detener('No existe la carpeta privado/.');
  const encontrados = fs.readdirSync(carpeta).filter(function (n) {
    return n.toLowerCase().endsWith('.xlsx') && !n.startsWith('~$'); // ~$ = archivo temporal de Excel abierto
  });
  if (encontrados.length === 0) detener('No hay ningún .xlsx en la carpeta privado/.');
  if (encontrados.length > 1) {
    detener('Hay ' + encontrados.length + ' archivos .xlsx en privado/ (' + encontrados.join(', ') +
      '). Deja solo uno o indica cuál: node herramientas/importar-excel.js privado/archivo.xlsx');
  }
  return path.join(carpeta, encontrados[0]);
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

// Los montos se suman en centavos enteros para no arrastrar decimales
const aCentavos = function (n) { return Math.round((Number(n) || 0) * 100); };
const aTexto = function (centavos) { return (centavos / 100).toFixed(2); };
const formato = function (centavos) {
  return 'B/. ' + (centavos / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ---------- 2. Leer el libro y revisar los controles ----------

const archivo = buscarExcel();
console.log('Leyendo ' + path.relative(RAIZ, archivo));
const libro = leerLibro(archivo);

['Config', 'Banco', 'Diario', 'Balanza', 'Resultados', 'Flujo_Caja'].forEach(function (p) {
  if (!libro[p]) detener('Falta la pestaña ' + p + '.');
});

// Controles del Sheet: deben estar en cero antes de publicar
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

// ---------- 3. Movimientos de dinero: banco y caja chica ----------

const organizacion = celda(libro, 'Config', 'B3') || 'Fundación';
const saldoInicial = aCentavos(celda(libro, 'Config', 'B7'));
const codigoCaja = Math.round(celda(libro, 'Config', 'B11') || 1102);

// Del banco solo se leen la fecha, los montos y el estado de la clasificación
const movBanco = tablaConEncabezados(libro.Banco, ['Fecha', 'Retiro', 'Depósito', 'Estado'], 'Banco');
// Del diario, solo los asientos de la cuenta de caja chica
const movCaja = tablaConEncabezados(libro.Diario, ['Fecha', 'Cuenta', 'Debe', 'Haber'], 'Diario')
  .filter(function (m) { return Math.round(m.Cuenta) === codigoCaja; });

const porAclarar = movBanco.filter(function (m) { return m.Estado === 'Por aclarar'; }).length;
const porRevisar = movBanco.filter(function (m) { return m.Estado === 'Propuesta'; }).length;
if (porAclarar > 0) detener(porAclarar + ' movimiento(s) en estado "Por aclarar".');
if (movBanco.length === 0) detener('La pestaña Banco no tiene movimientos.');

// ---------- 4. Liquidez por trimestre ----------

// 46295 (número de fecha de Excel) -> "2026-T3"
const trimestreDe = function (fechaNumero) {
  const f = numeroAFecha(fechaNumero);
  return f.slice(0, 4) + '-T' + Math.ceil(parseInt(f.slice(5, 7), 10) / 3);
};
const nuevoTrimestre = function () { return { entradasBanco: 0, salidasBanco: 0, entradasCaja: 0, salidasCaja: 0 }; };

const trimestres = {};
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

// Saldo acumulado al cierre de cada trimestre
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

// El saldo calculado debe ser igual al del estado de cuenta
const saldoBancoSheet = aCentavos(celda(libro, 'Flujo_Caja', 'B11'));
if (saldoBanco !== saldoBancoSheet) {
  detener('El saldo calculado del banco (' + formato(saldoBanco) + ') no coincide con el del estado de cuenta (' + formato(saldoBancoSheet) + ').');
}

// Meses que alcanza el dinero disponible, según lo que salió en promedio
// por mes en los últimos 4 trimestres (un año). Si la liquidez es negativa, 0.
const ultimos4 = Object.keys(trimestres).sort().slice(-4);
const salidasUltimoAnio = ultimos4.reduce(function (t, k) { return t + trimestres[k].salidasBanco + trimestres[k].salidasCaja; }, 0);
const salidaMensualPromedio = Math.round(salidasUltimoAnio / (ultimos4.length * 3));
const liquidezFinal = saldoBanco + saldoCaja;
const mesesCubiertos = salidaMensualPromedio === 0 ? null : Math.max(0, Math.round((liquidezFinal / salidaMensualPromedio) * 10) / 10);

// Fondos restringidos: saldo de la cuenta de activos netos con restricción (3102)
const filaRestringidos = (libro.Balanza || []).find(function (f) { return f && Math.round(f[0]) === 3102; });
const fondosRestringidos = filaRestringidos ? Math.abs(aCentavos(filaRestringidos[6])) : 0;

// Fecha de corte: el último movimiento de dinero registrado (banco o caja chica)
const fechaCorte = numeroAFecha(Math.max.apply(null, movBanco.concat(movCaja).map(function (m) { return m.Fecha; })));

// ---------- 5. Guardar y reportar ----------

fs.writeFileSync(DESTINO, JSON.stringify({
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

const ultimo = filasJunta[filasJunta.length - 1];
console.log('\nLiquidez al ' + fechaCorte + ': banco B/. ' + ultimo.saldo_banco + ' + caja chica B/. ' + ultimo.saldo_caja_chica + ' = B/. ' + ultimo.liquidez_total);
console.log('Alcanza para ' + mesesCubiertos + ' mes(es), con una salida promedio de ' + formato(salidaMensualPromedio) + ' al mes (' + ultimos4[0] + ' a ' + ultimos4[ultimos4.length - 1] + ').');
if (porRevisar > 0) console.log('\nAviso: ' + porRevisar + ' movimiento(s) siguen en estado "Propuesta" (clasificación sin revisar).');
console.log('\nGenerado: privado/resumen-junta.json  (privado, no se publica)\n');
