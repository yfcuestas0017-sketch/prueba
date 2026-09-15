-- ============================================================================
-- Soporte para "Administrador de Programa" en Líneas y Sublíneas de
-- Investigación.
-- ----------------------------------------------------------------------------
-- El backend (backend/controllers/catalogs.controller.js y
-- backend/admin_db_crud.js) ya asume que public.research_lines tiene una
-- columna program_id para poder filtrar/asignar líneas por programa
-- académico, pero esa columna nunca quedó registrada en una migración
-- formal (probablemente se agregó manualmente en algún momento sobre la
-- base de datos en uso). Esta migración es idempotente y dejará el esquema
-- consistente en cualquier entorno nuevo o existente.
-- ============================================================================

ALTER TABLE public.research_lines
  ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES public.programs(program_id);

CREATE INDEX IF NOT EXISTS idx_research_lines_program_id
  ON public.research_lines(program_id);

-- ============================================================================
-- Asegurar que exista el rol "Administrador" (sin la palabra "general").
-- Es el rol que Administración General asigna, además de "Docente", a un
-- docente para convertirlo en "Administrador de Programa" (ver
-- frontend/src/features/admin-general/AdminGeneralPage.jsx ->
-- handleOpenCreateAdminProgram). Si no existe, se crea; si ya existe con
-- otro texto de descripción no se sobreescribe.
-- ============================================================================
INSERT INTO public.roles (name, description)
SELECT 'Administrador', 'Administrador de Programa: gestiona la información académica del programa al que pertenece.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles
  WHERE LOWER(name) = 'administrador'
);

-- Asegurar también el rol "Administrador General del Sistema" (o
-- equivalente), usado por backend/middlewares/adminGeneral.middleware.js.
INSERT INTO public.roles (name, description)
SELECT 'Administrador General del Sistema', 'Acceso total al sistema: usuarios, roles, permisos, programas académicos y auditoría.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles
  WHERE LOWER(name) LIKE '%administrador general%'
);
