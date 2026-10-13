import pool from '../config/db.js';

export async function setupProjectGradesTable() {
  try {
    console.log('[MIGRATION] Verificando tabla public.project_grades...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.project_grades (
        grade_id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
        evaluator_id VARCHAR(255) REFERENCES public.users(user_id) ON DELETE SET NULL,
        status_id INTEGER REFERENCES public.statuses(status_id) ON DELETE SET NULL,
        score NUMERIC(3, 1) CHECK (score >= 0.0 AND score <= 5.0),
        observations TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_project_grades_project_id ON public.project_grades(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_grades_evaluator_id ON public.project_grades(evaluator_id);
    `);
    console.log('[MIGRATION] Tabla public.project_grades lista.');
  } catch (err) {
    console.error('[MIGRATION ERROR] Error al crear la tabla public.project_grades:', err.message);
  }
}
