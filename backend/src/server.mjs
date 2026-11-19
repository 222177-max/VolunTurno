
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import db from './config/db.mjs';
import authRouter from './routes/auth.mjs';
import turnosRouter from './routes/turnos.mjs';
import personalRouter from './routes/personal.mjs';
import asignacionesRouter from './routes/asignaciones.mjs';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Comprobar que exista la clave de sesión
if (!process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32) {
  console.error('ERROR: Configura JWT_SECRET en .env');
  process.exit(1);
}

// Permitir comunicación con Astro
app.use(cors({
  origin: 'http://localhost:4321',
  credentials: true
}));

// Leer JSON enviado por el frontend
app.use(express.json({ limit: '100kb' }));

// Leer cookies de sesión
app.use(cookieParser());

// ========================================
// RUTAS DEL SISTEMA VOLUNTURNO
// ========================================

// Autenticación de usuarios
app.use('/api/auth', authRouter);

// Gestión de turnos
app.use('/api/turnos', turnosRouter);

// Gestión de personal (voluntarios)
app.use('/api/personal', personalRouter);
app.use('/api/asignaciones', asignacionesRouter);

// ========================================
// RUTA TÉCNICA DE ESTADO DE VOLUNTURNO
// ========================================

app.get('/api/volunturno/estado', async (req, res) => {
  try {
    const [usuarios] = await db.execute(
      'SELECT COUNT(*) AS total FROM usuarios'
    );

    const [turnos] = await db.execute(
      'SELECT COUNT(*) AS total FROM turnos'
    );

    res.json({
      estado: 'ok',
      proyecto: 'VolunTurno',
      backend: 'Node.js + Express',
      baseDeDatos: 'MySQL conectado correctamente',
      usuariosRegistrados: usuarios[0].total,
      turnosRegistrados: turnos[0].total
    });

  } catch (error) {
    console.error('Error MySQL:', error.message);

    res.status(503).json({
      estado: 'error',
      mensaje: 'No se pudo consultar MySQL.'
    });
  }
});

// ========================================
// INICIAR BACKEND
// ========================================

async function iniciarServidor() {
  try {
    // Verificar conexión a MySQL
    await db.query('SELECT 1');

    app.listen(PORT, () => {
      console.log('================================');
      console.log('       VOLUNTURNO BACKEND');
      console.log('================================');
      console.log('MySQL conectado correctamente');
      console.log(`API: http://localhost:${PORT}`);
      console.log(`Estado: http://localhost:${PORT}/api/volunturno/estado`);
      console.log('Autenticación: configurada');
      console.log('Turnos: configurados');
      console.log('Personal (voluntarios): configurado');
      console.log('================================');
    });

  } catch (error) {
    console.error('Error de conexión:', error.message);
    process.exit(1);
  }
}

iniciarServidor();
