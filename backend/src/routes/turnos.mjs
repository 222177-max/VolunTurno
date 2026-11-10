import { Router } from 'express';
import db from '../config/db.mjs';
import { verificarSesion } from './auth.mjs';

const router = Router();

// Verificar permisos del coordinador
function soloCoordinador(req, res, next) {
  if (req.usuario.rol !== 'coordinador') {
    return res.status(403).json({
      mensaje: 'No tienes permisos para esta operación.'
    });
  }

  if (Boolean(req.usuario.requiere_cambio_password)) {
    return res.status(403).json({
      mensaje: 'Primero cambia tu contraseña temporal.'
    });
  }

  next();
}

function fechaValida(valor) {
  if (typeof valor !== 'string') return false;

  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!p) return false;

  const anio = Number(p[1]);
  const mes = Number(p[2]);
  const dia = Number(p[3]);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  return fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
}

function hoyEnPeru() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const datos = Object.fromEntries(
    partes.map(p => [p.type, p.value])
  );

  return `${datos.year}-${datos.month}-${datos.day}`;
}

function horaValida(valor) {
  return typeof valor === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

// CONSULTAR TURNOS DEL CALENDARIO
router.get('/', verificarSesion, soloCoordinador, async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    if (!fechaValida(desde) || !fechaValida(hasta)) {
      return res.status(400).json({
        mensaje: 'Fechas incorrectas. Usa YYYY-MM-DD.'
      });
    }

    const inicio = Date.parse(`${desde}T00:00:00Z`);
    const fin = Date.parse(`${hasta}T00:00:00Z`);

    if (fin < inicio || fin - inicio > 31 * 86400000) {
      return res.status(400).json({
        mensaje: 'El intervalo debe tener entre 1 y 32 días.'
      });
    }

    const [turnos] = await db.execute(
      `SELECT
         t.id_turno,
         t.titulo,
         t.descripcion,
         DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha,
         TIME_FORMAT(t.hora_inicio, '%H:%i') AS hora_inicio,
         TIME_FORMAT(t.hora_fin, '%H:%i') AS hora_fin,
         t.ubicacion,
         t.cupos,
         t.estado,
         (
           SELECT COUNT(*)
           FROM asignaciones a
           WHERE a.id_turno = t.id_turno
             AND a.estado IN ('pendiente', 'confirmado')
         ) AS ocupados
       FROM turnos t
       WHERE t.fecha BETWEEN ? AND ?
       ORDER BY t.fecha, t.hora_inicio, t.id_turno
       LIMIT 200`,
      [desde, hasta]
    );

    return res.json({
      estado: 'ok',
      origen: 'mysql',
      total: turnos.length,
      turnos
    });

  } catch (error) {
    console.error('Consultar turnos:', error.message);

    return res.status(500).json({
      mensaje: 'No se pudo cargar el calendario.'
    });
  }
});

// GUARDAR BORRADOR O PUBLICAR TURNO
router.post('/', verificarSesion, soloCoordinador, async (req, res) => {
  try {
    const {
      titulo,
      ubicacion,
      fecha,
      hora_inicio,
      hora_fin,
      cupos,
      funciones,
      estado
    } = req.body ?? {};

    if (
      typeof titulo !== 'string' ||
      titulo.trim().length < 5 ||
      titulo.trim().length > 120 ||
      typeof ubicacion !== 'string' ||
      ubicacion.trim().length < 5 ||
      ubicacion.trim().length > 200 ||
      typeof funciones !== 'string' ||
      funciones.trim().length < 3 ||
      funciones.trim().length > 500 ||
      !fechaValida(fecha) ||
      !horaValida(hora_inicio) ||
      !horaValida(hora_fin) ||
      !Number.isInteger(cupos) ||
      cupos < 1 ||
      cupos > 500 ||
      !['borrador', 'publicado'].includes(estado)
    ) {
      return res.status(400).json({
        mensaje: 'Revisa actividad, lugar, fecha, horario, cupos (1–500), funciones y estado.'
      });
    }

    if (fecha < hoyEnPeru()) {
      return res.status(400).json({
        mensaje: 'La fecha del turno no puede estar en el pasado.'
      });
    }

    if (hora_fin <= hora_inicio) {
      return res.status(400).json({
        mensaje: 'La hora de fin debe ser posterior a la hora de inicio.'
      });
    }

    // Guardar funciones dentro de descripcion.
    // El coordinador se obtiene de la sesión.
    const descripcion =
      `Funciones y habilidades: ${funciones.trim()}`;

    const [resultado] = await db.execute(
      `INSERT INTO turnos
       (
         titulo,
         descripcion,
         fecha,
         hora_inicio,
         hora_fin,
         ubicacion,
         cupos,
         estado,
         id_coordinador
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        titulo.trim(),
        descripcion,
        fecha,
        `${hora_inicio}:00`,
        `${hora_fin}:00`,
        ubicacion.trim(),
        cupos,
        estado,
        req.usuario.id_usuario
      ]
    );

    return res.status(201).json({
      mensaje: estado === 'publicado'
        ? 'Turno publicado correctamente.'
        : 'Borrador guardado correctamente.',
      turno: {
        id_turno: resultado.insertId,
        titulo: titulo.trim(),
        fecha,
        hora_inicio,
        hora_fin,
        ubicacion: ubicacion.trim(),
        cupos,
        funciones: funciones.trim(),
        estado,
        id_coordinador: req.usuario.id_usuario
      }
    });

  } catch (error) {
    console.error('Crear turno:', error.message);

    return res.status(500).json({
      mensaje: 'No se pudo guardar el turno.'
    });
  }
});

export default router;