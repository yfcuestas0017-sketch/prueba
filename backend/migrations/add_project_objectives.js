import pool from '../config/db.js';

export async function setupProjectObjectivesColumns() {
  try {
    console.log('[MIGRATION] Verificando columnas de objetivos en public.projects...');
    await pool.query(`
      ALTER TABLE public.projects
      ADD COLUMN IF NOT EXISTS general_objective TEXT,
      ADD COLUMN IF NOT EXISTS specific_objectives TEXT;
    `);
    console.log('[MIGRATION] Columnas general_objective y specific_objectives listas.');
  } catch (err) {
    console.error('[MIGRATION ERROR] Error al agregar columnas de objetivos a public.projects:', err.message);
  }
}
