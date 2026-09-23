import pool from '../server/db.js';

async function inspectRBAC() {
  const roles = await pool.query('SELECT * FROM public.roles ORDER BY role_id;');
  const permissions = await pool.query('SELECT * FROM public.permissions ORDER BY permission_id;');
  const adminGen = await pool.query("SELECT * FROM public.users WHERE email = 'admgeneral@unicesmag.edu.co';");
  const userRolesCount = await pool.query('SELECT COUNT(*) FROM public.user_roles;');
  const userPermsCount = await pool.query('SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' AND table_name IN (\'user_permissions\', \'role_permissions\');');

  console.log('--- ROLES ---');
  console.table(roles.rows);
  console.log('--- PERMISOS ---');
  console.table(permissions.rows);
  console.log('--- ADMGENERAL USER ---');
  console.table(adminGen.rows);
  console.log('--- USER ROLES COUNT ---', userRolesCount.rows[0].count);
  console.log('--- PERMISSION TABLES ---');
  console.table(userPermsCount.rows);
  
  process.exit(0);
}

inspectRBAC().catch(e => { console.error(e); process.exit(1); });
