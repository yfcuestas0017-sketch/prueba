import { randomUUID, randomBytes } from 'crypto';
import pool from '../config/db.js';
import { withTransaction } from '../db/withTransaction.js';
import { HttpError, sendError } from '../utils/httpError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { sendPasswordResetEmail, isEmailConfigured } from '../services/email.service.js';
import { signSessionToken, SESSION_EXPIRES_IN } from '../utils/token.js';

/**
 * Mismo mensaje para "el correo no existe" y "la contraseña no coincide".
 * Distinguirlos convierte el login en un verificador de correos institucionales:
 * cualquiera podría averiguar quién está registrado sin conocer contraseña alguna.
 */
const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos.';

export const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Ingresa correo y contraseña.' });
  }

  try {
    // Trae TODAS las filas de rol del usuario (puede tener más de uno, por
    // ejemplo un "Administrador de Programa" que conserva su rol Docente).
    // Antes se usaba LIMIT 1 sin ORDER BY, lo que hacía que el rol
    // resultante fuera arbitrario quedando en riesgo de perder el acceso
    // de administrador. Ahora se resuelve un rol "principal" con
    // prioridad clara: Administrador General > Administrador (de
    // Programa) > Docente > Estudiante.
    const query = `
      SELECT u.user_id, u.full_name, u.email, u.password, u.program_id,
             r.role_id, r.name as role_name, p.name as program_name
      FROM public.users u
      LEFT JOIN public.user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN public.roles r ON ur.role_id = r.role_id
      LEFT JOIN public.programs p ON u.program_id = p.program_id
      WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($1));
    `;
    const result = await pool.query(query, [email.trim()]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: CREDENCIALES_INVALIDAS });
    }

    const user = result.rows[0];
    const { valid, needsUpgrade } = await verifyPassword(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: CREDENCIALES_INVALIDAS });
    }

    // La contraseña estaba guardada en texto plano (fila anterior a la
    // migración a bcrypt): se rehashea aprovechando que aquí la conocemos.
    if (needsUpgrade) {
      try {
        await pool.query(
          'UPDATE public.users SET password = $1 WHERE user_id = $2',
          [await hashPassword(password), user.user_id],
        );
      } catch (upgradeErr) {
        // No se le niega el acceso a nadie porque falle el rehasheo.
        console.error('No se pudo rehashear la contraseña de', user.email, upgradeErr);
      }
    }

    const roleRows = result.rows.filter((r) => r.role_id);
    const isGeneralAdminName = (name) => {
      const n = (name || '').toLowerCase();
      return n.includes('administrador general') || n.includes('admin general');
    };
    const isProgramAdminName = (name) => {
      const n = (name || '').toLowerCase();
      return (n.includes('administrador') || n === 'admin') && !isGeneralAdminName(n);
    };
    const isDocenteName = (name) => (name || '').toLowerCase().includes('docente') || (name || '').toLowerCase().includes('profesor');

    let primaryRoleRow = roleRows.find((r) => isGeneralAdminName(r.role_name))
      || roleRows.find((r) => isProgramAdminName(r.role_name))
      || roleRows.find((r) => isDocenteName(r.role_name))
      || roleRows[0]
      || null;

    // Permisos agregados de TODOS los roles del usuario (antes solo se
    // consultaban los del primer role_id encontrado).
    let permissions = [];
    const roleIds = roleRows.map((r) => r.role_id).filter(Boolean);
    if (roleIds.length > 0) {
      const permRes = await pool.query(
        `SELECT DISTINCT p.name
         FROM public.role_permissions rp
         JOIN public.permissions p ON rp.permission_id = p.permission_id
         WHERE rp.role_id = ANY($1::int[])`,
        [roleIds]
      );
      permissions = permRes.rows.map(r => r.name);
    }

    // Inferencia de respaldo si no hay filas en user_roles
    let inferredRole = 'estudiante';
    let inferredRoleId = 3;
    const uid = String(user.user_id || '').toLowerCase();
    const uemail = String(user.email || '').toLowerCase();
    if (uid.startsWith('doc') || uemail.includes('docente')) {
      inferredRole = 'docente';
      inferredRoleId = 2;
    } else if (uid.startsWith('admin') || uemail.includes('admin')) {
      inferredRole = 'administrador';
      inferredRoleId = 1;
    } else if (uid.startsWith('pla') || uemail.includes('planeacion')) {
      inferredRole = 'planeación';
      inferredRoleId = 4;
    }

    const role = (primaryRoleRow?.role_name || inferredRole).toLowerCase();
    const roleNames = roleRows.length > 0
      ? roleRows.map((r) => r.role_name).filter(Boolean)
      : [inferredRole.charAt(0).toUpperCase() + inferredRole.slice(1)];

    const sessionUser = {
      id: String(user.user_id),
      name: user.full_name,
      email: user.email,
      role: role,
      // `role` es solo el rol PRINCIPAL resuelto más arriba. `roles` lleva la
      // lista completa, y es lo que necesitan los ayudantes de
      // `frontend/src/lib/roles.js`: un Administrador de Programa conserva
      // Docente + Administrador, y si el principal resuelve a "docente" se le
      // negaría el acceso que sí le corresponde.
      roles: roleNames,
      // Del rol principal, no de result.rows[0]: con varios roles esa primera
      // fila no tiene por qué ser la del rol que manda.
      roleId: primaryRoleRow?.role_id || inferredRoleId,
      permissions,
      programId: user.program_id,
      programName: user.program_name || null,
    };

    res.json({
      token: signSessionToken(sessionUser),
      expiresIn: SESSION_EXPIRES_IN,
      user: sessionUser,
    });
  } catch (err) {
    return sendError(res, err, 'Login error:', 'Error en servidor al iniciar sesión.');
  }
};

export const register = async (req, res) => {
  const { fullName, email, password, programId, semesterId, curriculumId } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos obligatorios deben estar completos.' });
  }

  try {
    const hashedPassword = await hashPassword(password.trim());

    const newUser = await withTransaction(pool, async (client) => {
      // 1. Verificar si el email ya existe
      const existing = await client.query(
        'SELECT user_id FROM public.users WHERE LOWER(email) = LOWER($1)',
        [email.trim()]
      );
      if (existing.rows.length > 0) {
        throw new HttpError(400, 'El correo electrónico ya está registrado.');
      }

      const newUserId = randomUUID();

      // 2. Insertar usuario
      const userRes = await client.query(
        `INSERT INTO public.users (user_id, full_name, email, password, program_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING user_id, full_name, email, program_id`,
        [newUserId, fullName.trim(), email.trim().toLowerCase(), hashedPassword, programId ? parseInt(programId, 10) : null]
      );
      const created = userRes.rows[0];

      // 3. Asignar rol "Estudiante"
      let roleRes = await client.query("SELECT role_id FROM public.roles WHERE LOWER(name) = 'estudiante' LIMIT 1");
      let roleId = roleRes.rows[0]?.role_id || 3;

      await client.query(
        'INSERT INTO public.user_roles (user_id, role_id) VALUES ($1, $2)',
        [String(created.user_id), roleId]
      );

      // 4. Registrar la información académica
      if (semesterId) {
        const curriculumRes = await client.query(
          `SELECT curriculum_id
           FROM public.academic_curricula
           WHERE status = 'activo'
             AND ($1::int IS NULL OR program_id = $1::int)
           ORDER BY curriculum_id
           LIMIT 1`,
          [programId ? parseInt(programId, 10) : null],
        );
        const selectedCurriculumId = curriculumId
          ? parseInt(curriculumId, 10)
          : curriculumRes.rows[0]?.curriculum_id;

        if (!selectedCurriculumId) {
          throw new HttpError(400, 'No existe un currículo académico activo para registrar al estudiante.');
        }

        await client.query(
          `INSERT INTO public.students (user_id, semester_id, curriculum_id)
           VALUES ($1, $2, $3)`,
          [String(created.user_id), parseInt(semesterId, 10), selectedCurriculumId]
        );
      }

      return created;
    });

    const sessionUser = {
      id: String(newUser.user_id),
      name: newUser.full_name,
      email: newUser.email,
      role: 'estudiante',
      roleId: 3,
      permissions: [],
      programId: newUser.program_id,
    };

    res.status(201).json({
      token: signSessionToken(sessionUser),
      expiresIn: SESSION_EXPIRES_IN,
      user: sessionUser,
    });
  } catch (err) {
    return sendError(res, err, 'Register error:', 'Error al registrar el usuario.');
  }
};

/**
 * ─── RECUPERACIÓN DE CONTRASEÑA ──────────────────────────────────────────────
 */

export const forgotPassword = async (req, res) => {
  const { email } = req.body || {};
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'Ingresa tu correo electrónico institucional.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const genericResponse = {
    message: 'Si el correo electrónico ingresado coincide con una cuenta activa, recibirás un enlace de recuperación en los próximos minutos.',
  };

  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'El servicio de correo institucional no está configurado. Contacta a la administración del sistema.' });
  }

  try {
    const userRes = await pool.query(
      'SELECT user_id, full_name, email, is_active FROM public.users WHERE LOWER(TRIM(email)) = $1',
      [cleanEmail]
    );

    if (userRes.rows.length === 0 || userRes.rows[0].is_active === false) {
      // Respuesta genérica por seguridad para evitar enumeración de usuarios
      return res.json(genericResponse);
    }

    const user = userRes.rows[0];
    const resetToken = randomBytes(32).toString('hex');

    // Invalidar tokens previos no utilizados del usuario
    await pool.query(
      'UPDATE public.password_resets SET used = true WHERE user_id = $1 AND used = false',
      [user.user_id]
    );

    // Insertar nuevo token con expiración de 30 minutos
    await pool.query(
      `INSERT INTO public.password_resets (user_id, token, expires_at, used)
       VALUES ($1, $2, NOW() + interval '30 minutes', false)`,
      [user.user_id, resetToken]
    );

    const frontendBaseUrl = (process.env.FRONTEND_URL || 'http://localhost:5173')
      .split(',')[0]
      .trim();
    const resetUrl = `${frontendBaseUrl}/recuperar-password?token=${resetToken}`;

    try {
      await sendPasswordResetEmail({
        toEmail: user.email,
        recipientName: user.full_name,
        resetUrl,
      });
    } catch (mailErr) {
      console.error('[EMAIL] No se pudo enviar el correo de recuperación:', mailErr.message);
      // El token no sirve si el correo no salió: se invalida.
      await pool.query('UPDATE public.password_resets SET used = true WHERE token = $1', [resetToken]);
      return res.status(502).json({ error: 'No fue posible enviar el correo de recuperación en este momento. Intenta de nuevo más tarde o contacta a la administración.' });
    }

    return res.json(genericResponse);
  } catch (err) {
    return sendError(res, err, 'Forgot password error:', 'Error al procesar la solicitud de recuperación.');
  }
};

export const validateResetToken = async (req, res) => {
  const { token } = req.body || {};
  if (!token || !String(token).trim()) {
    return res.status(400).json({ error: 'Token de recuperación no proporcionado.' });
  }

  try {
    const query = `
      SELECT pr.reset_id, pr.user_id, pr.expires_at, pr.used,
             u.full_name, u.email
      FROM public.password_resets pr
      JOIN public.users u ON u.user_id = pr.user_id
      WHERE pr.token = $1
      LIMIT 1
    `;
    const result = await pool.query(query, [String(token).trim()]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'El enlace de recuperación no es válido.' });
    }

    const record = result.rows[0];

    if (record.used) {
      return res.status(400).json({ error: 'Este enlace de recuperación ya ha sido utilizado.' });
    }

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'El enlace de recuperación ha expirado. Solicita uno nuevo.' });
    }

    return res.json({
      valid: true,
      email: record.email,
      fullName: record.full_name,
    });
  } catch (err) {
    return sendError(res, err, 'Validate token error:', 'Error al validar el enlace.');
  }
};

export const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body || {};

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token y nueva contraseña son obligatorios.' });
  }

  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    await withTransaction(pool, async (client) => {
      const tokenRes = await client.query(
        `SELECT pr.reset_id, pr.user_id, pr.expires_at, pr.used, u.full_name, u.email
         FROM public.password_resets pr
         JOIN public.users u ON u.user_id = pr.user_id
         WHERE pr.token = $1
         FOR UPDATE`,
        [String(token).trim()]
      );

      if (tokenRes.rows.length === 0) {
        throw new HttpError(404, 'Enlace de recuperación inválido.');
      }

      const record = tokenRes.rows[0];

      if (record.used) {
        throw new HttpError(400, 'Este enlace de recuperación ya ha sido utilizado.');
      }

      if (new Date(record.expires_at) < new Date()) {
        throw new HttpError(400, 'El enlace de recuperación ha expirado.');
      }

      const hashedPassword = await hashPassword(String(newPassword).trim());

      // 1. Actualizar contraseña de usuario
      await client.query(
        'UPDATE public.users SET password = $1 WHERE user_id = $2',
        [hashedPassword, record.user_id]
      );

      // 2. Marcar token como utilizado
      await client.query(
        'UPDATE public.password_resets SET used = true WHERE reset_id = $1',
        [record.reset_id]
      );

      // 3. Registrar auditoría en historiales
      await client.query(
        `INSERT INTO public.histories (description, change_type, user_id)
         VALUES ($1, 'PASSWORD_RESET', $2)`,
        [`Restablecimiento de contraseña completado para ${record.email}`, record.user_id]
      );
    });

    return res.json({
      success: true,
      message: 'Tu contraseña ha sido actualizada correctamente. Ya puedes iniciar sesión con tus nuevas credenciales.',
    });
  } catch (err) {
    return sendError(res, err, 'Reset password error:', 'Error al restablecer la contraseña.');
  }
};

