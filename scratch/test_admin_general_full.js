import pool from '../server/db.js';

async function testAdminGeneralFeature() {
  console.log('===========================================================');
  console.log('🧪 PRUEBA INTEGRAL: Administrador General del Sistema');
  console.log('===========================================================\n');

  const client = await pool.connect();
  try {
    // 1. Verificar credenciales de login
    console.log('1. Verificando usuario admgeneral@unicesmag.edu.co...');
    const userRes = await client.query(`
      SELECT u.user_id, u.full_name, u.email, u.password, r.name AS role_name
      FROM public.users u
      JOIN public.user_roles ur ON ur.user_id = u.user_id
      JOIN public.roles r ON r.role_id = ur.role_id
      WHERE LOWER(u.email) = 'admgeneral@unicesmag.edu.co';
    `);

    if (userRes.rows.length === 0) {
      throw new Error('No se encontró el usuario admgeneral@unicesmag.edu.co');
    }
    console.log('✅ Usuario verificado:', userRes.rows[0]);

    // 2. Probar filtrado por programa académico (Ingeniería vs Psicología vs Todos)
    console.log('\n2. Probando filtrado de usuarios por programa académico...');
    const usersAll = await client.query('SELECT COUNT(*) FROM public.users');
    const usersIng = await client.query('SELECT COUNT(*) FROM public.users WHERE program_id = 1');
    const usersPsi = await client.query('SELECT COUNT(*) FROM public.users WHERE program_id = 2');

    console.log(`- Todos los programas: ${usersAll.rows[0].count} usuarios`);
    console.log(`- Ingeniería de Sistemas (ID 1): ${usersIng.rows[0].count} usuarios`);
    console.log(`- Psicología (ID 2): ${usersPsi.rows[0].count} usuarios`);

    // 3. Probar asignación de permisos y creación de rol de prueba
    console.log('\n3. Creando rol de prueba "Coordinador de Investigación"...');
    const roleRes = await client.query(`
      INSERT INTO public.roles (role_id, name, description, is_active)
      VALUES (99, 'Coordinador de Investigación Test', 'Rol de prueba para verificación RBAC', true)
      ON CONFLICT (role_id) DO UPDATE SET name = EXCLUDED.name
      RETURNING role_id, name;
    `);
    console.log('✅ Rol creado:', roleRes.rows[0]);

    // 4. Registrar acción de auditoría
    console.log('\n4. Registrando trazabilidad de auditoría...');
    const auditRes = await client.query(`
      INSERT INTO public.histories (description, modified_field, old_value, new_value, change_type, user_id, changed_at)
      VALUES ('Prueba de auditoría de Administrador General', 'roles', NULL, 'Rol 99 Coordinador de Investigación Test', 'ADMIN_ACTION', 'admgeneral', CURRENT_TIMESTAMP)
      RETURNING history_id, description, changed_at;
    `);
    console.log('✅ Registro de trazabilidad guardado:', auditRes.rows[0]);

    // Limpieza de datos de prueba
    await client.query('DELETE FROM public.roles WHERE role_id = 99;');

    console.log('\n✨ TODAS LAS PRUEBAS INTEGRALES PASARON CON ÉXITO.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en prueba integral:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

testAdminGeneralFeature();
