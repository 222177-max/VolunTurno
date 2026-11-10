
    import { Router } from 'express';
    import bcrypt from 'bcryptjs';
    import jwt from 'jsonwebtoken';
    import { rateLimit } from 'express-rate-limit';
    import db from '../config/db.mjs';

    // Crear las rutas de autenticación
    const router = Router();

    // Nombre de la cookie que guardará la sesión
    const COOKIE = 'volunturno_sesion';

    // Configuración de la cookie
    const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
    };

    // Limitar los intentos de inicio de sesión
    const limitarIntentos = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        mensaje: 'Demasiados intentos. Intenta más tarde.'
    }
    });

    // Verificar que un usuario tenga una sesión válida
    async function verificarSesion(req, res, next) {
    try {
        const token = req.cookies?.[COOKIE];

        if (!token) {
        return res.status(401).json({
            mensaje: 'No hay sesión activa.'
        });
        }

        // Verificar firma y vencimiento del token
        const datos = jwt.verify(
        token,
        process.env.JWT_SECRET,
        { algorithms: ['HS256'] }
        );

        // Buscar el usuario en MySQL
        const [usuarios] = await db.execute(
        `SELECT id_usuario, nombre, apellido, correo,
                rol, requiere_cambio_password
        FROM usuarios
        WHERE id_usuario = ? AND activo = 1
        LIMIT 1`,
        [datos.sub]
        );

        if (usuarios.length === 0) {
        return res.status(401).json({
            mensaje: 'La cuenta no está disponible.'
        });
        }

        req.usuario = usuarios[0];
        next();

    } catch {
        return res.status(401).json({
        mensaje: 'La sesión venció o no es válida.'
        });
    }
    }

    // 1. INICIAR SESIÓN
    router.post('/login', limitarIntentos, async (req, res) => {
    try {
        const { email, password } = req.body ?? {};

        // Validar campos recibidos
        if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email.trim() ||
        !password
        ) {
        return res.status(400).json({
            mensaje: 'Ingresa tu correo y contraseña.'
        });
        }

        // Buscar el correo en MySQL
        const [usuarios] = await db.execute(
        `SELECT id_usuario, nombre, apellido, correo,
                password_hash, rol, requiere_cambio_password
        FROM usuarios
        WHERE correo = ? AND activo = 1
        LIMIT 1`,
        [email.trim().toLowerCase()]
        );

        const usuario = usuarios[0];

        // Comprobar contraseña protegida con bcrypt
        if (
        !usuario ||
        !(await bcrypt.compare(password, usuario.password_hash))
        ) {
        return res.status(401).json({
            mensaje: 'Correo o contraseña incorrectos.'
        });
        }

        // Crear token de sesión válido durante 8 horas
        const token = jwt.sign(
        { sub: String(usuario.id_usuario) },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '8h' }
        );

        // Guardar sesión en una cookie protegida
        res.cookie(COOKIE, token, {
        ...cookieOptions,
        maxAge: 8 * 60 * 60 * 1000
        });

        // Responder sin enviar la contraseña
        res.json({
        mensaje: 'Inicio de sesión correcto',
        usuario: {
            id: usuario.id_usuario,
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            correo: usuario.correo,
            rol: usuario.rol,
            requiereCambio:
            Boolean(usuario.requiere_cambio_password)
        }
        });

    } catch (error) {
        console.error('Error de login:', error.message);

        res.status(500).json({
        mensaje: 'No se pudo procesar el inicio de sesión.'
        });
    }
    });

    // 2. CONSULTAR USUARIO ACTUAL
    router.get('/me', verificarSesion, (req, res) => {
    res.json({
        usuario: {
        ...req.usuario,
        requiereCambio:
            Boolean(req.usuario.requiere_cambio_password)
        }
    });
    });



// 3. CAMBIAR CONTRASEÑA
router.post('/cambiar-password', verificarSesion, async (req, res) => {
  try {
    const { passwordActual, passwordNueva } = req.body ?? {};

    if (
      typeof passwordActual !== 'string' ||
      typeof passwordNueva !== 'string' ||
      !passwordActual ||
      !passwordNueva
    ) {
      return res.status(400).json({
        mensaje: 'Completa todos los campos.'
      });
    }

    // Reglas de seguridad para la contraseña nueva
    const longitud = passwordNueva.length >= 12;
    const mayuscula = /\p{Lu}/u.test(passwordNueva);
    const minuscula = /\p{Ll}/u.test(passwordNueva);
    const numero = /[0-9]/.test(passwordNueva);
    const especial = /[^\p{L}\p{N}\s]/u.test(passwordNueva);
    const tamano = Buffer.byteLength(passwordNueva, 'utf8') <= 72;

    if (
      !longitud ||
      !mayuscula ||
      !minuscula ||
      !numero ||
      !especial ||
      !tamano
    ) {
      return res.status(400).json({
        mensaje:
          'La nueva contraseña debe tener al menos 12 caracteres, ' +
          'una mayúscula, una minúscula, un número, ' +
          'un carácter especial y no superar 72 bytes.'
      });
    }

    // Consultar la contraseña actual en MySQL
    const [usuarios] = await db.execute(
      `SELECT password_hash
       FROM usuarios
       WHERE id_usuario = ? AND activo = 1
       LIMIT 1`,
      [req.usuario.id_usuario]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({
        mensaje: 'La cuenta no está disponible.'
      });
    }

    // Validar la contraseña temporal o actual
    const hashActual = usuarios[0].password_hash;

    const esCorrecta = await bcrypt.compare(
      passwordActual,
      hashActual
    );

    if (!esCorrecta) {
      return res.status(401).json({
        mensaje: 'La contraseña actual es incorrecta.'
      });
    }

    // Evitar reutilizar la misma contraseña
    const esLaMisma = await bcrypt.compare(
      passwordNueva,
      hashActual
    );

    if (esLaMisma) {
      return res.status(400).json({
        mensaje: 'La contraseña nueva debe ser diferente a la actual.'
      });
    }

    // Cifrar mediante hash bcrypt
    const nuevoHash = await bcrypt.hash(passwordNueva, 12);

    // Actualizar la cuenta
    await db.execute(
      `UPDATE usuarios
       SET password_hash = ?,
           requiere_cambio_password = 0
       WHERE id_usuario = ?`,
      [nuevoHash, req.usuario.id_usuario]
    );

    // Cerrar la sesión del navegador
    res.clearCookie(COOKIE, cookieOptions);

    return res.json({
      mensaje: 'Contraseña actualizada correctamente.'
    });

  } catch (error) {
    console.error('Error al cambiar contraseña:', error.message);

    return res.status(500).json({
      mensaje: 'No se pudo cambiar la contraseña.'
    });
  }
});


    // 4. CERRAR SESIÓN
    router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE, cookieOptions);

    res.json({
        mensaje: 'Sesión cerrada correctamente.'
    });
    });

    export default router;
    export { verificarSesion };
