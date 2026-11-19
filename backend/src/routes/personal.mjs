
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import db from '../config/db.mjs';
import { verificarSesion } from './auth.mjs';

const router = Router();

// ==========================================
// PERMISOS DEL COORDINADOR
// ==========================================

function soloCoordinador(req, res, next) {
  if (req.usuario?.rol !== 'coordinador') {
    return res.status(403).json({
      mensaje: 'Solo un coordinador puede gestionar voluntarios.'
    });
  }

  if (Boolean(req.usuario.requiere_cambio_password)) {
    return res.status(403).json({
      mensaje: 'Primero cambia tu contraseña temporal.'
    });
  }

  next();
}

// Limitar la creación de cuentas por seguridad.
const limitarRegistros = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    mensaje: 'Demasiados registros. Intenta nuevamente más tarde.'
  }
});

// ==========================================
// VALIDACIONES
// ==========================================

function nombreValido(valor) {
  return (
    typeof valor === 'string' &&
    valor.trim().length >= 2 &&
    valor.trim().length <= 100
  );
}

function correoValido(valor) {
  return (
    typeof valor === 'string' &&
    valor.trim().length <= 150 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim())
  );
}

function telefonoValido(valor) {
  if (valor === undefined || valor === null || valor === '') {
    return true;
  }

  return (
    typeof valor === 'string' &&
    valor.trim().length <= 20 &&
    /^[+()\d\s.-]+$/.test(valor.trim())
  );
}

// ==========================================
// 1. CONSULTAR VOLUNTARIOS
// GET /api/personal
// ==========================================

router.get(
  '/',
  verificarSesion,
  soloCoordinador,
  async (req, res) => {
    try {
      const [personal] = await db.execute(`
        SELECT
          id_usuario,
          nombre,
          apellido,
          correo,
          rol,
          telefono,
          activo,
          fecha_registro
        FROM usuarios
        WHERE rol IN ('voluntario', 'personal')
          AND activo = 1
        ORDER BY nombre ASC, apellido ASC
      `);

      return res.json({
        estado: 'ok',
        origen: 'mysql',
        total: personal.length,
        personal
      });

    } catch (error) {
      console.error(
        'Error al consultar voluntarios:',
        error.message
      );

      return res.status(500).json({
        estado: 'error',
        mensaje: 'No se pudo cargar el personal.'
      });
    }
  }
);

// ==========================================
// 2. REGISTRAR VOLUNTARIO
// POST /api/personal
// ==========================================

router.post(
  '/',
  verificarSesion,
  soloCoordinador,
  limitarRegistros,
  async (req, res) => {
    try {
      const {
        nombre,
        apellido,
        correo,
        telefono
      } = req.body ?? {};

      // Validar los datos antes de guardarlos.
      if (
        !nombreValido(nombre) ||
        !nombreValido(apellido) ||
        !correoValido(correo) ||
        !telefonoValido(telefono)
      ) {
        return res.status(400).json({
          mensaje:
            'Revisa el nombre, apellido, correo y teléfono.'
        });
      }

      const nombreLimpio = nombre.trim();
      const apellidoLimpio = apellido.trim();
      const correoLimpio = correo.trim().toLowerCase();

      const telefonoLimpio =
        typeof telefono === 'string' && telefono.trim()
          ? telefono.trim()
          : null;

      // Generar una contraseña temporal aleatoria.
      // No se almacena en texto plano.
      const passwordTemporal =
        `${randomBytes(18).toString('base64url')}#9aA`;

      // Generar el hash con bcrypt.
      const passwordHash = await bcrypt.hash(
        passwordTemporal,
        12
      );

      // Registrar al usuario en MySQL.
      // Todos los nuevos integrantes tendrán rol voluntario.
      const [resultado] = await db.execute(
        `INSERT INTO usuarios (
          nombre,
          apellido,
          correo,
          password_hash,
          rol,
          telefono,
          activo,
          requiere_cambio_password
        )
        VALUES (?, ?, ?, ?, 'voluntario', ?, 1, 1)`,
        [
          nombreLimpio,
          apellidoLimpio,
          correoLimpio,
          passwordHash,
          telefonoLimpio
        ]
      );

      // Evitar que la respuesta con la contraseña temporal
      // se almacene en caché.
      res.set('Cache-Control', 'no-store');

      // La contraseña temporal se devuelve una sola vez,
      // exclusivamente al coordinador autenticado.
      return res.status(201).json({
        estado: 'ok',
        mensaje: 'Voluntario registrado correctamente.',
        usuario: {
          id_usuario: resultado.insertId,
          nombre: nombreLimpio,
          apellido: apellidoLimpio,
          correo: correoLimpio,
          telefono: telefonoLimpio,
          rol: 'voluntario',
          activo: 1,
          requiere_cambio_password: true
        },
        passwordTemporal
      });

    } catch (error) {
      // El correo ya existe en la tabla usuarios.
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          estado: 'error',
          mensaje:
            'Ya existe una cuenta registrada con ese correo.'
        });
      }

      console.error(
        'Error al registrar voluntario:',
        error.message
      );

      return res.status(500).json({
        estado: 'error',
        mensaje: 'No se pudo registrar el voluntario.'
      });
    }
  }
);

/**
 * ACTUALIZAR DATOS DE UN VOLUNTARIO
 * PUT /api/personal/:id
 *
 * Solo un coordinador autenticado puede editar.
 */
router.put(
  '/:id',
  verificarSesion,
  soloCoordinador,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      // Validar el identificador.
      if (
        !Number.isSafeInteger(id) ||
        id <= 0
      ) {
        return res.status(400).json({
          mensaje: 'El identificador del voluntario no es válido.'
        });
      }

      const {
        nombre,
        apellido,
        correo,
        telefono
      } = req.body ?? {};

      // Reutilizar las validaciones existentes.
      if (
        !nombreValido(nombre) ||
        !nombreValido(apellido) ||
        !correoValido(correo) ||
        !telefonoValido(telefono)
      ) {
        return res.status(400).json({
          mensaje: 'Revisa los datos ingresados.'
        });
      }

      // Comprobar que exista un voluntario con ese ID.
      const [usuarios] = await db.execute(
        `SELECT id_usuario
         FROM usuarios
         WHERE id_usuario = ?
           AND rol IN ('voluntario', 'personal')
         LIMIT 1`,
        [id]
      );

      if (usuarios.length === 0) {
        return res.status(404).json({
          mensaje: 'No se encontró el voluntario.'
        });
      }

      const nombreLimpio = nombre.trim();
      const apellidoLimpio = apellido.trim();
      const correoLimpio = correo.trim().toLowerCase();

      const telefonoLimpio =
        typeof telefono === 'string' && telefono.trim()
          ? telefono.trim()
          : null;

      // Actualizar únicamente los datos permitidos.
      await db.execute(
        `UPDATE usuarios
         SET nombre = ?,
             apellido = ?,
             correo = ?,
             telefono = ?
         WHERE id_usuario = ?
           AND rol IN ('voluntario', 'personal')`,
        [
          nombreLimpio,
          apellidoLimpio,
          correoLimpio,
          telefonoLimpio,
          id
        ]
      );

      return res.json({
        estado: 'ok',
        mensaje: 'Voluntario actualizado correctamente.',
        usuario: {
          id_usuario: id,
          nombre: nombreLimpio,
          apellido: apellidoLimpio,
          correo: correoLimpio,
          telefono: telefonoLimpio
        }
      });

    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          mensaje: 'El correo electrónico ya está registrado.'
        });
      }

      console.error(
        'Error al actualizar voluntario:',
        error.message
      );

      return res.status(500).json({
        mensaje: 'No se pudo actualizar el voluntario.'
      });
    }
  }
);


export default router;
