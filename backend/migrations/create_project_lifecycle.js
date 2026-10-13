import pool from '../config/db.js';

export async function setupProjectLifecycle() {
  await pool.query(`
    ALTER TABLE public.projects
      ADD COLUMN IF NOT EXISTS process_stage VARCHAR(20) NOT NULL DEFAULT 'investigacion',
      ADD COLUMN IF NOT EXISTS process_phase SMALLINT;

    UPDATE public.projects
       SET process_phase = 1
     WHERE process_stage = 'investigacion' AND process_phase IS NULL;

    ALTER TABLE public.projects
      DROP CONSTRAINT IF EXISTS projects_process_stage_check,
      ADD CONSTRAINT projects_process_stage_check
        CHECK (process_stage IN ('propuesta', 'investigacion')),
      DROP CONSTRAINT IF EXISTS projects_process_phase_check,
      ADD CONSTRAINT projects_process_phase_check
        CHECK (
          (process_stage = 'propuesta' AND process_phase IS NULL)
          OR (process_stage = 'investigacion' AND process_phase BETWEEN 1 AND 3)
        );

    ALTER TABLE public.project_grades
      ADD COLUMN IF NOT EXISTS process_phase SMALLINT;

    UPDATE public.project_grades g
       SET process_phase = p.process_phase
      FROM public.projects p
     WHERE p.project_id = g.project_id AND g.process_phase IS NULL;

    ALTER TABLE public.project_grades
      DROP CONSTRAINT IF EXISTS project_grades_process_phase_check,
      ADD CONSTRAINT project_grades_process_phase_check
        CHECK (process_phase IS NULL OR process_phase BETWEEN 1 AND 3);

    INSERT INTO public.statuses (name, description)
    SELECT 'En revisión', 'Propuesta pendiente de evaluación docente.'
    WHERE NOT EXISTS (SELECT 1 FROM public.statuses WHERE LOWER(name) = 'en revisión');
    INSERT INTO public.statuses (name, description)
    SELECT 'No aprobado', 'Evaluación no aprobada; el proyecto conserva su fase actual.'
    WHERE NOT EXISTS (SELECT 1 FROM public.statuses WHERE LOWER(name) = 'no aprobado');
    INSERT INTO public.statuses (name, description)
    SELECT 'En curso', 'Proyecto de investigación en una fase activa.'
    WHERE NOT EXISTS (SELECT 1 FROM public.statuses WHERE LOWER(name) = 'en curso');
    INSERT INTO public.statuses (name, description)
    SELECT 'Aprobado', 'Evaluación favorable registrada por un docente o por administración.'
    WHERE NOT EXISTS (SELECT 1 FROM public.statuses WHERE LOWER(name) = 'aprobado');
    INSERT INTO public.statuses (name, description)
    SELECT 'Finalizado', 'Proyecto que aprobó las tres fases de investigación.'
    WHERE NOT EXISTS (SELECT 1 FROM public.statuses WHERE LOWER(name) = 'finalizado');
  `);
}
