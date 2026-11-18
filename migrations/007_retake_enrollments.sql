-- Solo las nuevas inscripciones autorizadas se marcan como materias pendientes.
-- Los intentos y calificaciones anteriores se conservan sin reclasificarlos.
ALTER TABLE enrollments ADD COLUMN is_retake BOOLEAN NOT NULL DEFAULT false;
