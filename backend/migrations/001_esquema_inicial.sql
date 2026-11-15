-- VolunTurno: esquema inicial, exportado del MySQL existente.
-- Ordenado por dependencias; no desactiva las claves foráneas.
-- Ejecutar SOLO sobre una base de datos vacía.

CREATE TABLE `usuarios` (
  `id_usuario` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `apellido` varchar(100) NOT NULL,
  `correo` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `rol` enum('coordinador','voluntario','personal') NOT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `requiere_cambio_password` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `correo` (`correo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `equipos` (
  `id_equipo` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` text,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `fecha_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_equipo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `turnos` (
  `id_turno` int NOT NULL AUTO_INCREMENT,
  `titulo` varchar(150) NOT NULL,
  `descripcion` text,
  `fecha` date NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL,
  `ubicacion` varchar(200) DEFAULT NULL,
  `cupos` int NOT NULL,
  `estado` enum('borrador','publicado','cancelado','completado') NOT NULL DEFAULT 'borrador',
  `id_coordinador` int NOT NULL,
  `fecha_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_turno`),
  KEY `id_coordinador` (`id_coordinador`),
  CONSTRAINT `turnos_ibfk_1` FOREIGN KEY (`id_coordinador`) REFERENCES `usuarios` (`id_usuario`),
  CONSTRAINT `turnos_chk_1` CHECK ((`cupos` > 0)),
  CONSTRAINT `turnos_chk_2` CHECK ((`hora_fin` > `hora_inicio`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `disponibilidades` (
  `id_disponibilidad` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int NOT NULL,
  `dia_semana` tinyint NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL,
  PRIMARY KEY (`id_disponibilidad`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `disponibilidades_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`),
  CONSTRAINT `disponibilidades_chk_1` CHECK ((`dia_semana` between 1 and 7)),
  CONSTRAINT `disponibilidades_chk_2` CHECK ((`hora_fin` > `hora_inicio`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `notificaciones` (
  `id_notificacion` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int NOT NULL,
  `titulo` varchar(150) NOT NULL,
  `mensaje` text NOT NULL,
  `leida` tinyint(1) NOT NULL DEFAULT '0',
  `fecha_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_notificacion`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `notificaciones_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `equipo_integrantes` (
  `id_integrante` int NOT NULL AUTO_INCREMENT,
  `id_equipo` int NOT NULL,
  `id_usuario` int NOT NULL,
  PRIMARY KEY (`id_integrante`),
  UNIQUE KEY `id_equipo` (`id_equipo`,`id_usuario`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `equipo_integrantes_ibfk_1` FOREIGN KEY (`id_equipo`) REFERENCES `equipos` (`id_equipo`),
  CONSTRAINT `equipo_integrantes_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `asignaciones` (
  `id_asignacion` int NOT NULL AUTO_INCREMENT,
  `id_turno` int NOT NULL,
  `id_usuario` int NOT NULL,
  `estado` enum('pendiente','confirmado','rechazado','cancelado') NOT NULL DEFAULT 'pendiente',
  `fecha_asignacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_asignacion`),
  UNIQUE KEY `id_turno` (`id_turno`,`id_usuario`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `asignaciones_ibfk_1` FOREIGN KEY (`id_turno`) REFERENCES `turnos` (`id_turno`),
  CONSTRAINT `asignaciones_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `asistencias` (
  `id_asistencia` int NOT NULL AUTO_INCREMENT,
  `id_asignacion` int NOT NULL,
  `estado` enum('presente','ausente','justificado') NOT NULL,
  `observaciones` text,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_asistencia`),
  UNIQUE KEY `id_asignacion` (`id_asignacion`),
  CONSTRAINT `asistencias_ibfk_1` FOREIGN KEY (`id_asignacion`) REFERENCES `asignaciones` (`id_asignacion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
