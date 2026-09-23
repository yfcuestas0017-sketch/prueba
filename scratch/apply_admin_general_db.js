import pool from '../server/db.js';

async function applyAdminGeneralDB() {
  console.log('====================================================');
  console.log('🚀 APLICANDO MIGRACIÓN: Administrador General del Sistema');
  console.log('====================================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Añadir/Verificar el rol 'Administrador General' (ID 6)
    console.log('1. Verificando rol "Administrador General"...');
    await client.query(`
      INSERT INTO public.roles (role_id, name, description)
      VALUES (6, 'Administrador General', 'Acceso completo e irrestricto a todas las funcionalidades y administración del sistema')
      ON CONFLICT (role_id) DO UPDATE 
      SET name = EXCLUDED.name, description = EXCLUDED.description;
    `);

    // 2. Crear tabla user_permissions si no existe
    console.log('2. Creando tabla public.user_permissions...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.user_permissions (
        user_permission_id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
        permission_id INT NOT NULL REFERENCES public.permissions(permission_id) ON DELETE CASCADE,
        CONSTRAINT uq_user_permissions_user_id_permission_id UNIQUE (user_id, permission_id)
      );
    `);

    // 3. Añadir is_active a roles y permissions si no existen
    console.log('3. Añadiendo columna is_active a roles y permissions...');
    await client.query(`
      ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
      ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    `);

    // 4. Registrar usuario admgeneral@unicesmag.edu.co (Contraseña: 123456)
    console.log('4. Registrando usuario admgeneral@unicesmag.edu.co...');
    const userId = 'admgeneral';
    const email = 'admgeneral@unicesmag.edu.co';
    const name = 'Administrador General del Sistema';
    const password = '123456';

    const existingUser = await client.query('SELECT user_id FROM public.users WHERE email = $1 OR user_id = $2', [email, userId]);
    
    if (existingUser.rows.length === 0) {
      await client.query(`
        INSERT INTO public.users (user_id, full_name, email, password, program_id, is_active)
        VALUES ($1, $2, $3, $4, NULL, true);
      `, [userId, name, email, password]);
    } else {
      const targetId = existingUser.rows[0].user_id;
      await client.query(`
        UPDATE public.users 
        SET full_name = $1, password = $2, is_active = true
        WHERE user_id = $3;
      `, [name, password, targetId]);
    }

    // 5. Asignar Rol 6 (Administrador General) a admgeneral
    console.log('5. Asignando rol de Administrador General...');
    const actualUserRes = await client.query('SELECT user_id FROM public.users WHERE email = $1', [email]);
    const actualUserId = actualUserRes.rows[0].user_id;

    await client.query(`
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES ($1, 6)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    `, [actualUserId]);

    // Asignar también el rol de Administrador tradicional para compatibilidad total
    await client.query(`
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES ($1, 1)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    `, [actualUserId]);

    // 6. Asignar todos los permisos existentes a la tabla role_permissions para el rol 6
    console.log('6. Otorgando matriz completa de permisos al rol Administrador General...');
    const allPerms = await client.query('SELECT permission_id FROM public.permissions');
    for (const p of allPerms.rows) {
      await client.query(`
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (6, $1)
        ON CONFLICT DO NOTHING;
      `, [p.permission_id]);
    }

    await client.query('COMMIT');
    console.log('\n✨ Migración de Administrador General aplicada con ÉXITO.');

    // Verificación final
    const admCheck = await pool.query(`
      SELECT u.user_id, u.full_name, u.email, u.password, r.name AS role_name
      FROM public.users u
      JOIN public.user_roles ur ON ur.user_id = u.user_id
      JOIN public.roles r ON r.role_id = ur.role_id
      WHERE u.email = 'admgeneral@unicesmag.edu.co';
    `);

    console.log('\n📊 VERIFICACIÓN DE CUENTA DE ADMINISTRADOR GENERAL:');
    console.table(admCheck.rows);

    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en migración:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

applyAdminGeneralDB();
