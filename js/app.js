// =============================================================
// app.js
// Une todo: carga los datos, hace los cálculos y llena la página.
// Usa funciones de leer-datos.js y calculos.js (se cargan antes).
// Mismo estilo que el panel de la junta: tarjetas, un gráfico y tablas.
// =============================================================

// Aquí guardamos los datos cargados, el período elegido y el gráfico
const estado = {
  datos: null,
  periodoActual: null,
  grafico: null
};

// ---------- Utilidades de formato ----------

// 167556 centavos -> "B/. 1,675.56"
const formatoNumero = new Intl.NumberFormat('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatoMoneda(centavos) {
  const signo = centavos < 0 ? '-' : '';
  return signo + 'B/. ' + formatoNumero.format(Math.abs(centavos) / 100);
}

// 1450 -> "1,450"
const formatoEntero = new Intl.NumberFormat('es-PA');

// "2025-12-31" -> "31 de diciembre de 2025"
function formatoFecha(textoFecha) {
  const partes = textoFecha.split('-');
  const fecha = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  return fecha.toLocaleDateString('es-PA', { day: 'numeric', month: 'long', year: 'numeric' });
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function mesCorto(textoFecha) { return MESES[Number(textoFecha.slice(5, 7)) - 1]; }

// ¿El período es un año completo (1 de enero a 31 de diciembre)?
function esAnio(periodo) { return /^\d{4}$/.test(periodo.id); }
function esAnioIncompleto(periodo) {
  return esAnio(periodo) && (periodo.desde.slice(5) !== '01-01' || periodo.hasta.slice(5) !== '12-31');
}

// Nombre corto del período: "2025", "2026 (ene–sep)", "Todo (oct 2024 a sep 2026)"
function etiquetaPeriodo(periodo) {
  if (esAnio(periodo)) {
    return esAnioIncompleto(periodo)
      ? periodo.id + ' (' + mesCorto(periodo.desde) + '–' + mesCorto(periodo.hasta) + ')'
      : periodo.id;
  }
  return 'Todo (' + mesCorto(periodo.desde) + ' ' + periodo.desde.slice(0, 4) +
         ' a ' + mesCorto(periodo.hasta) + ' ' + periodo.hasta.slice(0, 4) + ')';
}

// Lee un color definido en estilos.css (ej. '--color-programas')
function colorCSS(nombreVariable) {
  return getComputedStyle(document.documentElement).getPropertyValue(nombreVariable).trim();
}

// Atajo para buscar un elemento por id
function $(id) { return document.getElementById(id); }

// Evita que un texto del CSV se interprete como HTML
function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// ---------- Inicio ----------

async function iniciar() {
  try {
    estado.datos = await cargarTodosLosDatos();
  } catch (error) {
    mostrarErrorGeneral(error);
    return;
  }

  const info = estado.datos.info;
  $('nombre-org').textContent = info.organizacion;
  $('pie-org').textContent = info.organizacion;
  $('moneda').textContent = info.moneda;
  document.title = 'Transparencia · ' + info.organizacion;

  if (info.datos_de_ejemplo) {
    $('aviso-ejemplo-texto').textContent = info.aviso_datos_de_ejemplo;
    $('aviso-ejemplo').hidden = false;
  }

  crearSelectorPeriodo(info.periodos, info.periodo_inicial);
  mostrarPorAnio();            // no depende del período elegido
  mostrarNotasFijas();
  mostrarErroresCSV();
  mostrarPeriodo(info.periodo_inicial);

  // Si cambia el modo claro/oscuro, redibujamos el gráfico con los colores nuevos
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mostrarPorAnio);
}

function mostrarErrorGeneral(error) {
  let mensaje = error.message;
  // Caso común: abrir index.html con doble clic (file://) bloquea la lectura de archivos
  if (location.protocol === 'file:') {
    mensaje = 'El navegador no permite leer los datos si abres el archivo con doble clic. ' +
              'Abre la página con un servidor local (ver README.md).';
  }
  $('error-general').textContent = 'No se pudieron cargar los datos. ' + mensaje;
  $('error-general').hidden = false;
}

// Un botón corto por período: "2026", "2025", "2024", "Todo"
function crearSelectorPeriodo(periodos, idInicial) {
  const contenedor = $('selector-periodo');
  periodos.forEach(function (periodo) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = esAnio(periodo) ? periodo.id : 'Todo';
    boton.title = periodo.nombre;
    boton.dataset.periodo = periodo.id;
    boton.setAttribute('aria-pressed', periodo.id === idInicial ? 'true' : 'false');
    boton.addEventListener('click', function () { mostrarPeriodo(periodo.id); });
    contenedor.appendChild(boton);
  });
}

// ---------- Lo que cambia con el período elegido ----------

function mostrarPeriodo(idPeriodo) {
  const periodo = estado.datos.info.periodos.find(function (p) { return p.id === idPeriodo; });
  estado.periodoActual = periodo;

  document.querySelectorAll('#selector-periodo button').forEach(function (b) {
    b.setAttribute('aria-pressed', b.dataset.periodo === idPeriodo ? 'true' : 'false');
  });
  $('periodo-texto').textContent = '· ' + etiquetaPeriodo(periodo);
  $('periodo-texto-detalle').textContent = '· ' + etiquetaPeriodo(periodo);

  const r = calcularResumen(estado.datos.movimientos, periodo);
  mostrarResumen(r);
  mostrarDetalle(r);
  mostrarImpacto(periodo);
  mostrarVerificacion(r);
}

// 1. Tres tarjetas: recibimos, gastamos, saldo
function mostrarResumen(r) {
  $('total-ingresos').textContent = formatoMoneda(r.totalIngresos);
  $('total-gastos').textContent = formatoMoneda(r.totalGastos);

  // Fuente principal de ingresos (la de mayor monto)
  const principal = r.porFuente.slice().sort(function (a, b) { return b.centavos - a.centavos; })[0];
  $('nota-ingresos').textContent = principal
    ? 'Principal fuente: ' + principal.nombre.toLowerCase() + ' (' + principal.porcentaje.toFixed(0) + '%).'
    : 'Sin ingresos en este período.';

  $('nota-gastos').textContent = r.totalGastos > 0
    ? r.porcentajeProgramas.toFixed(0) + '% en programas y ' + r.porcentajeAdministracion.toFixed(0) + '% en administración.'
    : 'Sin gastos en este período.';

  // Saldo: la etiqueta dice si sobró o faltó; el color solo acompaña
  const saldo = $('saldo');
  saldo.textContent = formatoMoneda(Math.abs(r.saldo));
  saldo.className = 'tarjeta-valor ' + (r.saldo >= 0 ? 'positivo' : 'negativo');
  $('saldo-etiqueta').textContent = r.saldo >= 0 ? 'Nos quedó' : 'Gastamos de más';
  $('nota-saldo').textContent = r.saldo >= 0
    ? 'Queda para continuar los programas.'
    : 'Se cubrió con dinero de períodos anteriores.';
}

// 3. Dos tablas: de dónde vino y en qué se usó
function mostrarDetalle(r) {
  const fila = function (g) { return [g.nombre, formatoMoneda(g.centavos), g.porcentaje.toFixed(1) + '%']; };
  $('tabla-ingresos').innerHTML = r.porFuente.length
    ? crearTabla(['Fuente', 'Monto', '%'], r.porFuente.map(fila), ['Total recibido', formatoMoneda(r.totalIngresos), '100%'])
    : '<p class="seccion-sub">Sin ingresos en este período.</p>';
  $('tabla-gastos').innerHTML = r.destinos.length
    ? crearTabla(['Destino', 'Monto', '%'], r.destinos.map(fila), ['Total gastado', formatoMoneda(r.totalGastos), '100%'])
    : '<p class="seccion-sub">Sin gastos en este período.</p>';
}

// 4. Impacto: una tarjeta por métrica. Si el período abarca varios años,
//    se muestra el año más reciente y debajo los anteriores (no se suman,
//    porque una misma persona u organización puede repetir).
function mostrarImpacto(periodo) {
  const anios = aniosDelPeriodo(periodo);
  const bloques = estado.datos.impacto.programas.map(function (prog) {
    const tarjetas = prog.metricas.map(function (m) {
      const conDato = anios.filter(function (a) { return m.valores[a] !== undefined; });
      if (conDato.length === 0) return '';
      const ultimo = conDato[conDato.length - 1];
      const anteriores = conDato.slice(0, -1).map(function (a) { return a + ': ' + formatoEntero.format(m.valores[a]); });
      return '<div class="tarjeta">' +
        '<p class="tarjeta-etiqueta">' + escaparHTML(m.nombre) + '</p>' +
        '<p class="tarjeta-valor">' + formatoEntero.format(m.valores[ultimo]) + '</p>' +
        '<p class="tarjeta-nota">' + (anios.length > 1 ? 'En ' + ultimo + (anteriores.length ? ' · ' + anteriores.join(' · ') : '') : '') + '</p>' +
        '</div>';
    }).join('');
    if (!tarjetas) return '';
    return '<h3>' + escaparHTML(prog.programa) + '</h3>' +
      '<p class="seccion-sub">' + escaparHTML(prog.descripcion) + '</p>' +
      '<div class="tarjetas-resumen">' + tarjetas + '</div>';
  }).join('');

  $('impacto').innerHTML = bloques || '<p class="seccion-sub">Todavía no hay resultados publicados para este período.</p>';
}

// 5. Una sola línea de verificación: ¿las cifras cuadran con la contabilidad?
function mostrarVerificacion(r) {
  const fallas = r.verificaciones.filter(function (v) { return !v.cuadra; });
  const p = $('verificacion');
  if (fallas.length === 0) {
    p.className = 'verificacion ok';
    p.innerHTML = '<span aria-hidden="true">✓</span> Las cifras de este período cuadran al centavo con la contabilidad (' +
      formatoEntero.format(r.cantidadMovimientos) + ' registros).';
  } else {
    p.className = 'verificacion mal';
    p.innerHTML = '<span aria-hidden="true">✗</span> Hay cifras que no cuadran: ' +
      fallas.map(function (v) {
        return escaparHTML(v.descripcion) + ' (esperado ' + formatoMoneda(v.esperado) + ', obtenido ' + formatoMoneda(v.obtenido) + ')';
      }).join('; ') + '.';
  }
}

// ---------- Lo que no cambia con el período ----------

// 2. Gráfico y tabla de ingresos vs gastos, un grupo de barras por año
function mostrarPorAnio() {
  const anios = estado.datos.info.periodos.filter(esAnio)
    .slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  const resumenes = anios.map(function (p) { return calcularResumen(estado.datos.movimientos, p); });

  // Años incompletos llevan "*" y se explican debajo del título
  const incompletos = anios.filter(esAnioIncompleto);
  if (incompletos.length > 0) {
    $('sub-anios').textContent = 'Lo que entró y lo que salió cada año. * Año incompleto: ' +
      incompletos.map(etiquetaPeriodo).join(', ') + '.';
  }
  const nombreCorto = function (p) { return p.id + (esAnioIncompleto(p) ? '*' : ''); };

  // Tabla (con total de todos los años). Sin "B/." en cada celda para que quepa
  // en el celular; la moneda va en el encabezado, igual que en el panel de la junta.
  const numero = function (centavos) { return formatoNumero.format(centavos / 100); };
  const todo = estado.datos.info.periodos.find(function (p) { return !esAnio(p); });
  const total = todo ? calcularResumen(estado.datos.movimientos, todo) : null;
  $('tabla-anios').innerHTML = '<div class="tabla-desplazable">' + crearTabla(
    ['Año', 'Ingresos (B/.)', 'Gastos (B/.)', 'Saldo (B/.)'],
    resumenes.map(function (r, i) {
      return [nombreCorto(anios[i]), numero(r.totalIngresos), numero(r.totalGastos), numero(r.saldo)];
    }),
    total ? ['Total', numero(total.totalIngresos), numero(total.totalGastos), numero(total.saldo)] : null
  ) + '</div>';

  // Gráfico
  if (typeof Chart === 'undefined') return; // si no cargó Chart.js, queda la tabla
  if (estado.grafico) estado.grafico.destroy();
  const serie = function (nombre, variable, valores) {
    return {
      label: nombre,
      data: valores,
      backgroundColor: colorCSS(variable),
      borderRadius: 4,
      maxBarThickness: 36,
      categoryPercentage: 0.6,
      barPercentage: 0.9
    };
  };
  estado.grafico = new Chart($('grafico-anios'), {
    type: 'bar',
    data: {
      labels: anios.map(nombreCorto),
      datasets: [
        serie('Ingresos', '--color-programas', resumenes.map(function (r) { return r.totalIngresos / 100; })),
        serie('Gastos', '--color-administracion', resumenes.map(function (r) { return r.totalGastos / 100; }))
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'start',
          labels: { color: colorCSS('--texto-secundario'), boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3 }
        },
        tooltip: {
          callbacks: { label: function (c) { return c.dataset.label + ': ' + formatoMoneda(Math.round(c.parsed.y * 100)); } }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: colorCSS('--texto-secundario'), maxRotation: 0 } },
        y: {
          beginAtZero: true,
          grid: { color: colorCSS('--linea') },
          border: { display: false },
          ticks: { color: colorCSS('--texto-secundario'), callback: function (v) { return 'B/. ' + formatoEntero.format(v); } }
        }
      }
    }
  });
}

// Notas, fecha de corte, quién preparó y la fuente
function mostrarNotasFijas() {
  const info = estado.datos.info;
  $('nota-lista').innerHTML = info.notas.map(function (n) { return '<li>' + escaparHTML(n) + '</li>'; }).join('');
  $('nota-fuente').textContent = 'Datos al ' + formatoFecha(info.fecha_corte) + '. Preparado por ' +
    info.preparado_por + '. Fuente: ' + info.fuente;
}

// Avisos sobre filas del CSV con errores o fuera de todos los períodos
function mostrarErroresCSV() {
  const avisos = estado.datos.erroresCSV.slice();
  const periodos = estado.datos.info.periodos;
  const desde = periodos.map(function (p) { return p.desde; }).sort()[0];
  const hasta = periodos.map(function (p) { return p.hasta; }).sort().reverse()[0];
  const fuera = estado.datos.movimientos.filter(function (m) { return m.fecha < desde || m.fecha > hasta; });
  if (fuera.length > 0) {
    avisos.push(fuera.length + ' movimiento(s) tienen fecha fuera de los períodos publicados y no se muestran.');
  }
  if (avisos.length === 0) return;

  const lista = avisos.slice(0, 10).map(function (a) { return '<li>' + escaparHTML(a) + '</li>'; }).join('');
  const extra = avisos.length > 10 ? '<li>… y ' + (avisos.length - 10) + ' más.</li>' : '';
  $('errores-csv').innerHTML = '<strong>Revisar el archivo de datos:</strong><ul>' + lista + extra + '</ul>';
  $('errores-csv').hidden = false;
}

// ---------- Tablas ----------

// Crea el HTML de una tabla. Desde la 2.ª columna son números (alineados a la derecha).
// filaTotal es opcional.
function crearTabla(encabezados, filas, filaTotal) {
  const th = encabezados.map(function (h, i) {
    return '<th' + (i > 0 ? ' class="numero"' : '') + '>' + h + '</th>';
  }).join('');
  const celdas = function (fila) {
    return fila.map(function (c, i) {
      return '<td' + (i > 0 ? ' class="numero"' : '') + '>' + escaparHTML(c) + '</td>';
    }).join('');
  };
  return '<table><thead><tr>' + th + '</tr></thead><tbody>' +
    filas.map(function (f) { return '<tr>' + celdas(f) + '</tr>'; }).join('') +
    '</tbody>' + (filaTotal ? '<tfoot><tr>' + celdas(filaTotal) + '</tr></tfoot>' : '') + '</table>';
}

// ¡Arrancamos!
iniciar();
