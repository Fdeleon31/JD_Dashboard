// =============================================================
// actualizar.js
// Un solo comando para actualizar el panel de la junta.
// Corre, en orden, los tres pasos de siempre y se detiene si uno falla:
//
//   1. importar-excel.js  -> lee la contabilidad y revisa los controles
//   2. cifrar-junta.js    -> pide la contraseña de la junta y cifra los datos
//   3. validar.js         -> confirma que todo está listo para publicar
//
// Uso:  node herramientas/actualizar.js
// Antes: deja en privado/ el .xlsx descargado del Google Sheet (uno solo).
// =============================================================

const path = require('path');
const { spawnSync } = require('child_process');

const pasos = [
  ['importar-excel.js', 'Leyendo la contabilidad'],
  ['cifrar-junta.js', 'Cifrando los datos para la junta'],
  ['validar.js', 'Revisando que todo esté listo']
];

pasos.forEach(function (paso, i) {
  console.log('\n===== Paso ' + (i + 1) + ' de ' + pasos.length + ': ' + paso[1] + ' =====');
  // stdio: 'inherit' deja que el paso use esta misma terminal (para escribir la contraseña)
  const resultado = spawnSync(process.execPath, [path.join(__dirname, paso[0])], { stdio: 'inherit' });
  if (resultado.status !== 0) {
    console.error('\nSe detuvo en el paso ' + (i + 1) + ' (' + paso[0] + '). No publiques hasta corregirlo.');
    process.exit(1);
  }
});

console.log('\nListo. Revisa el panel con:  node herramientas/servidor.js');
console.log('Para publicar, en la consola:');
console.log('  git status                 (no debe aparecer nada de privado/)');
console.log('  git add docs/data/junta.cifrado.json');
console.log('  git commit -m "Actualización corte DD/MM/AAAA"');
console.log('  git push');
