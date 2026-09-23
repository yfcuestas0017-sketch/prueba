import pool from '../server/db.js';

async function testAdminQueries() {
  console.log('Testing Admin Queries...');

  // Test 1: Users with Roles and Permissions
  const usersRes = await pool.query(`
    SELECT u.user_id, u.full_name, u.email, u.program_id, u.is_active, p.name AS program_name,
           COALESCE(
             json_agg(DISTINCT jsonb_build_object('role_id', r.role_id, 'name', r.name)) 
             FILTER (WHERE r.role_id IS NOT NULL), '[]'
           ) AS roles,
           COALESCE(
             json_agg(DISTINCT jsonb_build_object('permission_id', perm.permission_id, 'name', perm.name)) 
             FILTER (WHERE perm.permission_id IS NOT NULL), '[]'
           ) AS permissions
    FROM public.users u
    LEFT JOIN public.programs p ON p.program_id = u.program_id
    LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
    LEFT JOIN public.roles r ON r.role_id = ur.role_id
    LEFT JOIN public.user_permissions up ON up.user_id = u.user_id
    LEFT JOIN public.permissions perm ON perm.permission_id = up.permission_id
    GROUP BY u.user_id, u.full_name, u.email, u.program_id, u.is_active, p.name
    ORDER BY u.full_name
    LIMIT 5;
  `);
  console.log('Users sample query OK:', usersRes.rows.length);

  // Test 2: Roles with Permissions
  const rolesRes = await pool.query(`
    SELECT r.role_id, r.name, r.description, COALESCE(r.is_active, true) AS is_active,
           COUNT(DISTINCT ur.user_id)::int AS user_count,
           COALESCE(
             json_agg(DISTINCT jsonb_build_object('permission_id', p.permission_id, 'name', p.name))
             FILTER (WHERE p.permission_id IS NOT NULL), '[]'
           ) AS permissions
    FROM public.roles r
    LEFT JOIN public.user_roles ur ON ur.role_id = r.role_id
    LEFT JOIN public.role_permissions rp ON rp.role_id = r.role_id
    LEFT JOIN public.permissions p ON p.permission_id = rp.permission_id
    GROUP BY r.role_id, r.name, r.description, r.is_active
    ORDER BY r.role_id;
  `);
  console.log('Roles sample query OK:', rolesRes.rows.length);

  // Test 3: Audit history query
  const auditRes = await pool.query(`
    SELECT h.history_id, h.description, h.modified_field, h.old_value, h.new_value, h.change_type, h.changed_at,
           u.full_name AS user_name, u.email AS user_email, pr.name AS program_name
    FROM public.histories h
    LEFT JOIN public.users u ON u.user_id = h.user_id
    LEFT JOIN public.programs pr ON pr.program_id = u.program_id
    ORDER BY h.changed_at DESC
    LIMIT 5;
  `);
  console.log('Audit history sample query OK:', auditRes.rows.length);

  process.exit(0);
}

testAdminQueries().catch(err => {
  console.error('Query Test Failed:', err);
  process.exit(1);
});
