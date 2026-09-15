import pool from '../config/db.js';

export async function setupProjectBankHistoriesTable() {
  console.log('[MIGRATION] Verificando tabla public.project_bank_histories...');

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS public.project_bank_histories (
      project_bank_history_id SERIAL PRIMARY KEY,
      project_bank_id INTEGER NOT NULL REFERENCES public.project_bank(project_bank_id) ON DELETE CASCADE,
      user_id VARCHAR(50) NOT NULL REFERENCES public.users(user_id),
      action VARCHAR(50) NOT NULL,
      previous_status VARCHAR(50),
      new_status VARCHAR(50),
      changes JSONB,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await pool.query(createTableSql);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pbh_project_bank_id 
    ON public.project_bank_histories(project_bank_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pbh_user_id 
    ON public.project_bank_histories(user_id);
  `);

  console.log('[MIGRATION] Tabla public.project_bank_histories e índices verificados.');
}
