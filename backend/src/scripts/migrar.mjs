import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const carpeta = join(raiz, 'migrations');
const baseline = process.argv.includes('--baseline');
const tablasIniciales = ['usuarios', 'equipos', 'turnos', 'disponibilidades', 'notificaciones', 'equipo_integrantes', 'asignaciones', 'asistencias'];
const checksum = (s) => createHash('sha256').update(s).digest('hex');
const identificador = (s) => '`' + s.replaceAll('`', '``') + '`';

// Migraciones de este proyecto: sentencias SQL simples, separadas por ';'.
// No incluir procedimientos, triggers ni textos con punto y coma dentro.
function sentencias(sql) {
  return sql.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'));
}

async function ejecutar() {
  if (!process.env.DB_NAME || !process.env.DB_MIGRATION_USER || !process.env.DB_MIGRATION_PASSWORD) {
  throw Error('Configura DB_NAME, DB_MIGRATION_USER y DB_MIGRATION_PASSWORD en backend/.env');
}
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_MIGRATION_USER,
    password: process.env.DB_MIGRATION_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: false
  });
  let bloqueado = false;
  try {
    const [[{ conseguido }]] = await db.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':volunturno_migraciones'), 15) AS conseguido");
    if (conseguido !== 1) throw Error('No se pudo obtener el bloqueo de migraciones');
    bloqueado = true;
    const [archivos] = await Promise.all([readdir(carpeta)]);
    const migraciones = archivos.filter(n => /^\d+_[a-z0-9_-]+\.sql$/i.test(n)).sort();
    if (!migraciones.length) throw Error('No hay migraciones SQL');
    const [existentes] = await db.query('SHOW TABLES');
    const tablas = existentes.map(r => String(Object.values(r)[0]));
    const tieneHistorial = tablas.includes('schema_migrations');
    const tablasApp = tablas.filter(n => n !== 'schema_migrations');
    if (!tieneHistorial) {
      if (baseline) {
        const faltantes = tablasIniciales.filter(t => !tablasApp.includes(t));
        const sobrantes = tablasApp.filter(t => !tablasIniciales.includes(t));
        if (faltantes.length || sobrantes.length) throw Error(`Baseline rechazado. Faltantes: ${faltantes.join(', ') || 'ninguna'}. Otras: ${sobrantes.join(', ') || 'ninguna'}.`);
        // Comparación mínima de columnas y relaciones esperadas del esquema inicial.
        const sqlBase = await readFile(join(carpeta, '001_esquema_inicial.sql'), 'utf8');
        for (const nombre of tablasIniciales) {
          const match = sqlBase.match(new RegExp('CREATE TABLE `'+nombre+'` \\(([\\s\\S]*?)\\) ENGINE=InnoDB'));
          if (!match) throw Error(`No se encontró definición de ${nombre}`);
          const columnas = [...match[1].matchAll(/^\s+`([^`]+)`\s/gm)].map(m=>m[1]);
          const [reales] = await db.query(`SHOW COLUMNS FROM ${identificador(nombre)}`);
          const nombres = reales.map(r=>r.Field);
          if (columnas.length !== nombres.length || columnas.some((c,i)=>c!==nombres[i])) throw Error(`Estructura de columnas distinta en ${nombre}; no se marcará el baseline.`);
        }
      } else if (tablasApp.length) {
        throw Error('La base ya tiene tablas y no tiene historial. NO se modificarán. En tu base original usa npm run db:baseline tras comprobar que corresponde al esquema exportado.');
      }
    } else if (baseline) throw Error('Ya existe historial de migraciones. No necesitas --baseline.');

    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre VARCHAR(255) PRIMARY KEY,
      sha256 CHAR(64) NOT NULL,
      aplicada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    if (baseline) {
      const archivo = '001_esquema_inicial.sql';
      const sql = await readFile(join(carpeta, archivo), 'utf8');
      await db.execute('INSERT INTO schema_migrations (nombre, sha256) VALUES (?, ?)', [archivo, checksum(sql)]);
      console.log('Esquema inicial marcado como existente. No se han recreado las ocho tablas.');
    }
    const [historial] = await db.query('SELECT nombre, sha256 FROM schema_migrations');
    const aplicado = new Map(historial.map(r=>[r.nombre,r.sha256]));
    for (const archivo of migraciones) {
      const sql = await readFile(join(carpeta, archivo), 'utf8');
      const hash = checksum(sql);
      if (aplicado.has(archivo)) {
        if (aplicado.get(archivo) !== hash) throw Error(`Migración modificada después de aplicarse: ${archivo}. Restaura el archivo original.`);
        console.log(`Ya aplicada: ${archivo}`);
        continue;
      }
      if (baseline && archivo === '001_esquema_inicial.sql') continue;
      console.log(`Aplicando: ${archivo}`);
      // DDL en MySQL no es transaccional: si falla, inspeccionar el estado
      // y corregir manualmente antes de reintentar; nunca repetir a ciegas.
      for (const sentencia of sentencias(sql.replace(/^\s*--[^\n]*$/gm, ''))) await db.query(sentencia);
      await db.execute('INSERT INTO schema_migrations (nombre, sha256) VALUES (?, ?)', [archivo, hash]);
      console.log(`Correcto: ${archivo}`);
    }
    console.log('Migraciones al día.');
  } finally {
    if (bloqueado) await db.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':volunturno_migraciones'))").catch(()=>{});
    await db.end();
  }
}
ejecutar().catch(e => { console.error('ERROR:', e.message); process.exitCode = 1; });
