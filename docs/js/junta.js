// =============================================================
// junta.js
// Panel privado de la junta: pide la contraseña, descifra
// data/junta.cifrado.json en el navegador y muestra la liquidez.
//
// El archivo publicado está cifrado con AES-256-GCM (ver cifrar-junta.js).
// Sin la contraseña correcta no se puede leer nada. Los datos descifrados
// solo viven en la memoria de esta pestaña: no se guardan en ningún lado.
// =============================================================

// ---------- Utilidades ----------

function $(id) { return document.getElementById(id); }

const formatoNumero = new Intl.NumberFormat('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// "1234.5" -> "B/. 1,234.50"
function moneda(texto) {
  const n = Number(texto);
  return (n < 0 ? '-' : '') + 'B/. ' + formatoNumero.format(Math.abs(n));
}

// "2026-09-30" -> "30 de septiembre de 2026"
function fechaLarga(texto) {
  const p = texto.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
    .toLocaleDateString('es-PA', { day: 'numeric', month: 'long', year: 'numeric' });
}

// "2025-T3" -> "T3 2025"
function nombreTrimestre(t) { return t.slice(5) + ' ' + t.slice(0, 4); }

function colorCSS(nombre) { return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim(); }

// Texto en base64 -> bytes
function desdeBase64(b64) { return Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }); }

// ---------- Descifrar ----------

// Mismo procedimiento que cifrar-junta.js: PBKDF2-SHA256 -> llave AES-256-GCM
async function descifrar(paquete, clave) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveKey']);
  const llave = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: desdeBase64(paquete.sal), iterations: paquete.iteraciones, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  // Si la contraseña es incorrecta, esta línea lanza un error
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: desdeBase64(paquete.iv) }, llave, desdeBase64(paquete.datos));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// ---------- Mostrar ----------

let grafico = null;

function mostrarPanel(datos) {
  const l = datos.liquidez;
  $('nombre-org').textContent = datos.organizacion + ' · Panel de la junta';
  $('fecha-corte').textContent = fechaLarga(datos.fecha_corte);

  $('liquidez-total').textContent = moneda(l.total);
  $('liquidez-detalle').textContent = 'Banco ' + moneda(l.banco) + ' + caja chica ' + moneda(l.caja_chica);

  $('meses-cubiertos').textContent = l.meses_cubiertos === null ? '—' : formatoNumero.format(l.meses_cubiertos).replace(/\.?0+$/, '');
  $('meses-detalle').textContent = 'Con un gasto promedio de ' + moneda(l.salida_mensual_promedio) + ' al mes (' +
    l.base_promedio.replace(/(\d{4})-(T\d)/g, '$2 $1') + ').';

  $('fondos-libres').textContent = moneda(l.fondos_libres);
  $('fondos-detalle').textContent = Number(l.fondos_restringidos) === 0
    ? 'No hay fondos restringidos por donantes.'
    : 'Restringidos por donantes: ' + moneda(l.fondos_restringidos);

  // Tabla por trimestre (del más reciente al más antiguo).
  // Sin "B/." en cada celda para que quepa en el celular; la moneda va en el encabezado.
  const numero = function (t) { return formatoNumero.format(Number(t)); };
  const filas = datos.trimestres.slice().reverse().map(function (t) {
    return '<tr><td>' + nombreTrimestre(t.trimestre) + '</td>' +
      '<td class="numero">' + numero(t.entradas) + '</td>' +
      '<td class="numero">' + numero(t.salidas) + '</td>' +
      '<td class="numero"><strong>' + numero(t.liquidez_total) + '</strong></td></tr>';
  }).join('');
  $('tabla-trimestres').innerHTML = '<div class="tabla-desplazable"><table><thead><tr><th>Trimestre</th>' +
    '<th class="numero">Entradas (B/.)</th><th class="numero">Salidas (B/.)</th><th class="numero">Al cierre (B/.)</th>' +
    '</tr></thead><tbody>' + filas + '</tbody></table></div>';

  dibujarGrafico(datos.trimestres);
  $('nota-generado').textContent = 'Datos preparados el ' + fechaLarga(datos.generado) + ' a partir de la contabilidad de la fundación.';

  $('seccion-acceso').hidden = true;
  $('panel').hidden = false;
}

function dibujarGrafico(trimestres) {
  if (typeof Chart === 'undefined') return; // si no cargó Chart.js, queda la tabla
  if (grafico) grafico.destroy();
  const azul = colorCSS('--color-programas');
  grafico = new Chart($('grafico-liquidez'), {
    type: 'line',
    data: {
      labels: trimestres.map(function (t) { return nombreTrimestre(t.trimestre); }),
      datasets: [{
        data: trimestres.map(function (t) { return Number(t.liquidez_total); }),
        borderColor: azul,
        backgroundColor: azul,
        borderWidth: 2,
        pointRadius: 4,
        tension: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { displayColors: false, callbacks: { label: function (c) { return moneda(c.parsed.y); } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: colorCSS('--texto-secundario') } },
        y: {
          grid: { color: colorCSS('--linea') },
          ticks: { color: colorCSS('--texto-secundario'), callback: function (v) { return 'B/. ' + formatoNumero.format(v).replace('.00', ''); } }
        }
      }
    }
  });
}

// ---------- Inicio ----------

let paquete = null;
let datosAbiertos = null;

$('form-acceso').addEventListener('submit', async function (evento) {
  evento.preventDefault();
  const mensaje = $('mensaje-acceso');
  const boton = $('boton-entrar');
  mensaje.textContent = '';
  boton.disabled = true;
  boton.textContent = 'Abriendo…';
  try {
    if (!paquete) {
      const respuesta = await fetch('data/junta.cifrado.json', { cache: 'no-store' });
      if (!respuesta.ok) throw new Error('sin-archivo');
      paquete = await respuesta.json();
    }
    datosAbiertos = await descifrar(paquete, $('clave').value);
    $('clave').value = '';
    mostrarPanel(datosAbiertos);
  } catch (e) {
    // Olvidamos el archivo descargado: si se publicó uno nuevo mientras la
    // página estaba abierta, el siguiente intento lo vuelve a descargar.
    paquete = null;
    if (e.message === 'sin-archivo') mensaje.textContent = 'Todavía no hay datos publicados para la junta.';
    else if (!window.crypto || !crypto.subtle) mensaje.textContent = 'Este navegador no permite abrir el panel. Ábrelo desde la dirección https:// del portal.';
    else mensaje.textContent = 'Contraseña incorrecta.';
  } finally {
    boton.disabled = false;
    boton.textContent = 'Entrar';
  }
});

// Cerrar: borra los datos de la memoria y vuelve a pedir la contraseña
$('boton-salir').addEventListener('click', function () {
  datosAbiertos = null;
  if (grafico) { grafico.destroy(); grafico = null; }
  $('tabla-trimestres').innerHTML = '';
  $('panel').hidden = true;
  $('seccion-acceso').hidden = false;
  $('clave').focus();
});

// Si cambia el modo claro/oscuro, redibujamos el gráfico con los colores nuevos
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
  if (datosAbiertos) dibujarGrafico(datosAbiertos.trimestres);
});
