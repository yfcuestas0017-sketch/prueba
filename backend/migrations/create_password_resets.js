import pool from '../config/db.js';

export async function setupPasswordResetsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.password_resets (
        reset_id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_password_resets_token ON public.password_resets(token);
      CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON public.password_resets(user_id);
    `);
    console.log('[MIGRATION] Tabla public.password_resets e índices verificados.');
  } catch (err) {
    console.error('[MIGRATION ERROR] Error al configurar tabla password_resets:', err);
  }
}
