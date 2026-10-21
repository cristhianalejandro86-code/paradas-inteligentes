-- =============================================================================
-- PDP · PARADA DE PLANTA BEIJING — MIGRACIÓN v26 (CORREGIDA Y AUDITADA)
-- Proyecto Supabase: kfkvjflkesxivpgnsjff · Ejecutar en el SQL Editor de Supabase
--
-- Correcciones de seguridad y sintaxis incluidas:
--   1. DEFAULT auth.uid() directo en autor_user_id (sin subconsulta que causaba error 0A000).
--   2. Sin vista pública ultimas_fotos (eliminada para no saltar RLS).
--   3. REVOKE ALL ... FROM anon en las tablas nuevas: lectura e inserción solo para usuarios autenticados.
--   4. Políticas RLS en reportes_campo validadas con pdp.mi_rol() IN ('Residente', 'Supervisor', 'Planificador', 'SupervisorSeguridad').
--   5. Funciones RPC SECURITY DEFINER (registrar_foto_avance, quitar_foto_extra, quitar_foto_base) con validación estricta de pdp.mi_rol() y REVOKE EXECUTE FROM PUBLIC, anon.
--   6. Incluye todas las columnas de detalle v26 en pdp.reportes_campo (hora inicio/fin, pase, técnicos y cargo, herramientas faltantes, interferencias y lecciones para próxima parada).
-- =============================================================================

-- 0. Limpieza preventiva de vista si llegó a crearse en pruebas previas
DROP VIEW IF EXISTS pdp.ultimas_fotos;

-- 1. TABLAS NUEVAS
CREATE TABLE IF NOT EXISTS pdp.fotos_avance (
  id BIGSERIAL PRIMARY KEY,
  actividad_id TEXT NOT NULL REFERENCES pdp.actividades(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  autor_dni TEXT,
  autor_nombre TEXT,
  nota TEXT,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pdp.avance_historial (
  id BIGSERIAL PRIMARY KEY,
  actividad_id TEXT NOT NULL REFERENCES pdp.actividades(id) ON DELETE CASCADE,
  avance INTEGER NOT NULL CHECK (avance >= 0 AND avance <= 100),
  autor_dni TEXT,
  autor_nombre TEXT,
  comentario TEXT,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pdp.reportes_campo (
  id BIGSERIAL PRIMARY KEY,
  actividad_id TEXT NOT NULL REFERENCES pdp.actividades(id) ON DELETE CASCADE,
  area_reporte TEXT NOT NULL CHECK (area_reporte IN ('seguridad', 'planeamiento', 'supervision')),
  subtipo TEXT NOT NULL,
  severidad TEXT DEFAULT 'normal',
  estado TEXT DEFAULT 'abierto',
  detalle TEXT NOT NULL,
  accion_correctiva TEXT,
  -- Campos de Seguridad SSOMA
  constancia_campo BOOLEAN DEFAULT true,
  bloqueo_lototo BOOLEAN DEFAULT false,
  petar_ok BOOLEAN DEFAULT false,
  epp_ok BOOLEAN DEFAULT false,
  -- Campos de Planeamiento / Ruta Crítica
  critica BOOLEAN DEFAULT false,
  horas_atraso NUMERIC(6,2) DEFAULT 0,
  -- Campos de Avance Detallado (Tiempos reales, Pase, Técnicos+Cargo, Herramientas, Interferencias)
  hora_inicio_real TEXT,
  hora_fin_real TEXT,
  estado_pase TEXT,
  tecnicos JSONB DEFAULT '[]'::jsonb,
  obs_herramientas TEXT,
  obs_interferencia TEXT,
  -- Campos de Mapeo para la Siguiente Parada (Lecciones Aprendidas y Mejora Continua)
  leccion_pdp TEXT,
  checks_leccion JSONB DEFAULT '[]'::jsonb,
  -- Evidencia fotográfica y auditoría (DEFAULT auth.uid() sin subconsulta)
  foto_data TEXT,
  autor_user_id UUID DEFAULT auth.uid(),
  autor_dni TEXT,
  autor_nombre TEXT,
  autor_rol TEXT,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_at TIMESTAMPTZ,
  cerrado_por TEXT
);

-- Asegurar columnas v26 si pdp.reportes_campo ya se había creado con la versión v25
ALTER TABLE pdp.reportes_campo ADD COLUMN IF NOT EXISTS critica BOOLEAN DEFAULT false;
ALTER TABLE pdp.reportes_campo ADD COLUMN IF NOT EXISTS horas_atraso NUMERIC(6,2) DEFAULT 0;
ALTER TABLE pdp.reportes_campo ADD COLUMN IF NOT EXISTS hora_inicio_real TEXT;
ALTER TABLE pdp.reportes_campo ADD COLUMN IF NOT EXISTS hora_fin_real TEXT;
ALTER TABLE pdp.reportes_campo ADD COLUMN IF NOT EXISTS estado_pase TEXT;
ALTER TABLE pdp.reportes_campo ADD COLUMN IF NOT EXISTS tecnicos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE pdp.reportes_campo ADD COLUMN IF NOT EXISTS obs_herramientas TEXT;
ALTER TABLE pdp.reportes_campo ADD COLUMN IF NOT EXISTS obs_interferencia TEXT;
ALTER TABLE pdp.reportes_campo ADD COLUMN IF NOT EXISTS leccion_pdp TEXT;
ALTER TABLE pdp.reportes_campo ADD COLUMN IF NOT EXISTS checks_leccion JSONB DEFAULT '[]'::jsonb;

-- 2. ÍNDICES DE RENDIMIENTO
CREATE INDEX IF NOT EXISTS fotos_extra_actividad_id_id_desc_idx ON pdp.fotos_extra (actividad_id, id DESC);
CREATE INDEX IF NOT EXISTS fotos_extra_propuesta_id_idx ON pdp.fotos_extra (propuesta_id);
CREATE INDEX IF NOT EXISTS fotos_avance_actividad_id_id_desc_idx ON pdp.fotos_avance (actividad_id, id DESC);
CREATE INDEX IF NOT EXISTS avance_historial_actividad_creado_idx ON pdp.avance_historial (actividad_id, creado_at);
CREATE INDEX IF NOT EXISTS reportes_campo_actividad_creado_idx ON pdp.reportes_campo (actividad_id, creado_at DESC);
CREATE INDEX IF NOT EXISTS asignaciones_dni_idx ON pdp.asignaciones (dni);
CREATE INDEX IF NOT EXISTS asignaciones_propuesta_id_idx ON pdp.asignaciones (propuesta_id);
CREATE INDEX IF NOT EXISTS propuestas_estado_creado_idx ON pdp.propuestas (estado, creado_at DESC);

-- 3. PERMISOS DE TABLA: nada para anon (clave pública), acceso solo a authenticated con RLS
ALTER TABLE pdp.fotos_avance ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdp.avance_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdp.reportes_campo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON pdp.fotos_avance, pdp.avance_historial, pdp.reportes_campo FROM anon;
GRANT SELECT ON pdp.fotos_avance, pdp.avance_historial TO authenticated;
GRANT SELECT, INSERT, UPDATE ON pdp.reportes_campo TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pdp TO authenticated;

-- 4. POLÍTICAS RLS ESTRICTAS
DROP POLICY IF EXISTS fotos_avance_lectura ON pdp.fotos_avance;
DROP POLICY IF EXISTS fotos_avance_escritura ON pdp.fotos_avance;
CREATE POLICY fotos_avance_lectura ON pdp.fotos_avance
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS avance_historial_lectura ON pdp.avance_historial;
DROP POLICY IF EXISTS avance_historial_escritura ON pdp.avance_historial;
CREATE POLICY avance_historial_lectura ON pdp.avance_historial
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS reportes_campo_lectura ON pdp.reportes_campo;
CREATE POLICY reportes_campo_lectura ON pdp.reportes_campo
  FOR SELECT TO authenticated USING (pdp.mi_rol() IS NOT NULL);

DROP POLICY IF EXISTS reportes_campo_insertar ON pdp.reportes_campo;
CREATE POLICY reportes_campo_insertar ON pdp.reportes_campo
  FOR INSERT TO authenticated
  WITH CHECK (pdp.mi_rol() IN ('Residente', 'Supervisor', 'Planificador', 'SupervisorSeguridad'));

DROP POLICY IF EXISTS reportes_campo_actualizar ON pdp.reportes_campo;
CREATE POLICY reportes_campo_actualizar ON pdp.reportes_campo
  FOR UPDATE TO authenticated
  USING (pdp.mi_rol() IN ('Residente', 'Supervisor', 'Planificador', 'SupervisorSeguridad'))
  WITH CHECK (pdp.mi_rol() IN ('Residente', 'Supervisor', 'Planificador', 'SupervisorSeguridad'));

-- 5. FUNCIONES RPC CON CONTROL ESTRICTO DE ROL
CREATE OR REPLACE FUNCTION pdp.registrar_foto_avance(p_id TEXT, p_data TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdp, public, pg_catalog
AS $$
DECLARE
  v_new_id BIGINT;
BEGIN
  IF pdp.mi_rol() IS NULL OR pdp.mi_rol() NOT IN ('Residente', 'Supervisor', 'Planificador', 'SupervisorSeguridad') THEN
    RAISE EXCEPTION 'Solo Residente, Supervisor, Planificador o Seguridad pueden subir fotos de avance';
  END IF;
  IF p_data IS NULL OR left(p_data, 11) <> 'data:image/' THEN
    RAISE EXCEPTION 'Imagen no válida';
  END IF;
  IF length(p_data) > 4000000 THEN
    RAISE EXCEPTION 'La foto es demasiado grande';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pdp.actividades WHERE id = p_id) THEN
    RAISE EXCEPTION 'Actividad no encontrada';
  END IF;
  INSERT INTO pdp.fotos_avance (actividad_id, data, autor_dni)
  VALUES (p_id, p_data, pdp.mi_dni())
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION pdp.quitar_foto_extra(p_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdp, public, pg_catalog
AS $$
BEGIN
  IF pdp.mi_rol() IS DISTINCT FROM 'Residente' THEN
    RAISE EXCEPTION 'Solo el Residente puede quitar fotos';
  END IF;
  DELETE FROM pdp.fotos_extra WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION pdp.quitar_foto_base(p_actividad_id TEXT, p_foto INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdp, public, pg_catalog
AS $$
BEGIN
  IF pdp.mi_rol() IS DISTINCT FROM 'Residente' THEN
    RAISE EXCEPTION 'Solo el Residente puede quitar fotos';
  END IF;
  UPDATE pdp.actividades
     SET fotos = array_remove(fotos, p_foto)
   WHERE id = p_actividad_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION pdp.registrar_foto_avance(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pdp.quitar_foto_extra(BIGINT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pdp.quitar_foto_base(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pdp.registrar_foto_avance(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION pdp.quitar_foto_extra(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION pdp.quitar_foto_base(TEXT, INTEGER) TO authenticated;

-- 6. TRIGGER DE HISTORIAL AUTOMÁTICO DE AVANCE (alimenta la Curva S real)
CREATE OR REPLACE FUNCTION pdp.trg_guardar_historial_avance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdp, public, pg_catalog
AS $$
BEGIN
  IF NEW.avance IS DISTINCT FROM OLD.avance THEN
    INSERT INTO pdp.avance_historial (actividad_id, avance, autor_dni)
    VALUES (NEW.id, COALESCE(NEW.avance, 0), NEW.avance_por);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actividades_avance ON pdp.actividades;
CREATE TRIGGER trg_actividades_avance
  AFTER UPDATE OF avance ON pdp.actividades
  FOR EACH ROW
  EXECUTE FUNCTION pdp.trg_guardar_historial_avance();