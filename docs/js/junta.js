// =============================================================
// junta.js
// Panel privado de la junta: pide la contraseña, descifra
// data/junta.cifrado.json en el navegador y explica la liquidez.
//
// El archivo publicado está cifrado con AES-256-GCM (ver herramientas/cifrar-junta.js).
// Sin la contraseña correcta no se puede leer nada. Los datos descifrados
// solo viven en la memoria de esta pestaña: no se guardan en ningún lado.
//
// Todo lo que el panel "dice" (el estado, las frases, la meta) se calcula
// aquí a partir de los datos. No hay textos escritos a mano por trimestre.
// =============================================================

// ---------- Criterios de la junta (se pueden cambiar aquí) ----------

const META_MESES = 3;    // Meta de reserva: meses de salidas que debería cubrir el dinero disponible
const MINIMO_MESES = 1;  // Por debajo de esto, la reserva se marca como crítica
const ESCALA_MESES = 6;  // Hasta dónde llega la regla de meses
const DIAS_DE_GRACIA = 45; // Días después de un cierre de trimestre antes de avisar que faltan datos nuevos

// ---------- Utilidades ----------

function $(id) { return document.getElementById(id); }

// Crea un elemento HTML con clase y texto. Usar textContent (y no innerHTML)
// evita que un dato raro se interprete como código.
function crear(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// Lo mismo para las piezas del gráfico (SVG)
function crearSVG(etiqueta, atributos) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', etiqueta);
  Object.keys(atributos || {}).forEach(function (k) { e.setAttribute(k, atributos[k]); });
  return e;
}

const formatoNumero = new Intl.NumberFormat('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatoEntero = new Intl.NumberFormat('es-PA', { maximumFractionDigits: 0 });

// Los montos llegan como texto ("255.16"). Para sumar y restar sin
// errores de decimales se convierten a centavos enteros.
function centavos(texto) { return Math.round(Number(texto) * 100); }

// 25516 centavos -> "B/. 255.16"   ·   -204 -> "−B/. 2.04"
function moneda(cent) {
  return (cent < 0 ? '−' : '') + 'B/. ' + formatoNumero.format(Math.abs(cent) / 100);
}
// Igual, pero con signo siempre: "+B/. 87.68" o "−B/. 87.68"
function monedaConSigno(cent) {
  if (cent === 0) return 'B/. 0.00';
  return (cent < 0 ? '−' : '+') + 'B/. ' + formatoNumero.format(Math.abs(cent) / 100);
}

// "2026-09-30" -> fecha (a medianoche, hora local)
function aFecha(texto) {
  const p = texto.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}
// fecha -> "30 de septiembre de 2026"
function fechaLarga(fecha) {
  return fecha.toLocaleDateString('es-PA', { day: 'numeric', month: 'long', year: 'numeric' });
}
// "2025-T3" -> "T3 2025"
function nombreTrimestre(t) { return t.slice(5) + ' ' + t.slice(0, 4); }

// 1 -> "1 mes"   ·   2.5 -> "2.5 meses"
function textoMeses(n) {
  const numero = String(Math.round(n * 10) / 10);
  return numero + (Number(numero) === 1 ? ' mes' : ' meses');
}

// El próximo cierre de trimestre después de la fecha de corte
// (31 de marzo, 30 de junio, 30 de septiembre o 31 de diciembre)
function proximoCierre(fechaCorte) {
  let anio = fechaCorte.getFullYear();
  let mesCierre = Math.floor(fechaCorte.getMonth() / 3) * 3 + 2; // último mes del trimestre (0 = enero)
  let cierre = new Date(anio, mesCierre + 1, 0);                  // día 0 del mes siguiente = último día
  if (cierre <= fechaCorte) cierre = new Date(anio, mesCierre + 4, 0);
  return cierre;
}

// Texto en base64 -> bytes
function desdeBase64(b64) { return Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }); }

// ---------- Descifrar ----------

// Mismo procedimiento que herramientas/cifrar-junta.js: PBKDF2-SHA256 -> llave AES-256-GCM
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

// ---------- Interpretar los datos ----------

// Convierte los datos en lo que la junta necesita saber:
// el estado de la reserva, las frases y las cifras ya calculadas.
function interpretar(datos) {
  const l = datos.liquidez;
  const total = centavos(l.total);
  const salidaMensual = centavos(l.salida_mensual_promedio);
  const meses = l.meses_cubiertos;                 // puede ser null si no hubo salidas
  const metaMonto = META_MESES * salidaMensual;    // dinero que haría falta para cubrir la meta

  // 1. Estado de la reserva
  let estado, estadoTexto;
  if (total <= 0) { estado = 'critico'; estadoTexto = 'Sin dinero disponible'; }
  else if (meses === null) { estado = 'neutro'; estadoTexto = 'Sin salidas en el último año'; }
  else if (meses >= META_MESES) { estado = 'bien'; estadoTexto = 'Reserva saludable'; }
  else if (meses >= MINIMO_MESES) { estado = 'atencion'; estadoTexto = 'Reserva por debajo de la meta'; }
  else { estado = 'critico'; estadoTexto = 'Reserva crítica'; }

  // 2. Frase principal y detalle
  let frase, detalle;
  if (total <= 0) {
    frase = 'La fundación no tiene dinero disponible: el saldo es ' + moneda(total) + '.';
    detalle = 'Para cubrir la meta de ' + textoMeses(META_MESES) + ' de reserva harían falta ' + moneda(metaMonto - total) + '.';
  } else if (meses === null) {
    frase = 'La fundación tiene ' + moneda(total) + ' disponibles.';
    detalle = 'No hubo salidas de dinero en el último año, así que no se puede estimar para cuántos meses alcanza.';
  } else {
    const alcance = meses < 1 ? 'menos de un mes' : textoMeses(meses);
    frase = 'La fundación tiene ' + moneda(total) + ' disponibles. Al ritmo de salidas del último año, alcanza para ' + alcance + '.';
    detalle = total >= metaMonto
      ? 'Supera por ' + moneda(total - metaMonto) + ' la meta de ' + textoMeses(META_MESES) + ' de reserva (' + moneda(metaMonto) + ').'
      : 'Para llegar a la meta de ' + textoMeses(META_MESES) + ' de reserva (' + moneda(metaMonto) + ') faltan ' + moneda(metaMonto - total) + '.';
  }

  // 3. Qué cambió en el último trimestre frente al anterior
  const trimestres = datos.trimestres.map(function (t) {
    return {
      nombre: nombreTrimestre(t.trimestre),
      entradas: centavos(t.entradas),
      salidas: centavos(t.salidas),
      neto: centavos(t.entradas) - centavos(t.salidas),
      cierre: centavos(t.liquidez_total)
    };
  });
  const ultimo = trimestres[trimestres.length - 1];
  const anterior = trimestres[trimestres.length - 2];
  let cambio;
  if (!anterior) {
    cambio = 'Es el primer trimestre con datos, así que todavía no hay con qué compararlo.';
  } else {
    const variacion = ultimo.cierre - anterior.cierre;
    if (variacion < 0) cambio = 'Salió más dinero del que entró: el disponible bajó ' + moneda(-variacion) + ', de ' + moneda(anterior.cierre) + ' a ' + moneda(ultimo.cierre) + '.';
    else if (variacion > 0) cambio = 'Entró más dinero del que salió: el disponible subió ' + moneda(variacion) + ', de ' + moneda(anterior.cierre) + ' a ' + moneda(ultimo.cierre) + '.';
    else cambio = 'Entró lo mismo que salió: el disponible se mantuvo en ' + moneda(ultimo.cierre) + '.';

    // ¿Cuántos trimestres seguidos lleva moviéndose en la misma dirección?
    if (variacion !== 0) {
      let racha = 0;
      for (let i = trimestres.length - 1; i > 0; i--) {
        const d = trimestres[i].cierre - trimestres[i - 1].cierre;
        if ((variacion < 0 && d < 0) || (variacion > 0 && d > 0)) racha++; else break;
      }
      if (racha >= 2) cambio += ' Lleva ' + racha + ' trimestres seguidos ' + (variacion < 0 ? 'bajando.' : 'subiendo.');
    }
  }

  return {
    estado: estado, estadoTexto: estadoTexto, frase: frase, detalle: detalle, cambio: cambio,
    total: total, salidaMensual: salidaMensual, meses: meses, metaMonto: metaMonto,
    trimestres: trimestres, ultimo: ultimo
  };
}

// ---------- Mostrar ----------

// Dibujos pequeños para el estado. Cada estado tiene una FORMA distinta,
// para que no dependa solo del color.
const ICONOS = {
  bien: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.4 14.2L6.4 12l1.4-1.4 2.8 2.8 5.6-5.6L17.6 9.2z',
  atencion: 'M12 2.5 1.5 21h21zM11 9.5h2v6h-2zm0 7.5h2v2h-2z',
  critico: 'M8 2h8l6 6v8l-6 6H8l-6-6V8zm3 5v7h2V7zm0 8.5v2h2v-2z',
  neutro: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-5 9h10v2H7z'
};

let vistaActual = null; // lo último que se mostró (para redibujar el gráfico si cambia el tamaño)

function mostrarPanel(datos) {
  const v = interpretar(datos);
  const l = datos.liquidez;
  const corte = aFecha(datos.fecha_corte);
  vistaActual = v;

  // Encabezado
  $('nombre-org').textContent = datos.organizacion;
  $('encabezado-sub').textContent = 'Liquidez y caja al ' + fechaLarga(corte) + '. Uso interno.';

  // Conclusión
  $('estado').className = 'estado estado-' + v.estado;
  $('estado-texto').textContent = v.estadoTexto;
  const icono = crearSVG('svg', { viewBox: '0 0 24 24', width: '20', height: '20' });
  icono.appendChild(crearSVG('path', { d: ICONOS[v.estado] }));
  $('estado-icono').replaceChildren(icono);
  $('conclusion-frase').textContent = v.frase;
  $('conclusion-detalle').textContent = v.detalle;
  dibujarRegla(v);

  // Las tres cifras
  $('fecha-corte').textContent = fechaLarga(corte);
  $('liquidez-total').textContent = moneda(v.total);
  $('liquidez-detalle').textContent = 'Banco ' + moneda(centavos(l.banco)) + ' más caja chica ' + moneda(centavos(l.caja_chica)) + '.';
  $('fondos-libres').textContent = moneda(centavos(l.fondos_libres));
  $('fondos-detalle').textContent = centavos(l.fondos_restringidos) === 0
    ? 'Ningún donante ha restringido fondos.'
    : 'Restringidos por donantes: ' + moneda(centavos(l.fondos_restringidos)) + '.';
  $('salida-promedio').textContent = moneda(v.salidaMensual);
  $('salida-detalle').textContent = 'Promedio de ' + l.base_promedio.replace(/(\d{4})-(T\d)/g, '$2 $1') + '.';

  // Qué cambió
  $('trimestre-actual').textContent = v.ultimo.nombre;
  $('cambio-frase').textContent = v.cambio;
  $('cambio-entradas').textContent = moneda(v.ultimo.entradas);
  $('cambio-salidas').textContent = moneda(v.ultimo.salidas);
  $('cambio-neto').textContent = monedaConSigno(v.ultimo.neto);

  // Evolución: leyenda, gráfico y tabla
  const leyenda = $('leyenda-grafico');
  leyenda.replaceChildren(
    crear('span', 'clave-linea'), document.createTextNode(' Dinero disponible '),
    crear('span', 'clave-linea-meta'), document.createTextNode(' Meta de reserva: ' + moneda(v.metaMonto))
  );
  dibujarTabla(v);

  // Ayuda y pie
  $('ayuda-meta').textContent = 'Tener disponible lo que sale en ' + textoMeses(META_MESES) + ' (hoy, ' + moneda(v.metaMonto) +
    '). Con menos de ' + textoMeses(MINIMO_MESES) + ' la reserva se marca como crítica. La junta puede cambiar estos criterios.';
  const cierre = proximoCierre(corte);
  $('nota-generado').textContent = 'Datos preparados el ' + fechaLarga(aFecha(datos.generado)) +
    ' a partir de la contabilidad de la fundación. Próximo corte: ' + fechaLarga(cierre) + '.';

  // Aviso si ya pasó el siguiente cierre (más unos días de gracia) y no hay datos nuevos
  const limite = new Date(cierre.getFullYear(), cierre.getMonth(), cierre.getDate() + DIAS_DE_GRACIA);
  const aviso = $('aviso-antiguedad');
  if (new Date() > limite) {
    aviso.textContent = 'Estas cifras son del corte al ' + fechaLarga(corte) + '. Ya debería haber una actualización más reciente: pídela a la Dirección de Finanzas.';
    aviso.hidden = false;
  } else {
    aviso.hidden = true;
  }

  $('seccion-acceso').hidden = true;
  $('panel').hidden = false;
  dibujarGrafico(v); // al final, cuando el panel ya es visible y se conoce su ancho
}

// Regla de meses: una barra de 0 a 6 meses con la marca de la meta
function dibujarRegla(v) {
  const meses = (v.meses === null || v.total <= 0) ? 0 : v.meses;
  const proporcion = Math.min(1, meses / ESCALA_MESES);
  $('regla').className = 'regla regla-' + v.estado;
  $('regla-relleno').style.width = (proporcion * 100) + '%';
  $('regla-relleno').hidden = meses === 0; // sin dinero o sin dato: la barra queda vacía
  $('regla-meta').style.left = (META_MESES / ESCALA_MESES * 100) + '%';

  // Números de la escala: 0, 1, 2 … 6
  const escala = $('regla-escala');
  escala.replaceChildren();
  for (let m = 0; m <= ESCALA_MESES; m++) {
    const marca = crear('span', m === META_MESES ? 'regla-numero regla-numero-meta' : 'regla-numero',
      m === ESCALA_MESES ? m + '+' : String(m));
    marca.style.left = (m / ESCALA_MESES * 100) + '%';
    escala.appendChild(marca);
  }

  const alcance = v.meses === null ? 'No se puede estimar'
    : v.total <= 0 ? 'No alcanza para ningún mes'
    : 'Alcanza para ' + (v.meses < 1 ? 'menos de un mes' : textoMeses(v.meses));
  $('regla-leyenda-valor').textContent = alcance;
  $('regla-leyenda-meta').textContent = 'Meta: ' + textoMeses(META_MESES);
  $('regla').setAttribute('aria-label', alcance + '. Meta de reserva: ' + textoMeses(META_MESES) + '.');
}

// Tabla por trimestre, del más reciente al más antiguo
function dibujarTabla(v) {
  const tabla = $('tabla-trimestres');
  const titulo = tabla.querySelector('caption');
  tabla.replaceChildren(titulo);

  const cabeza = crear('thead');
  const filaCabeza = crear('tr');
  ['Trimestre', 'Entró', 'Salió', 'Diferencia', 'Al cierre'].forEach(function (texto, i) {
    // "Diferencia" se oculta en pantallas angostas (se deduce de las otras dos)
    const th = crear('th', i === 0 ? '' : (i === 3 ? 'numero columna-opcional' : 'numero'), texto);
    th.scope = 'col';
    filaCabeza.appendChild(th);
  });
  cabeza.appendChild(filaCabeza);

  const cuerpo = crear('tbody');
  v.trimestres.slice().reverse().forEach(function (t) {
    const fila = crear('tr');
    const th = crear('th', '', t.nombre);
    th.scope = 'row';
    fila.appendChild(th);
    fila.appendChild(crear('td', 'numero', formatoNumero.format(t.entradas / 100)));
    fila.appendChild(crear('td', 'numero', formatoNumero.format(t.salidas / 100)));
    fila.appendChild(crear('td', 'numero columna-opcional', (t.neto < 0 ? '−' : t.neto > 0 ? '+' : '') + formatoNumero.format(Math.abs(t.neto) / 100)));
    fila.appendChild(crear('td', 'numero fuerte', (t.cierre < 0 ? '−' : '') + formatoNumero.format(Math.abs(t.cierre) / 100)));
    cuerpo.appendChild(fila);
  });
  tabla.appendChild(cabeza);
  tabla.appendChild(cuerpo);
}

// ---------- Gráfico (dibujado aquí mismo, sin librerías externas) ----------

// Elige una escala "redonda" para el eje vertical: 0, 500, 1,000 …
function escalaRedonda(minimo, maximo) {
  const rango = Math.max(maximo - Math.min(0, minimo), 1);
  const bruto = rango / 4;                                   // unas 4 divisiones
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 2.5, 5, 10].map(function (m) { return m * potencia; }).find(function (p) { return p >= bruto; });
  // Si lo negativo es muy pequeño frente al paso, el eje empieza en 0 igual
  const desde = minimo >= -paso * 0.1 ? 0 : Math.floor(minimo / paso) * paso;
  const hasta = Math.ceil(maximo / paso) * paso;
  const marcas = [];
  for (let valor = desde; valor <= hasta + paso / 2; valor += paso) marcas.push(valor);
  return { desde: desde, hasta: marcas[marcas.length - 1], marcas: marcas };
}

function dibujarGrafico(v) {
  const caja = $('grafico');
  const globo = $('grafico-globo');
  const viejo = caja.querySelector('svg');
  if (viejo) viejo.remove();
  globo.hidden = true;

  const ancho = caja.clientWidth;
  if (!ancho) return; // el panel todavía no es visible
  const angosto = ancho < 520;
  const alto = angosto ? 240 : 300;
  const margen = { arriba: 28, derecha: 16, abajo: 44, izquierda: angosto ? 44 : 56 };
  const anchoZona = ancho - margen.izquierda - margen.derecha;
  const altoZona = alto - margen.arriba - margen.abajo;

  // Los valores se dibujan en balboas (no en centavos)
  const puntos = v.trimestres.map(function (t) { return t.cierre / 100; });
  const meta = v.metaMonto / 100;
  const escala = escalaRedonda(Math.min.apply(null, puntos), Math.max.apply(null, puntos.concat([meta])));
  const x = function (i) { return margen.izquierda + (puntos.length === 1 ? anchoZona / 2 : (i / (puntos.length - 1)) * anchoZona); };
  const y = function (valor) { return margen.arriba + altoZona - ((valor - escala.desde) / (escala.hasta - escala.desde)) * altoZona; };

  const svg = crearSVG('svg', { width: ancho, height: alto, viewBox: '0 0 ' + ancho + ' ' + alto, role: 'img',
    'aria-label': 'Gráfico del dinero disponible al cierre de cada trimestre. Los mismos datos están en la tabla de abajo.' });

  // Líneas de referencia horizontales y sus valores
  escala.marcas.forEach(function (valor) {
    svg.appendChild(crearSVG('line', { class: valor === 0 ? 'g-base' : 'g-cuadricula', x1: margen.izquierda, x2: ancho - margen.derecha, y1: y(valor), y2: y(valor) }));
    const texto = crearSVG('text', { class: 'g-eje', x: margen.izquierda - 8, y: y(valor) + 4, 'text-anchor': 'end' });
    texto.textContent = formatoEntero.format(valor);
    svg.appendChild(texto);
  });

  // Trimestres en el eje horizontal: "T3" y debajo el año cuando cambia
  v.trimestres.forEach(function (t, i) {
    const partes = t.nombre.split(' '); // ["T3", "2026"]
    const texto = crearSVG('text', { class: 'g-eje', x: x(i), y: alto - margen.abajo + 18, 'text-anchor': 'middle' });
    texto.textContent = partes[0];
    svg.appendChild(texto);
    if (i === 0 || partes[0] === 'T1') {
      const anio = crearSVG('text', { class: 'g-eje g-eje-anio', x: x(i), y: alto - margen.abajo + 34, 'text-anchor': 'middle' });
      anio.textContent = partes[1];
      svg.appendChild(anio);
    }
  });

  // Meta de reserva: línea fina de lado a lado (su valor está en la leyenda)
  svg.appendChild(crearSVG('line', { class: 'g-meta', x1: margen.izquierda, x2: ancho - margen.derecha, y1: y(meta), y2: y(meta) }));

  // Área suave bajo la línea y la línea del dinero disponible
  const trazo = puntos.map(function (valor, i) { return (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(valor).toFixed(1); }).join(' ');
  const base = y(Math.max(0, escala.desde));
  svg.appendChild(crearSVG('path', { class: 'g-area', d: trazo + ' L' + x(puntos.length - 1).toFixed(1) + ' ' + base + ' L' + x(0).toFixed(1) + ' ' + base + ' Z' }));
  svg.appendChild(crearSVG('path', { class: 'g-linea', d: trazo }));

  // Línea vertical que acompaña al cursor
  const guia = crearSVG('line', { class: 'g-guia', y1: margen.arriba, y2: margen.arriba + altoZona, visibility: 'hidden' });
  svg.appendChild(guia);

  // Puntos. Solo se rotulan dos: el más alto y el último (los demás están en la tabla).
  const indiceMaximo = puntos.indexOf(Math.max.apply(null, puntos));
  const indiceUltimo = puntos.length - 1;
  const marcasPunto = puntos.map(function (valor, i) {
    const punto = crearSVG('circle', { class: 'g-punto', cx: x(i), cy: y(valor), r: 4.5 });
    svg.appendChild(punto);
    if (i === indiceMaximo || i === indiceUltimo) {
      const esBorde = i === indiceUltimo && puntos.length > 1;
      const rotulo = crearSVG('text', { class: 'g-rotulo', x: esBorde ? x(i) + 4 : x(i), y: y(valor) - 12, 'text-anchor': esBorde ? 'end' : (i === 0 ? 'start' : 'middle') });
      rotulo.textContent = moneda(v.trimestres[i].cierre);
      svg.appendChild(rotulo);
    }
    return punto;
  });

  // Zonas invisibles para pasar el cursor, tocar o llegar con el teclado
  function resaltar(i) {
    const t = v.trimestres[i];
    guia.setAttribute('x1', x(i)); guia.setAttribute('x2', x(i)); guia.setAttribute('visibility', 'visible');
    marcasPunto.forEach(function (p, j) { p.setAttribute('r', j === i ? 6 : 4.5); });
    globo.replaceChildren(
      crear('p', 'globo-titulo', t.nombre),
      filaGlobo('Al cierre', moneda(t.cierre), true),
      filaGlobo('Entró', moneda(t.entradas)),
      filaGlobo('Salió', moneda(t.salidas))
    );
    globo.hidden = false;
    // El globo se pone al lado del punto, sin salirse del gráfico
    const anchoGlobo = globo.offsetWidth;
    let izquierda = x(i) + 12;
    if (izquierda + anchoGlobo > ancho) izquierda = x(i) - 12 - anchoGlobo;
    globo.style.left = Math.max(0, izquierda) + 'px';
    globo.style.top = margen.arriba + 'px';
  }
  function soltar() {
    guia.setAttribute('visibility', 'hidden');
    marcasPunto.forEach(function (p) { p.setAttribute('r', 4.5); });
    globo.hidden = true;
  }
  const anchoBanda = puntos.length === 1 ? anchoZona : anchoZona / (puntos.length - 1);
  v.trimestres.forEach(function (t, i) {
    const zona = crearSVG('rect', { class: 'g-zona', x: x(i) - anchoBanda / 2, y: margen.arriba, width: anchoBanda, height: altoZona,
      tabindex: '0', role: 'img', 'aria-label': t.nombre + ': ' + moneda(t.cierre) + ' al cierre. Entró ' + moneda(t.entradas) + ' y salió ' + moneda(t.salidas) + '.' });
    zona.addEventListener('pointerenter', function () { resaltar(i); });
    zona.addEventListener('pointerdown', function () { resaltar(i); });
    zona.addEventListener('focus', function () { resaltar(i); });
    zona.addEventListener('blur', soltar);
    svg.appendChild(zona);
  });
  svg.addEventListener('pointerleave', soltar);

  caja.insertBefore(svg, globo);
}

function filaGlobo(etiqueta, valor, fuerte) {
  const fila = crear('p', 'globo-fila');
  fila.appendChild(crear('span', fuerte ? 'globo-valor fuerte' : 'globo-valor', valor));
  fila.appendChild(crear('span', 'globo-etiqueta', etiqueta));
  return fila;
}

// ---------- Inicio ----------

let paquete = null;      // el archivo cifrado, una vez descargado
let datosAbiertos = null; // los datos descifrados (solo en memoria)

$('form-acceso').addEventListener('submit', async function (evento) {
  evento.preventDefault();
  const mensaje = $('mensaje-acceso');
  const boton = $('boton-entrar');
  mensaje.textContent = '';
  boton.disabled = true;
  boton.textContent = 'Abriendo…';
  try {
    // 1. Descargar el archivo cifrado
    if (!window.crypto || !crypto.subtle) throw new Error('sin-cifrado');
    if (!paquete) {
      const respuesta = await fetch('data/junta.cifrado.json', { cache: 'no-store' });
      if (!respuesta.ok) throw new Error('sin-archivo');
      paquete = await respuesta.json();
    }
    // 2. Descifrar con la contraseña
    let datos;
    try {
      datos = await descifrar(paquete, $('clave').value);
    } catch (e) {
      throw new Error('clave');
    }
    // 3. Mostrar
    datosAbiertos = datos;
    $('clave').value = '';
    mostrarPanel(datosAbiertos);
    $('titulo-conclusion').focus();
    window.scrollTo(0, 0);
  } catch (e) {
    // Olvidamos el archivo descargado: si se publicó uno nuevo mientras la
    // página estaba abierta, el siguiente intento lo vuelve a descargar.
    paquete = null;
    if (e.message === 'sin-archivo') mensaje.textContent = 'Todavía no hay datos publicados para la junta.';
    else if (e.message === 'sin-cifrado') mensaje.textContent = 'Este navegador no puede abrir el panel. Entra desde la dirección https:// del panel o usa un navegador actualizado.';
    else if (e.message === 'clave') mensaje.textContent = 'La contraseña no es correcta. Revisa mayúsculas, espacios y guiones.';
    else mensaje.textContent = 'No se pudo mostrar el panel. Avisa a la Dirección de Finanzas.';
  } finally {
    boton.disabled = false;
    boton.textContent = 'Abrir el panel';
  }
});

// Mostrar u ocultar lo que se escribe en la contraseña
$('boton-ver-clave').addEventListener('click', function () {
  const campo = $('clave');
  const visible = campo.type === 'text';
  campo.type = visible ? 'password' : 'text';
  this.textContent = visible ? 'Mostrar' : 'Ocultar';
  this.setAttribute('aria-pressed', String(!visible));
});

// Imprimir o guardar en PDF (para el acta o la carpeta de la reunión)
$('boton-imprimir').addEventListener('click', function () { window.print(); });

// Cerrar: borra los datos de la memoria y vuelve a pedir la contraseña
$('boton-salir').addEventListener('click', function () {
  datosAbiertos = null;
  vistaActual = null;
  const svg = $('grafico').querySelector('svg');
  if (svg) svg.remove();
  $('tabla-trimestres').replaceChildren($('tabla-trimestres').querySelector('caption'));
  ['conclusion-frase', 'conclusion-detalle', 'cambio-frase', 'liquidez-total', 'fondos-libres', 'salida-promedio',
    'liquidez-detalle', 'fondos-detalle', 'salida-detalle', 'cambio-entradas', 'cambio-salidas', 'cambio-neto']
    .forEach(function (id) { $(id).textContent = ''; });
  $('encabezado-sub').textContent = 'Liquidez y caja de la fundación. Uso interno.';
  $('panel').hidden = true;
  $('seccion-acceso').hidden = false;
  $('clave').focus();
});

// Si cambia el ancho de la ventana (o se gira el celular), el gráfico se redibuja
let esperaRedibujo = null;
window.addEventListener('resize', function () {
  clearTimeout(esperaRedibujo);
  esperaRedibujo = setTimeout(function () { if (vistaActual) dibujarGrafico(vistaActual); }, 150);
});
