// =============================================================
// cifrar-junta.js
// Prepara los datos de la página de la junta (junta.html).
//
// Toma privado/resumen-junta.json (que nunca se publica), lo CIFRA
// con una contraseña y guarda el resultado en data/junta.cifrado.json.
// Ese archivo sí se publica, pero sin la contraseña es ilegible.
// La página junta.html pide la contraseña y descifra los datos en el
// navegador de cada miembro de la junta.
//
// Uso:  node cifrar-junta.js
//       Te pide la contraseña dos veces (no se ve al escribir).
//
// Importante:
//   - Usa una contraseña larga (mínimo 12 caracteres). Una frase sirve:
//     "wonder-corre-por-fundacancer-2025".
//   - La contraseña no se guarda en ningún archivo. Si la pierdes, vuelve
//     a correr este script con una nueva y compártela con la junta.
//   - Si alguien deja la junta, cambia la contraseña: corre este script
//     de nuevo y publica.
// =============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const RAIZ = __dirname;
const ORIGEN = path.join(RAIZ, 'privado', 'resumen-junta.json');
const DESTINO = path.join(RAIZ, 'data', 'junta.cifrado.json');

// Parámetros de cifrado. El navegador (js/junta.js) usa exactamente los mismos.
const ITERACIONES = 600000;   // más iteraciones = más lento probar contraseñas por fuerza bruta
const LARGO_MINIMO = 12;

// Una sola conexión con la terminal para las dos preguntas.
// Mientras se escribe la contraseña, no se muestra nada en pantalla.
const terminal = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let ocultar = false;
terminal._writeToOutput = function (texto) { if (!ocultar) process.stdout.write(texto); };

// Las líneas escritas se guardan en una fila y cada pregunta toma la siguiente
const lineas = [];
let esperando = null;
terminal.on('line', function (linea) {
  if (esperando) { const r = esperando; esperando = null; r(linea); } else lineas.push(linea);
});

function pedirOculto(pregunta) {
  process.stdout.write(pregunta);
  ocultar = true;
  return new Promise(function (resolver) {
    const terminar = function (respuesta) { ocultar = false; process.stdout.write('\n'); resolver(respuesta); };
    if (lineas.length > 0) terminar(lineas.shift()); else esperando = terminar;
  });
}

async function principal() {
  if (!fs.existsSync(ORIGEN)) {
    console.error('No existe privado/resumen-junta.json. Corre primero: node importar-excel.js');
    process.exit(1);
  }
  const texto = fs.readFileSync(ORIGEN, 'utf8');
  const resumen = JSON.parse(texto);

  const clave = await pedirOculto('Contraseña para la junta: ');
  if (clave.length < LARGO_MINIMO) {
    console.error('La contraseña debe tener al menos ' + LARGO_MINIMO + ' caracteres. No se cifró nada.');
    terminal.close();
    process.exit(1);
  }
  const repetida = await pedirOculto('Repite la contraseña: ');
  terminal.close();
  if (clave !== repetida) {
    console.error('Las contraseñas no coinciden. No se cifró nada.');
    process.exit(1);
  }

  // 1. De la contraseña sacamos una llave de 256 bits (PBKDF2 con SHA-256).
  //    La "sal" aleatoria hace que la misma contraseña dé llaves distintas cada vez.
  const sal = crypto.randomBytes(16);
  const llave = crypto.pbkdf2Sync(clave, sal, ITERACIONES, 32, 'sha256');

  // 2. Ciframos con AES-256-GCM, que además detecta si alguien modificó el archivo.
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', llave, iv);
  const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final(), cifrador.getAuthTag()]);

  // Solo la fecha de corte queda visible (sirve para revisar que esté al día)
  fs.writeFileSync(DESTINO, JSON.stringify({
    version: 1,
    fecha_corte: resumen.fecha_corte,
    iteraciones: ITERACIONES,
    sal: sal.toString('base64'),
    iv: iv.toString('base64'),
    datos: cifrado.toString('base64')
  }, null, 2) + '\n', 'utf8');

  console.log('Listo: data/junta.cifrado.json (corte ' + resumen.fecha_corte + ').');
  console.log('La junta entra en junta.html con esa contraseña. Compártela por un canal privado, no por el mismo correo que el enlace.');
}

principal();
