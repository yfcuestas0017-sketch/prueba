import pool from '../config/db.js';

/**
 * Migración para el sistema de notificaciones (en plataforma y por correo)
 * y correos de contacto por programa académico.
 */
export async function setupNotificationsTable() {
  const client = await pool.connect();
  try {
    // 1. Crear tabla de notificaciones en plataforma
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.notifications (
        notification_id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        program_name VARCHAR(150),
        link VARCHAR(255),
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
      ON public.notifications (user_id, is_read, created_at DESC);
    `);

    // 2. Asegurar campos en public.programs para contacto oficial de cada programa
    await client.query(`
      ALTER TABLE public.programs
      ADD COLUMN IF NOT EXISTS contact_email VARCHAR(150),
      ADD COLUMN IF NOT EXISTS committee_signature VARCHAR(150);
    `);

    // 3. Configurar correos oficiales de programas principales
    await client.query(`
      UPDATE public.programs 
      SET 
        contact_email = 'investigacion.psicologia@unicesmag.edu.co',
        committee_signature = 'Comité de Investigación - Psicología'
      WHERE LOWER(name) LIKE '%psicolog%';

      UPDATE public.programs 
      SET 
        contact_email = 'investigacion.sistemas@unicesmag.edu.co',
        committee_signature = 'Comité de Investigación - Ingeniería de Sistemas'
      WHERE LOWER(name) LIKE '%sistemas%';
    `);

    console.log('[Migration] setupNotificationsTable ejecutada con éxito.');
  } catch (err) {
    console.error('[Migration Error] setupNotificationsTable:', err.message);
  } finally {
    client.release();
  }
}
