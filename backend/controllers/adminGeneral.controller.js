import pool from '../config/db.js';
import { assertAdminGeneral } from '../middlewares/adminGeneral.middleware.js';
import { actorId } from '../middlewares/auth.middleware.js';
import { logAdminTrace } from '../services/audit.service.js';
import { withTransaction } from '../db/withTransaction.js';
import { HttpError, sendError } from '../utils/httpError.js';
import { hashPassword } from '../utils/password.js';
import { randomBytes } from 'crypto';

const ACCESO_DENEGADO = 'Acceso denegado.';

/**
 * Verifica que quien hace la petición sea Administrador General y aborta la
 * operación si no lo es. Al lanzar (en vez de retornar), una transacción en
 * curso se revierte sola: ya no hace falta el ROLLBACK manual en cada control.
 */
async function exigirAdminGeneral(client, adminUserId, mensaje = ACCESO_DENEGADO) {
  if (!(await assertAdminGeneral(client, adminUserId))) {
    throw new HttpError(403, mensaje);
  }
}

/* ── USUARIOS ─────────────────────────────────────────────────────────────── */

export const getUsers = async (req, res) => {
  const { programId } = req.query;
  const adminUserId = actorId(req);
  try {
    await exigirAdminGeneral(pool, adminUserId, 'Acceso denegado. Se requieren permisos de Administrador General del Sistema.');

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

    const result = await pool.query(queryText, params);
    return res.json({ users: result.rows });
  } catch (err) {
    return sendError(res, err, 'Admin get users error:', 'No fue posible consultar la lista de usuarios.');
  }
};

export const createUser = async (req, res) => {
  const { full_name, email, password, program_id, role_ids } = req.body || {};
  const adminUserId = actorId(req);
  if (!full_name || !email) return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });

  try {
    const creado = await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

      const cleanEmail = email.trim().toLowerCase();
      const existing = await client.query('SELECT user_id FROM public.users WHERE LOWER(email) = $1', [cleanEmail]);
      if (existing.rows.length > 0) {
        throw new HttpError(400, 'El correo electrónico ya está registrado.');
      }

      const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      // Si no se indica contraseña se genera una temporal aleatoria en lugar de
      // usar un valor fijo conocido: '123456' era la misma para todo el mundo y
      // estaba además escrita en la interfaz.
      const passwordEnClaro = (password && password.trim()) || randomBytes(9).toString('base64url');
      const progId = program_id ? parseInt(program_id, 10) : null;

      await client.query(`
        INSERT INTO public.users (user_id, full_name, email, password, program_id, is_active)
        VALUES ($1, $2, $3, $4, $5, true);
      `, [userId, full_name.trim(), cleanEmail, await hashPassword(passwordEnClaro), progId]);

      if (Array.isArray(role_ids) && role_ids.length > 0) {
        for (const rId of role_ids) {
          await client.query(`
            INSERT INTO public.user_roles (user_id, role_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, role_id) DO NOTHING;
          `, [userId, parseInt(rId, 10)]);
        }
      }

      await logAdminTrace(client, adminUserId, `Registro de nuevo usuario: ${full_name.trim()} (${cleanEmail})`, 'users', null, `Usuario ${userId}`);
      return { userId, temporaryPassword: password && password.trim() ? null : passwordEnClaro };
    });

    return res.json({
      success: true,
      userId: creado.userId,
      temporaryPassword: creado.temporaryPassword,
    });
  } catch (err) {
    return sendError(res, err, 'Admin create user error:', 'No fue posible registrar el nuevo usuario.');
  }
};

export const updateUser = async (req, res) => {
  const targetUserId = req.params.userId;
  const { full_name, email, password, program_id, is_active } = req.body || {};
  const adminUserId = actorId(req);

  try {
    await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

      const oldRes = await client.query('SELECT full_name, email, program_id, is_active FROM public.users WHERE user_id = $1', [targetUserId]);
      if (oldRes.rows.length === 0) {
        throw new HttpError(404, 'Usuario no encontrado.');
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
        params.push(await hashPassword(password.trim()));
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
    });

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err, 'Admin update user error:', 'No fue posible actualizar el usuario.');
  }
};

export const toggleUserStatus = async (req, res) => {
  const targetUserId = req.params.userId;
  const { is_active } = req.body || {};
  const adminUserId = actorId(req);

  try {
    const nextState = await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

      const estado = Boolean(is_active);
      await client.query('UPDATE public.users SET is_active = $1 WHERE user_id = $2', [estado, targetUserId]);

      await logAdminTrace(
        client, adminUserId,
        `Cambio de estado de usuario ${targetUserId}: ${estado ? 'Activo' : 'Inactivo'}`,
        'users.is_active',
        !estado ? 'Activo' : 'Inactivo',
        estado ? 'Activo' : 'Inactivo'
      );

      return estado;
    });

    return res.json({ success: true, is_active: nextState });
  } catch (err) {
    return sendError(res, err, 'Admin toggle user status error:', 'No fue posible cambiar el estado del usuario.');
  }
};

export const assignUserRoles = async (req, res) => {
  const targetUserId = req.params.userId;
  const { roleIds } = req.body || {};
  const adminUserId = actorId(req);

  try {
    const roles = await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

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

      return newRolesRes.rows;
    });

    return res.json({ success: true, roles });
  } catch (err) {
    return sendError(res, err, 'Admin assign roles error:', 'No fue posible actualizar los roles del usuario.');
  }
};

/* ── ROLES ────────────────────────────────────────────────────────────────── */

export const getRoles = async (req, res) => {
  const adminUserId = actorId(req);
  try {
    await exigirAdminGeneral(pool, adminUserId);

    const result = await pool.query(`
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
    return sendError(res, err, 'Admin get roles error:', 'No fue posible consultar los roles.');
  }
};

export const createRole = async (req, res) => {
  const { name, description, is_active } = req.body || {};
  const adminUserId = actorId(req);
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del rol es obligatorio.' });

  try {
    const nextId = await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

      // El identificador lo asigna la secuencia de la tabla, no la
      // aplicacion. Antes se calculaba con MAX(role_id)+1, que es una
      // condicion de carrera: dos altas simultaneas leen el mismo maximo y
      // la segunda choca contra la clave primaria. La secuencia reparte
      // identificadores sin carreras porque es la base de datos quien
      // serializa. (La secuencia de esta tabla estaba desfasada; la
      // sincroniza backend/scripts/optimize_database.js.)
      const insertado = await client.query(`
        INSERT INTO public.roles (name, description, is_active)
        VALUES ($1, $2, $3)
        RETURNING role_id;
      `, [name.trim(), description ? description.trim() : null, is_active !== undefined ? Boolean(is_active) : true]);
      const roleId = insertado.rows[0].role_id;

      await logAdminTrace(client, adminUserId, `Creación de nuevo rol: ${name.trim()}`, 'roles', null, `Rol ID ${roleId}`);
      return roleId;
    });

    return res.json({ success: true, roleId: nextId });
  } catch (err) {
    return sendError(res, err, 'Admin create role error:', 'No fue posible crear el rol.');
  }
};

export const updateRole = async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const { name, description, is_active } = req.body || {};
  const adminUserId = actorId(req);

  try {
    await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

      const oldRes = await client.query('SELECT name, description, is_active FROM public.roles WHERE role_id = $1', [roleId]);
      if (oldRes.rows.length === 0) {
        throw new HttpError(404, 'Rol no encontrado.');
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
    });

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err, 'Admin update role error:', 'No fue posible actualizar el rol.');
  }
};

export const toggleRoleStatus = async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const { is_active } = req.body || {};
  const adminUserId = actorId(req);

  try {
    const nextState = await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

      const estado = Boolean(is_active);
      await client.query('UPDATE public.roles SET is_active = $1 WHERE role_id = $2', [estado, roleId]);

      await logAdminTrace(
        client, adminUserId,
        `Cambio de estado del rol ID ${roleId}: ${estado ? 'Activo' : 'Inactivo'}`,
        'roles.is_active',
        !estado ? 'Activo' : 'Inactivo',
        estado ? 'Activo' : 'Inactivo'
      );

      return estado;
    });

    return res.json({ success: true, is_active: nextState });
  } catch (err) {
    return sendError(res, err, 'Admin toggle role status error:', 'No fue posible cambiar el estado del rol.');
  }
};

/* ── PERMISOS ─────────────────────────────────────────────────────────────── */

export const getPermissions = async (req, res) => {
  const adminUserId = actorId(req);
  try {
    await exigirAdminGeneral(pool, adminUserId);

    const result = await pool.query(`
      SELECT p.permission_id, p.name, p.description, COALESCE(p.is_active, true) AS is_active
      FROM public.permissions p
      ORDER BY p.permission_id;
    `);

    return res.json({ permissions: result.rows });
  } catch (err) {
    return sendError(res, err, 'Admin get permissions error:', 'No fue posible consultar los permisos.');
  }
};

export const createPermission = async (req, res) => {
  const { name, description, is_active } = req.body || {};
  const adminUserId = actorId(req);
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del permiso es obligatorio.' });

  try {
    const nextId = await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

      // El identificador lo asigna la secuencia de la tabla, no la
      // aplicacion. Antes se calculaba con MAX(permission_id)+1, que es una
      // condicion de carrera: dos altas simultaneas leen el mismo maximo y
      // la segunda choca contra la clave primaria. La secuencia reparte
      // identificadores sin carreras porque es la base de datos quien
      // serializa. (La secuencia de esta tabla estaba desfasada; la
      // sincroniza backend/scripts/optimize_database.js.)
      const insertado = await client.query(`
        INSERT INTO public.permissions (name, description, is_active)
        VALUES ($1, $2, $3)
        RETURNING permission_id;
      `, [name.trim(), description ? description.trim() : null, is_active !== undefined ? Boolean(is_active) : true]);
      const permissionId = insertado.rows[0].permission_id;

      await logAdminTrace(client, adminUserId, `Creación de nuevo permiso: ${name.trim()}`, 'permissions', null, `Permiso ID ${permissionId}`);
      return permissionId;
    });

    return res.json({ success: true, permissionId: nextId });
  } catch (err) {
    return sendError(res, err, 'Admin create permission error:', 'No fue posible crear el permiso.');
  }
};

export const updatePermission = async (req, res) => {
  const permId = parseInt(req.params.permissionId, 10);
  const { name, description, is_active } = req.body || {};
  const adminUserId = actorId(req);

  try {
    await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

      const oldRes = await client.query('SELECT name, description, is_active FROM public.permissions WHERE permission_id = $1', [permId]);
      if (oldRes.rows.length === 0) {
        throw new HttpError(404, 'Permiso no encontrado.');
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
    });

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err, 'Admin update permission error:', 'No fue posible actualizar el permiso.');
  }
};

export const assignRolePermissions = async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const { permissionIds } = req.body || {};
  const adminUserId = actorId(req);

  try {
    await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

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
    });

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err, 'Admin assign role permissions error:', 'No fue posible actualizar los permisos del rol.');
  }
};

export const assignUserPermissions = async (req, res) => {
  const targetUserId = req.params.userId;
  const { permissionIds } = req.body || {};
  const adminUserId = actorId(req);

  try {
    await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

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
    });

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err, 'Admin assign user permissions error:', 'No fue posible actualizar los permisos del usuario.');
  }
};

/* ── PROGRAMAS ACADÉMICOS ─────────────────────────────────────────────────── */

export const getPrograms = async (req, res) => {
  const adminUserId = actorId(req);
  try {
    await exigirAdminGeneral(pool, adminUserId);

    const [programs, faculties, modalities] = await Promise.all([
      pool.query(`
        SELECT p.program_id, p.name, p.faculty_id, p.modality_id, f.name AS faculty_name, m.name AS modality_name,
               COUNT(DISTINCT u.user_id)::int AS user_count
        FROM public.programs p
        LEFT JOIN public.faculties f ON f.faculty_id = p.faculty_id
        LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
        LEFT JOIN public.users u ON u.program_id = p.program_id
        GROUP BY p.program_id, p.name, p.faculty_id, p.modality_id, f.name, m.name
        ORDER BY p.name;
      `),
      pool.query('SELECT faculty_id, name FROM public.faculties ORDER BY name'),
      pool.query('SELECT modality_id, name FROM public.modalities ORDER BY name')
    ]);

    return res.json({
      programs: programs.rows,
      faculties: faculties.rows,
      modalities: modalities.rows
    });
  } catch (err) {
    return sendError(res, err, 'Admin get programs error:', 'No fue posible consultar los programas académicos.');
  }
};

export const createProgram = async (req, res) => {
  const { name, faculty_id, modality_id } = req.body || {};
  const adminUserId = actorId(req);
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del programa es obligatorio.' });

  try {
    const nextId = await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

      // El identificador lo asigna la secuencia de la tabla, no la
      // aplicacion. Antes se calculaba con MAX(program_id)+1, que es una
      // condicion de carrera: dos altas simultaneas leen el mismo maximo y
      // la segunda choca contra la clave primaria. La secuencia reparte
      // identificadores sin carreras porque es la base de datos quien
      // serializa. (La secuencia de esta tabla estaba desfasada; la
      // sincroniza backend/scripts/optimize_database.js.)
      const insertado = await client.query(`
        INSERT INTO public.programs (name, faculty_id, modality_id)
        VALUES ($1, $2, $3)
        RETURNING program_id;
      `, [name.trim(), faculty_id ? parseInt(faculty_id, 10) : null, modality_id ? parseInt(modality_id, 10) : null]);
      const programId = insertado.rows[0].program_id;

      await logAdminTrace(client, adminUserId, `Creación de programa académico: ${name.trim()}`, 'programs', null, `Programa ID ${programId}`);
      return programId;
    });

    return res.json({ success: true, programId: nextId });
  } catch (err) {
    return sendError(res, err, 'Admin create program error:', 'No fue posible crear el programa académico.');
  }
};

export const updateProgram = async (req, res) => {
  const progId = parseInt(req.params.programId, 10);
  const { name, faculty_id, modality_id } = req.body || {};
  const adminUserId = actorId(req);

  try {
    await withTransaction(pool, async (client) => {
      await exigirAdminGeneral(client, adminUserId);

      const oldRes = await client.query('SELECT name, faculty_id, modality_id FROM public.programs WHERE program_id = $1', [progId]);
      if (oldRes.rows.length === 0) {
        throw new HttpError(404, 'Programa académico no encontrado.');
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
    });

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err, 'Admin update program error:', 'No fue posible actualizar el programa académico.');
  }
};

/* ── AUDITORÍA ────────────────────────────────────────────────────────────── */

export const getAuditHistory = async (req, res) => {
  const { programId } = req.query;
  const adminUserId = actorId(req);
  try {
    await exigirAdminGeneral(pool, adminUserId);

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

    const result = await pool.query(queryText, params);
    return res.json({ history: result.rows });
  } catch (err) {
    return sendError(res, err, 'Admin get audit history error:', 'No fue posible consultar el historial de auditoría.');
  }
};
