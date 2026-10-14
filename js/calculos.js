// =============================================================
// calculos.js
// Todas las cuentas de la página: totales, agrupaciones,
// porcentajes y la verificación de que todo cuadra con el CSV.
// Todo se calcula en CENTAVOS (enteros) para evitar errores de redondeo.
// =============================================================

const NOMBRE_ADMINISTRACION = 'Administración';

// Orden fijo en que mostramos las fuentes de ingreso (CLAUDE.md).
// Si aparece una categoría nueva en el CSV, se muestra al final.
const ORDEN_FUENTES = ['Donaciones individuales', 'Donaciones empresas', 'Eventos', 'Otros'];

// Devuelve solo los movimientos cuya fecha está dentro del período.
// Las fechas AAAA-MM-DD se pueden comparar como texto.
function filtrarPorPeriodo(movimientos, periodo) {
  return movimientos.filter(function (m) {
    return m.fecha >= periodo.desde && m.fecha <= periodo.hasta;
  });
}

// Suma los centavos de una lista de movimientos.
function sumar(movimientos) {
  return movimientos.reduce(function (total, m) { return total + m.centavos; }, 0);
}

// Agrupa movimientos por un campo (ej. 'categoria') y suma cada grupo.
// Devuelve una lista [{ nombre, centavos }], de mayor a menor.
function agruparYSumar(movimientos, campo) {
  const grupos = {};
  movimientos.forEach(function (m) {
    const clave = m[campo];
    grupos[clave] = (grupos[clave] || 0) + m.centavos;
  });
  return Object.keys(grupos)
    .map(function (nombre) { return { nombre: nombre, centavos: grupos[nombre] }; })
    .sort(function (a, b) { return b.centavos - a.centavos; });
}

// Ordena una lista de grupos según un orden preferido.
function ordenarSegun(grupos, ordenPreferido) {
  return grupos.slice().sort(function (a, b) {
    const ia = ordenPreferido.indexOf(a.nombre);
    const ib = ordenPreferido.indexOf(b.nombre);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

// Porcentaje de una parte sobre el total, con 1 decimal (ej. 17.8).
function porcentaje(parte, total) {
  if (total === 0) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

// Calcula todo lo que la página necesita para un período.
function calcularResumen(todosLosMovimientos, periodo) {
  const movimientos = filtrarPorPeriodo(todosLosMovimientos, periodo);
  const ingresos = movimientos.filter(function (m) { return m.tipo === 'ingreso'; });
  const gastos = movimientos.filter(function (m) { return m.tipo === 'gasto'; });

  const totalIngresos = sumar(ingresos);
  const totalGastos = sumar(gastos);

  // 1) De dónde viene el dinero
  const porFuente = ordenarSegun(agruparYSumar(ingresos, 'categoria'), ORDEN_FUENTES);
  porFuente.forEach(function (g) { g.porcentaje = porcentaje(g.centavos, totalIngresos); });

  // 2) A dónde va el dinero: programas primero (de mayor a menor) y Administración al final
  const porPrograma = agruparYSumar(gastos, 'programa');
  const programas = porPrograma.filter(function (g) { return g.nombre !== NOMBRE_ADMINISTRACION; });
  const administracion = porPrograma.filter(function (g) { return g.nombre === NOMBRE_ADMINISTRACION; });
  const destinos = programas.concat(administracion);
  destinos.forEach(function (g) {
    g.porcentaje = porcentaje(g.centavos, totalGastos);
    g.esAdministracion = g.nombre === NOMBRE_ADMINISTRACION;
  });

  const totalProgramas = programas.reduce(function (t, g) { return t + g.centavos; }, 0);
  const totalAdministracion = totalGastos - totalProgramas;

  return {
    periodo: periodo,
    cantidadMovimientos: movimientos.length,
    totalIngresos: totalIngresos,
    totalGastos: totalGastos,
    saldo: totalIngresos - totalGastos,
    porFuente: porFuente,
    destinos: destinos,
    totalProgramas: totalProgramas,
    totalAdministracion: totalAdministracion,
    porcentajeProgramas: porcentaje(totalProgramas, totalGastos),
    porcentajeAdministracion: porcentaje(totalAdministracion, totalGastos),
    verificaciones: verificarCuadre(movimientos, totalIngresos, totalGastos, porFuente, destinos)
  };
}

// Revisa que las cifras de la página cuadren EXACTAMENTE con el CSV.
// Cada verificación recalcula el número por otro camino y compara.
function verificarCuadre(movimientos, totalIngresos, totalGastos, porFuente, destinos) {
  const sumaFuentes = porFuente.reduce(function (t, g) { return t + g.centavos; }, 0);
  const sumaDestinos = destinos.reduce(function (t, g) { return t + g.centavos; }, 0);

  // Recorremos el CSV fila por fila, de forma independiente a los cálculos anteriores
  let ingresosFilaPorFila = 0;
  let gastosFilaPorFila = 0;
  movimientos.forEach(function (m) {
    if (m.tipo === 'ingreso') ingresosFilaPorFila += m.centavos;
    else gastosFilaPorFila += m.centavos;
  });

  return [
    {
      descripcion: 'La suma de los ingresos por fuente es igual al total de ingresos',
      esperado: totalIngresos, obtenido: sumaFuentes
    },
    {
      descripcion: 'La suma de los gastos por destino es igual al total de gastos',
      esperado: totalGastos, obtenido: sumaDestinos
    },
    {
      descripcion: 'El total de ingresos coincide con la suma fila por fila del CSV',
      esperado: ingresosFilaPorFila, obtenido: totalIngresos
    },
    {
      descripcion: 'El total de gastos coincide con la suma fila por fila del CSV',
      esperado: gastosFilaPorFila, obtenido: totalGastos
    }
  ].map(function (v) {
    v.cuadra = v.esperado === v.obtenido;
    return v;
  });
}

// Años (como texto) que abarca un período. Ej. 2024-01-01 a 2025-12-31 -> ['2024', '2025']
function aniosDelPeriodo(periodo) {
  const inicio = parseInt(periodo.desde.slice(0, 4), 10);
  const fin = parseInt(periodo.hasta.slice(0, 4), 10);
  const anios = [];
  for (let a = inicio; a <= fin; a++) anios.push(String(a));
  return anios;
}
