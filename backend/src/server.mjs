
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import db from './config/db.mjs';
import authRouter from './routes/auth.mjs';
import turnosRouter from './routes/turnos.mjs';

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

// Rutas de autenticación
app.use('/api/auth', authRouter);
app.use('/api/turnos', turnosRouter);
// Ruta técnica de estado de VolunTurno
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

// Iniciar backend
async function iniciarServidor() {
  try {
    await db.query('SELECT 1');

    app.listen(PORT, () => {
      console.log('================================');
      console.log('       VOLUNTURNO BACKEND');
      console.log('================================');
      console.log('MySQL conectado correctamente');
      console.log(`API: http://localhost:${PORT}`);
      console.log(`Estado: http://localhost:${PORT}/api/volunturno/estado`);
      console.log('Autenticación: configurada');
      console.log('================================');
    });

  } catch (error) {
    console.error('Error de conexión:', error.message);
    process.exit(1);
  }
}

iniciarServidor();
