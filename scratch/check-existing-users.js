import pool from '../server/db.js';

async function checkUserEmails() {
  const res = await pool.query('SELECT user_id, full_name, email, program_id FROM public.users ORDER BY email;');
  console.log('--- USUARIOS EXISTENTES EN BaseDatosGrado ---');
  console.table(res.rows);
  process.exit(0);
}

checkUserEmails().catch(e => { console.error(e); process.exit(1); });
