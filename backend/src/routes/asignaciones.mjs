
import { Router } from 'express';
import db from '../config/db.mjs';
import { verificarSesion } from './auth.mjs';

const router = Router();

function soloCoordinador(req, res, next) {
  if (req.usuario?.rol !== 'coordinador') {
    return res.status(403).json({
      mensaje: 'Solo un coordinador puede gestionar asignaciones.'
    });
  }

  next();
}

// GET /api/asignaciones/disponibles?id_turno=1
router.get('/disponibles', verificarSesion, soloCoordinador, async (req, res) => {
  try {
    const idTurno = Number(req.query.id_turno);

    if (!Number.isSafeInteger(idTurno) || idTurno <= 0) {
      return res.status(400).json({
        mensaje: 'Debes proporcionar un id_turno válido.'
      });
    }

    const [turnos] = await db.execute(`
      SELECT id_turno, titulo, fecha, hora_inicio, hora_fin,
             cupos, estado
      FROM turnos
      WHERE id_turno = ?
    `, [idTurno]);

    if (turnos.length === 0) {
      return res.status(404).json({
        mensaje: 'El turno solicitado no existe.'
      });
    }

    const turno = turnos[0];

    if (turno.estado !== 'publicado') {
      return res.status(409).json({
        mensaje: 'Solo se puede asignar personal a turnos publicados.'
      });
    }

    // MySQL DAYOFWEEK: domingo=1 ... sábado=7.
    // Convertimos a ISO: lunes=1 ... domingo=7.
    const [dias] = await db.execute(`
      SELECT WEEKDAY(fecha) + 1 AS dia_semana
      FROM turnos
      WHERE id_turno = ?
    `, [idTurno]);

    const diaSemana = dias[0].dia_semana;

    // Las asignaciones pendientes y confirmadas ocupan cupo.
    const [conteo] = await db.execute(`
      SELECT COUNT(*) AS ocupados
      FROM asignaciones
      WHERE id_turno = ?
        AND estado IN ('pendiente', 'confirmado')
    `, [idTurno]);

    const cuposDisponibles = Math.max(
      0,
      turno.cupos - conteo[0].ocupados
    );

    // Voluntarios con disponibilidad que cubre todo el turno,
    // sin asignación activa a otro turno del mismo horario.
    const [personal] = await db.execute(`
      SELECT
        u.id_usuario,
        u.nombre,
        u.apellido,
        u.correo,
        d.hora_inicio AS disponible_desde,
        d.hora_fin AS disponible_hasta
      FROM usuarios u
      INNER JOIN disponibilidades d
        ON d.id_usuario = u.id_usuario
      WHERE u.activo = 1
        AND u.rol IN ('voluntario', 'personal')
        AND d.dia_semana = ?
        AND d.hora_inicio <= ?
        AND d.hora_fin >= ?
        AND NOT EXISTS (
          SELECT 1
          FROM asignaciones a
          WHERE a.id_usuario = u.id_usuario
            AND a.id_turno = ?
        )
        AND NOT EXISTS (
          SELECT 1
          FROM asignaciones a2
          INNER JOIN turnos t2
            ON t2.id_turno = a2.id_turno
          WHERE a2.id_usuario = u.id_usuario
            AND a2.estado IN ('pendiente', 'confirmado')
            AND t2.estado IN ('publicado', 'completado')
            AND t2.fecha = ?
            AND t2.hora_inicio < ?
            AND t2.hora_fin > ?
        )
      ORDER BY u.nombre, u.apellido
    `, [
      diaSemana,
      turno.hora_inicio,
      turno.hora_fin,
      idTurno,
      turno.fecha,
      turno.hora_fin,
      turno.hora_inicio
    ]);

    return res.json({
      estado: 'ok',
      turno,
      cuposDisponibles,
      total: personal.length,
      personal,
      estadoInterfaz: cuposDisponibles > 0 && personal.length > 0
        ? 'ideal'
        : 'empty'
    });

  } catch (error) {
    console.error('Error al consultar disponibles:', error.message);

    return res.status(500).json({
      estado: 'error',
      mensaje: 'No se pudo consultar el personal disponible.'
    });
  }
});

export default router;
