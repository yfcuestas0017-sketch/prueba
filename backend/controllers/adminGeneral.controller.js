import pool from '../config/db.js';
import { assertAdminGeneral } from '../middlewares/adminGeneral.middleware.js';
import { logAdminTrace } from '../services/audit.service.js';

export const getUsers = async (req, res) => {
  const { adminUserId, programId } = req.query;
  const client = await pool.connect();
  try {
    if (!(await assertAdminGeneral(client, adminUserId))) {
      return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de Administrador General del Sistema.' });
    }

    let queryText = `
      SELECT u.user_id, u.full_name, u.email, u.program_id, COALESCE(u.is_active, true) AS is_active, p.name AS program_name,
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
    `;
    const params = [];

    if (programId && programId !== 'all') {
      params.push(parseInt(programId, 10));
      queryText += ` WHERE u.program_id = $1`;
    }

    queryText += `
      GROUP BY u.user_id, u.full_name, u.email, u.program_id, u.is_active, p.name
      ORDER BY u.full_name;
    `;

    const result = await client.query(queryText, params);
    return res.json({ users: result.rows });
  } catch (err) {
    console.error('Admin get users error:', err);
    return res.status(500).json({ error: 'No fue posible consultar la lista de usuarios.' });
  } finally {
    client.release();
  }
};

export const createUser = async (req, res) => {
  const { adminUserId, full_name, email, password, program_id, role_ids } = req.body || {};
  if (!full_name || !email) return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await client.query('SELECT user_id FROM public.users WHERE LOWER(email) = $1', [cleanEmail]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    const newUserId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const userPass = password || '123456';
    const progId = program_id ? parseInt(program_id, 10) : null;

    await client.query(`
      INSERT INTO public.users (user_id, full_name, email, password, program_id, is_active)
      VALUES ($1, $2, $3, $4, $5, true);
    `, [newUserId, full_name.trim(), cleanEmail, userPass, progId]);

    if (Array.isArray(role_ids) && role_ids.length > 0) {
      for (const rId of role_ids) {
        await client.query(`
          INSERT INTO public.user_roles (user_id, role_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, role_id) DO NOTHING;
        `, [newUserId, parseInt(rId, 10)]);
      }
    }

    await logAdminTrace(client, adminUserId, `Registro de nuevo usuario: ${full_name.trim()} (${cleanEmail})`, 'users', null, `Usuario ${newUserId}`);
    await client.query('COMMIT');
    return res.json({ success: true, userId: newUserId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin create user error:', err);
    return res.status(500).json({ error: 'No fue posible registrar el nuevo usuario.' });
  } finally {
    client.release();
  }
};

export const updateUser = async (req, res) => {
  const targetUserId = req.params.userId;
  const { adminUserId, full_name, email, password, program_id, is_active } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const oldRes = await client.query('SELECT full_name, email, program_id, is_active FROM public.users WHERE user_id = $1', [targetUserId]);
    if (oldRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const oldUser = oldRes.rows[0];
    const cleanEmail = email ? email.trim().toLowerCase() : oldUser.email;
    const progId = program_id !== undefined ? (program_id ? parseInt(program_id, 10) : null) : oldUser.program_id;
    const activeState = is_active !== undefined ? Boolean(is_active) : oldUser.is_active;

    let updateSql = `
      UPDATE public.users 
      SET full_name = $1, email = $2, program_id = $3, is_active = $4
    `;
    const params = [full_name ? full_name.trim() : oldUser.full_name, cleanEmail, progId, activeState];

    if (password && password.trim().length > 0) {
      params.push(password.trim());
      updateSql += `, password = $${params.length}`;
    }

    params.push(targetUserId);
    updateSql += ` WHERE user_id = $${params.length};`;

    await client.query(updateSql, params);

    await logAdminTrace(
      client, adminUserId,
      `Modificación de perfil de usuario: ${targetUserId}`,
      'users',
      JSON.stringify(oldUser),
      JSON.stringify({ full_name, email: cleanEmail, program_id: progId, is_active: activeState })
    );

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin update user error:', err);
    return res.status(500).json({ error: 'No fue posible actualizar el usuario.' });
  } finally {
    client.release();
  }
};

export const toggleUserStatus = async (req, res) => {
  const targetUserId = req.params.userId;
  const { adminUserId, is_active } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const nextState = Boolean(is_active);
    await client.query('UPDATE public.users SET is_active = $1 WHERE user_id = $2', [nextState, targetUserId]);
    
    await logAdminTrace(
      client, adminUserId,
      `Cambio de estado de usuario ${targetUserId}: ${nextState ? 'Activo' : 'Inactivo'}`,
      'users.is_active',
      !nextState ? 'Activo' : 'Inactivo',
      nextState ? 'Activo' : 'Inactivo'
    );

    await client.query('COMMIT');
    return res.json({ success: true, is_active: nextState });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin toggle user status error:', err);
    return res.status(500).json({ error: 'No fue posible cambiar el estado del usuario.' });
  } finally {
    client.release();
  }
};

export const assignUserRoles = async (req, res) => {
  const targetUserId = req.params.userId;
  const { adminUserId, roleIds } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const oldRolesRes = await client.query(`
      SELECT r.name FROM public.user_roles ur JOIN public.roles r ON r.role_id = ur.role_id WHERE ur.user_id = $1
    `, [targetUserId]);
    const oldRolesText = oldRolesRes.rows.map(r => r.name).join(', ') || 'Sin roles';

    await client.query('DELETE FROM public.user_roles WHERE user_id = $1', [targetUserId]);

    if (Array.isArray(roleIds)) {
      for (const rId of roleIds) {
        await client.query(`
          INSERT INTO public.user_roles (user_id, role_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, role_id) DO NOTHING;
        `, [targetUserId, parseInt(rId, 10)]);
      }
    }

    const newRolesRes = await client.query(`
      SELECT r.name FROM public.user_roles ur JOIN public.roles r ON r.role_id = ur.role_id WHERE ur.user_id = $1
    `, [targetUserId]);
    const newRolesText = newRolesRes.rows.map(r => r.name).join(', ') || 'Sin roles';

    const userRes = await client.query('SELECT full_name, email FROM public.users WHERE user_id = $1', [targetUserId]);
    const targetName = userRes.rows[0]?.full_name || targetUserId;

    await logAdminTrace(
      client, adminUserId,
      `Asignación de roles al usuario: ${targetName}`,
      'user_roles',
      oldRolesText,
      newRolesText
    );

    await client.query('COMMIT');
    return res.json({ success: true, roles: newRolesRes.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin assign roles error:', err);
    return res.status(500).json({ error: 'No fue posible actualizar los roles del usuario.' });
  } finally {
    client.release();
  }
};

export const getRoles = async (req, res) => {
  const { adminUserId } = req.query;
  const client = await pool.connect();
  try {
    if (!(await assertAdminGeneral(client, adminUserId))) {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const result = await client.query(`
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

    return res.json({ roles: result.rows });
  } catch (err) {
    console.error('Admin get roles error:', err);
    return res.status(500).json({ error: 'No fue posible consultar los roles.' });
  } finally {
    client.release();
  }
};

export const createRole = async (req, res) => {
  const { adminUserId, name, description, is_active } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del rol es obligatorio.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const maxRes = await client.query('SELECT COALESCE(MAX(role_id), 0) + 1 AS next_id FROM public.roles');
    const nextId = maxRes.rows[0].next_id;

    await client.query(`
      INSERT INTO public.roles (role_id, name, description, is_active)
      VALUES ($1, $2, $3, $4);
    `, [nextId, name.trim(), description ? description.trim() : null, is_active !== undefined ? Boolean(is_active) : true]);

    await logAdminTrace(client, adminUserId, `Creación de nuevo rol: ${name.trim()}`, 'roles', null, `Rol ID ${nextId}`);
    await client.query('COMMIT');
    return res.json({ success: true, roleId: nextId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin create role error:', err);
    return res.status(500).json({ error: 'No fue posible crear el rol.' });
  } finally {
    client.release();
  }
};

export const updateRole = async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const { adminUserId, name, description, is_active } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const oldRes = await client.query('SELECT name, description, is_active FROM public.roles WHERE role_id = $1', [roleId]);
    if (oldRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rol no encontrado.' });
    }

    const oldRole = oldRes.rows[0];
    const newName = name ? name.trim() : oldRole.name;
    const newDesc = description !== undefined ? (description ? description.trim() : null) : oldRole.description;
    const newActive = is_active !== undefined ? Boolean(is_active) : oldRole.is_active;

    await client.query(`
      UPDATE public.roles 
      SET name = $1, description = $2, is_active = $3
      WHERE role_id = $4;
    `, [newName, newDesc, newActive, roleId]);

    await logAdminTrace(
      client, adminUserId,
      `Modificación de rol ID ${roleId}: ${newName}`,
      'roles',
      JSON.stringify(oldRole),
      JSON.stringify({ name: newName, description: newDesc, is_active: newActive })
    );

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin update role error:', err);
    return res.status(500).json({ error: 'No fue posible actualizar el rol.' });
  } finally {
    client.release();
  }
};

export const toggleRoleStatus = async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const { adminUserId, is_active } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const nextState = Boolean(is_active);
    await client.query('UPDATE public.roles SET is_active = $1 WHERE role_id = $2', [nextState, roleId]);

    await logAdminTrace(
      client, adminUserId,
      `Cambio de estado del rol ID ${roleId}: ${nextState ? 'Activo' : 'Inactivo'}`,
      'roles.is_active',
      !nextState ? 'Activo' : 'Inactivo',
      nextState ? 'Activo' : 'Inactivo'
    );

    await client.query('COMMIT');
    return res.json({ success: true, is_active: nextState });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin toggle role status error:', err);
    return res.status(500).json({ error: 'No fue posible cambiar el estado del rol.' });
  } finally {
    client.release();
  }
};

export const getPermissions = async (req, res) => {
  const { adminUserId } = req.query;
  const client = await pool.connect();
  try {
    if (!(await assertAdminGeneral(client, adminUserId))) {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const result = await client.query(`
      SELECT p.permission_id, p.name, p.description, COALESCE(p.is_active, true) AS is_active
      FROM public.permissions p
      ORDER BY p.permission_id;
    `);

    return res.json({ permissions: result.rows });
  } catch (err) {
    console.error('Admin get permissions error:', err);
    return res.status(500).json({ error: 'No fue posible consultar los permisos.' });
  } finally {
    client.release();
  }
};

export const createPermission = async (req, res) => {
  const { adminUserId, name, description, is_active } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del permiso es obligatorio.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const maxRes = await client.query('SELECT COALESCE(MAX(permission_id), 0) + 1 AS next_id FROM public.permissions');
    const nextId = maxRes.rows[0].next_id;

    await client.query(`
      INSERT INTO public.permissions (permission_id, name, description, is_active)
      VALUES ($1, $2, $3, $4);
    `, [nextId, name.trim(), description ? description.trim() : null, is_active !== undefined ? Boolean(is_active) : true]);

    await logAdminTrace(client, adminUserId, `Creación de nuevo permiso: ${name.trim()}`, 'permissions', null, `Permiso ID ${nextId}`);
    await client.query('COMMIT');
    return res.json({ success: true, permissionId: nextId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin create permission error:', err);
    return res.status(500).json({ error: 'No fue posible crear el permiso.' });
  } finally {
    client.release();
  }
};

export const updatePermission = async (req, res) => {
  const permId = parseInt(req.params.permissionId, 10);
  const { adminUserId, name, description, is_active } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const oldRes = await client.query('SELECT name, description, is_active FROM public.permissions WHERE permission_id = $1', [permId]);
    if (oldRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Permiso no encontrado.' });
    }

    const oldPerm = oldRes.rows[0];
    const newName = name ? name.trim() : oldPerm.name;
    const newDesc = description !== undefined ? (description ? description.trim() : null) : oldPerm.description;
    const newActive = is_active !== undefined ? Boolean(is_active) : oldPerm.is_active;

    await client.query(`
      UPDATE public.permissions 
      SET name = $1, description = $2, is_active = $3
      WHERE permission_id = $4;
    `, [newName, newDesc, newActive, permId]);

    await logAdminTrace(
      client, adminUserId,
      `Modificación de permiso ID ${permId}: ${newName}`,
      'permissions',
      JSON.stringify(oldPerm),
      JSON.stringify({ name: newName, description: newDesc, is_active: newActive })
    );

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin update permission error:', err);
    return res.status(500).json({ error: 'No fue posible actualizar el permiso.' });
  } finally {
    client.release();
  }
};

export const assignRolePermissions = async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const { adminUserId, permissionIds } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const roleRes = await client.query('SELECT name FROM public.roles WHERE role_id = $1', [roleId]);
    const roleName = roleRes.rows[0]?.name || `Rol ${roleId}`;

    const oldPermsRes = await client.query(`
      SELECT p.name FROM public.role_permissions rp JOIN public.permissions p ON p.permission_id = rp.permission_id WHERE rp.role_id = $1
    `, [roleId]);
    const oldPermsText = oldPermsRes.rows.map(p => p.name).join(', ') || 'Sin permisos';

    await client.query('DELETE FROM public.role_permissions WHERE role_id = $1', [roleId]);

    if (Array.isArray(permissionIds)) {
      for (const pId of permissionIds) {
        await client.query(`
          INSERT INTO public.role_permissions (role_id, permission_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING;
        `, [roleId, parseInt(pId, 10)]);
      }
    }

    const newPermsRes = await client.query(`
      SELECT p.name FROM public.role_permissions rp JOIN public.permissions p ON p.permission_id = rp.permission_id WHERE rp.role_id = $1
    `, [roleId]);
    const newPermsText = newPermsRes.rows.map(p => p.name).join(', ') || 'Sin permisos';

    await logAdminTrace(
      client, adminUserId,
      `Asignación de permisos al rol: ${roleName}`,
      'role_permissions',
      oldPermsText,
      newPermsText
    );

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin assign role permissions error:', err);
    return res.status(500).json({ error: 'No fue posible actualizar los permisos del rol.' });
  } finally {
    client.release();
  }
};

export const assignUserPermissions = async (req, res) => {
  const targetUserId = req.params.userId;
  const { adminUserId, permissionIds } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const userRes = await client.query('SELECT full_name FROM public.users WHERE user_id = $1', [targetUserId]);
    const userName = userRes.rows[0]?.full_name || targetUserId;

    const oldPermsRes = await client.query(`
      SELECT p.name FROM public.user_permissions up JOIN public.permissions p ON p.permission_id = up.permission_id WHERE up.user_id = $1
    `, [targetUserId]);
    const oldPermsText = oldPermsRes.rows.map(p => p.name).join(', ') || 'Sin permisos directos';

    await client.query('DELETE FROM public.user_permissions WHERE user_id = $1', [targetUserId]);

    if (Array.isArray(permissionIds)) {
      for (const pId of permissionIds) {
        await client.query(`
          INSERT INTO public.user_permissions (user_id, permission_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, permission_id) DO NOTHING;
        `, [targetUserId, parseInt(pId, 10)]);
      }
    }

    const newPermsRes = await client.query(`
      SELECT p.name FROM public.user_permissions up JOIN public.permissions p ON p.permission_id = up.permission_id WHERE up.user_id = $1
    `, [targetUserId]);
    const newPermsText = newPermsRes.rows.map(p => p.name).join(', ') || 'Sin permisos directos';

    await logAdminTrace(
      client, adminUserId,
      `Asignación directa de permisos al usuario: ${userName}`,
      'user_permissions',
      oldPermsText,
      newPermsText
    );

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin assign user permissions error:', err);
    return res.status(500).json({ error: 'No fue posible actualizar los permisos del usuario.' });
  } finally {
    client.release();
  }
};

export const getPrograms = async (req, res) => {
  const { adminUserId } = req.query;
  const client = await pool.connect();
  try {
    if (!(await assertAdminGeneral(client, adminUserId))) {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const [programs, faculties, modalities] = await Promise.all([
      client.query(`
        SELECT p.program_id, p.name, p.faculty_id, p.modality_id, f.name AS faculty_name, m.name AS modality_name,
               COUNT(DISTINCT u.user_id)::int AS user_count
        FROM public.programs p
        LEFT JOIN public.faculties f ON f.faculty_id = p.faculty_id
        LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
        LEFT JOIN public.users u ON u.program_id = p.program_id
        GROUP BY p.program_id, p.name, p.faculty_id, p.modality_id, f.name, m.name
        ORDER BY p.name;
      `),
      client.query('SELECT faculty_id, name FROM public.faculties ORDER BY name'),
      client.query('SELECT modality_id, name FROM public.modalities ORDER BY name')
    ]);

    return res.json({
      programs: programs.rows,
      faculties: faculties.rows,
      modalities: modalities.rows
    });
  } catch (err) {
    console.error('Admin get programs error:', err);
    return res.status(500).json({ error: 'No fue posible consultar los programas académicos.' });
  } finally {
    client.release();
  }
};

export const createProgram = async (req, res) => {
  const { adminUserId, name, faculty_id, modality_id } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del programa es obligatorio.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const maxRes = await client.query('SELECT COALESCE(MAX(program_id), 0) + 1 AS next_id FROM public.programs');
    const nextId = maxRes.rows[0].next_id;

    await client.query(`
      INSERT INTO public.programs (program_id, name, faculty_id, modality_id)
      VALUES ($1, $2, $3, $4);
    `, [nextId, name.trim(), faculty_id ? parseInt(faculty_id, 10) : null, modality_id ? parseInt(modality_id, 10) : null]);

    await logAdminTrace(client, adminUserId, `Creación de programa académico: ${name.trim()}`, 'programs', null, `Programa ID ${nextId}`);
    await client.query('COMMIT');
    return res.json({ success: true, programId: nextId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin create program error:', err);
    return res.status(500).json({ error: 'No fue posible crear el programa académico.' });
  } finally {
    client.release();
  }
};

export const updateProgram = async (req, res) => {
  const progId = parseInt(req.params.programId, 10);
  const { adminUserId, name, faculty_id, modality_id } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await assertAdminGeneral(client, adminUserId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const oldRes = await client.query('SELECT name, faculty_id, modality_id FROM public.programs WHERE program_id = $1', [progId]);
    if (oldRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Programa académico no encontrado.' });
    }

    const oldProg = oldRes.rows[0];
    const newName = name ? name.trim() : oldProg.name;
    const facId = faculty_id !== undefined ? (faculty_id ? parseInt(faculty_id, 10) : null) : oldProg.faculty_id;
    const modId = modality_id !== undefined ? (modality_id ? parseInt(modality_id, 10) : null) : oldProg.modality_id;

    await client.query(`
      UPDATE public.programs 
      SET name = $1, faculty_id = $2, modality_id = $3
      WHERE program_id = $4;
    `, [newName, facId, modId, progId]);

    await logAdminTrace(
      client, adminUserId,
      `Modificación de programa académico ID ${progId}: ${newName}`,
      'programs',
      JSON.stringify(oldProg),
      JSON.stringify({ name: newName, faculty_id: facId, modality_id: modId })
    );

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin update program error:', err);
    return res.status(500).json({ error: 'No fue posible actualizar el programa académico.' });
  } finally {
    client.release();
  }
};

export const getAuditHistory = async (req, res) => {
  const { adminUserId, programId } = req.query;
  const client = await pool.connect();
  try {
    if (!(await assertAdminGeneral(client, adminUserId))) {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    let queryText = `
      SELECT h.history_id, h.description, h.modified_field, h.old_value, h.new_value, h.change_type, h.changed_at,
             u.full_name AS user_name, u.email AS user_email, pr.name AS program_name,
             COALESCE(
               json_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '[]'
             ) AS user_roles
      FROM public.histories h
      LEFT JOIN public.users u ON u.user_id = h.user_id OR LOWER(u.email) = LOWER(h.user_id)
      LEFT JOIN public.programs pr ON pr.program_id = u.program_id
      LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
      LEFT JOIN public.roles r ON r.role_id = ur.role_id
    `;
    const params = [];

    if (programId && programId !== 'all') {
      params.push(parseInt(programId, 10));
      queryText += ` WHERE u.program_id = $1`;
    }

    queryText += `
      GROUP BY h.history_id, h.description, h.modified_field, h.old_value, h.new_value, h.change_type, h.changed_at, u.full_name, u.email, pr.name
      ORDER BY h.changed_at DESC
      LIMIT 100;
    `;

    const result = await client.query(queryText, params);
    return res.json({ history: result.rows });
  } catch (err) {
    console.error('Admin get audit history error:', err);
    return res.status(500).json({ error: 'No fue posible consultar el historial de auditoría.' });
  } finally {
    client.release();
  }
};
