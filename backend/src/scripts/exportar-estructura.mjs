import db from '../config/db.mjs';
import fs from 'node:fs/promises';

async function exportarEstructura() {
  try {
    console.log('Conectando a MySQL...');

    const [tablas] = await db.query('SHOW TABLES');

    let contenido = [
      '-- Estructura de la base de datos VolunTurno',
      '-- Contiene solamente las tablas, sin registros',
      'SET FOREIGN_KEY_CHECKS = 0;',
      ''
    ].join('\n');

    for (const fila of tablas) {
      const nombre = String(Object.values(fila)[0]);
      const nombreSeguro = nombre.replace(/`/g, '``');

      const [resultado] = await db.query(
        `SHOW CREATE TABLE \`${nombreSeguro}\``
      );

      const sql = resultado[0]['Create Table'];

      contenido += `\n${sql};\n`;

      console.log(`Tabla exportada: ${nombre}`);
    }

    contenido += '\nSET FOREIGN_KEY_CHECKS = 1;\n';

    await fs.writeFile(
      'volunturno_estructura.sql',
      contenido,
      'utf8'
    );

    console.log('\nExportación completada.');
    console.log('Archivo: volunturno_estructura.sql');

  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

exportarEstructura();
