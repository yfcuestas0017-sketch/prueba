import pool from '../config/db.js';

export async function setupProjectEndorsement() {
  try {
    // 1. Agregar columnas a public.projects para registrar el aval del asesor
    await pool.query(`
      ALTER TABLE public.projects
        ADD COLUMN IF NOT EXISTS endorsed_at TIMESTAMP WITHOUT TIME ZONE,
        ADD COLUMN IF NOT EXISTS endorsed_by VARCHAR(50),
        ADD COLUMN IF NOT EXISTS endorsement_notes TEXT;
    `);

    // 2. Alinear secuencia de statuses e insertar estado 'Con aval'
    await pool.query(`
      SELECT setval('public.statuses_status_id_seq', (SELECT COALESCE(MAX(status_id), 1) FROM public.statuses));

      INSERT INTO public.statuses (name, description)
      SELECT 'Con aval', 'Proyecto con oficio de aval radicado por el asesor, listo para revisión y aprobación de comité.'
      WHERE NOT EXISTS (SELECT 1 FROM public.statuses WHERE LOWER(name) = 'con aval');
    `);

    console.log('[Migration] setupProjectEndorsement ejecutada correctamente.');
  } catch (err) {
    console.error('[Migration] Error en setupProjectEndorsement:', err.message);
    throw err;
  }
}
