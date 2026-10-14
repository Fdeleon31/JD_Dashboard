// =============================================================
// servidor.js
// Servidor web mínimo para ver el portal en tu computadora.
// No necesita instalar paquetes: solo usa lo que trae Node.js.
//
// Uso:      node servidor.js
// Luego abre http://localhost:8000 en el navegador.
// Para detenerlo: Ctrl + C
// =============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PUERTO = 8000;
const RAIZ = __dirname; // la carpeta donde está este archivo

// Tipo de contenido según la extensión del archivo
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const servidor = http.createServer(function (pedido, respuesta) {
  let ruta = decodeURIComponent(new URL(pedido.url, 'http://localhost').pathname);
  if (ruta === '/') ruta = '/index.html';

  // Ruta completa del archivo, sin permitir salir de la carpeta del proyecto
  const archivo = path.join(RAIZ, path.normalize(ruta));
  if (!archivo.startsWith(RAIZ)) {
    respuesta.writeHead(403);
    return respuesta.end('Prohibido');
  }

  fs.readFile(archivo, function (error, contenido) {
    if (error) {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return respuesta.end('No encontrado: ' + ruta);
    }
    const tipo = TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream';
    respuesta.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
    respuesta.end(contenido);
  });
});

servidor.listen(PUERTO, function () {
  console.log('Portal disponible en http://localhost:' + PUERTO + '  (Ctrl + C para detener)');
});
