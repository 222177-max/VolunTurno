
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import db from '../config/db.mjs';

const rl = readline.createInterface({
  input: stdin,
  output: stdout
});

async function crearCoordinador() {
  try {
    console.log('\n================================');
    console.log('     VOLUNTURNO - COORDINADOR');
    console.log('================================\n');

    const nombre = (
      await rl.question('Nombre: ')
    ).trim();

    const apellido = (
      await rl.question('Apellido: ')
    ).trim();

    const correo = (
      await rl.question('Correo electrónico: ')
    ).trim().toLowerCase();

    // Validaciones
    if (!nombre || !apellido) {
      throw new Error('El nombre y apellido son obligatorios.');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      throw new Error('El correo electrónico no es válido.');
    }

    // Verificar si el correo ya existe
    const [existentes] = await db.execute(
      'SELECT id_usuario FROM usuarios WHERE correo = ?',
      [correo]
    );

    if (existentes.length > 0) {
      throw new Error('Ya existe una cuenta con ese correo.');
    }

    // Generar contraseña temporal
    const passwordTemporal = randomBytes(18)
      .toString('base64url');

    // Proteger contraseña con hash
    const passwordHash = await bcrypt.hash(
      passwordTemporal,
      12
    );

    // Registrar coordinador en MySQL
    await db.execute(
      `INSERT INTO usuarios
       (nombre, apellido, correo, password_hash,
        rol, activo, requiere_cambio_password)
       VALUES (?, ?, ?, ?, 'coordinador', 1, 1)`,
      [nombre, apellido, correo, passwordHash]
    );

    console.log('\n================================');
    console.log('  COORDINADOR CREADO CORRECTAMENTE');
    console.log('================================');
    console.log('Nombre:', nombre, apellido);
    console.log('Correo:', correo);
    console.log('Rol: coordinador');
    console.log('Contraseña temporal:', passwordTemporal);
    console.log('Cambio de contraseña: obligatorio');
    console.log('================================');
    console.log('Guarda la contraseña en un lugar seguro.');

  } catch (error) {
    console.error('\nERROR:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await db.end();
  }
}

crearCoordinador();
