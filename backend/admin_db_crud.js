
import { randomUUID } from 'crypto';
import { withTransaction } from './db/withTransaction.js';
import { HttpError } from './utils/httpError.js';
import { hashPassword, isHashed } from './utils/password.js';
import { actorId } from './middlewares/auth.middleware.js';

export const TABLE_REGISTRY = {
  faculties: {
    table: 'public.faculties',
    pk: 'faculty_id',
    label: 'Facultades',
    columns: [
      { name: 'name', label: 'Nombre', type: 'text', required: true },
    ],
  },
  modalities: {
    table: 'public.modalities',
    pk: 'modality_id',
    label: 'Modalidades',
    columns: [
      { name: 'name', label: 'Nombre', type: 'text', required: true },
      { name: 'description', label: 'Descripción', type: 'textarea' },
    ],
  },
  periods: {
    table: 'public.periods',
    pk: 'period_id',
    label: 'Periodos académicos',
    columns: [
      { name: 'academic_year', label: 'Año académico', type: 'number', required: true },
      { name: 'period_number', label: 'Número de periodo', type: 'number', required: true },
      { name: 'description', label: 'Descripción', type: 'text' },
    ],
  },
  program_periods: {
    table: 'public.program_periods',
    pk: 'program_period_id',
    label: 'Periodos por programa',
    columns: [
      { name: 'program_id', label: 'Programa', type: 'select', fk: 'programs', required: true },
      { name: 'period_id', label: 'Periodo', type: 'select', fk: 'periods', required: true },
    ],
  },
  semesters: {
    table: 'public.semesters',
    pk: 'semester_id',
    label: 'Semestres',
    columns: [
      { name: 'semester_number', label: 'Número de semestre', type: 'number', required: true },
      { name: 'start_date', label: 'Fecha de inicio', type: 'date' },
      { name: 'end_date', label: 'Fecha de fin', type: 'date' },
    ],
  },
  degree_options: {
    table: 'public.degree_options',
    pk: 'degree_option_id',
    label: 'Opciones de grado',
    programScoped: true,
    columns: [
      { name: 'name', label: 'Nombre', type: 'text', required: true },
      { name: 'description', label: 'Descripción', type: 'textarea' },
      {
        name: 'program_id',
        label: 'Programa (vacío = todos los programas)',
        type: 'select',
        fk: 'programs',
        required: false,
      },
    ],
  },
  academic_curricula: {
    table: 'public.academic_curricula',
    pk: 'curriculum_id',
    label: 'Currículos académicos',
    columns: [
      { name: 'program_id', label: 'Programa', type: 'select', fk: 'programs', required: true },
      { name: 'version', label: 'Versión', type: 'text' },
      { name: 'effective_year', label: 'Año de vigencia', type: 'number' },
      { name: 'status', label: 'Estado', type: 'text' },
      { name: 'total_semesters', label: 'Total de semestres', type: 'number' },
    ],
  },
  statuses: {
    table: 'public.statuses',
    pk: 'status_id',
    label: 'Estados de proyecto',
    columns: [
      { name: 'name', label: 'Nombre', type: 'text', required: true },
      { name: 'description', label: 'Descripción', type: 'textarea' },
    ],
  },
  research_lines: {
    table: 'public.research_lines',
    pk: 'research_line_id',
    label: 'Líneas de investigación',
    columns: [
      { name: 'name', label: 'Nombre', type: 'text', required: true },
      { name: 'description', label: 'Descripción', type: 'textarea' },
      { name: 'program_id', label: 'Programa', type: 'select', fk: 'programs' },
    ],
  },
  research_sublines: {
    table: 'public.research_sublines',
    pk: 'research_subline_id',
    label: 'Sublíneas de investigación',
    columns: [
      { name: 'name', label: 'Nombre', type: 'text', required: true },
      { name: 'description', label: 'Descripción', type: 'textarea' },
      { name: 'research_line_id', label: 'Línea de investigación', type: 'select', fk: 'research_lines', required: true },
    ],
  },
  user_roles: {
    table: 'public.user_roles',
    pk: 'user_role_id',
    label: 'Asignación de roles',
    columns: [
      { name: 'user_id', label: 'Usuario', type: 'select', fk: 'users', required: true },
      { name: 'role_id', label: 'Rol', type: 'select', fk: 'roles', required: true },
    ],
  },
  programs: {
    table: 'public.programs',
    pk: 'program_id',
    label: 'Programas académicos',
    columns: [
      { name: 'name', label: 'Nombre', type: 'text', required: true },
      { name: 'faculty_id', label: 'Facultad', type: 'select', fk: 'faculties' },
      { name: 'modality_id', label: 'Modalidad', type: 'select', fk: 'modalities' },
    ],
  },
  roles: {
    table: 'public.roles',
    pk: 'role_id',
    label: 'Roles',
    columns: [
      { name: 'name', label: 'Nombre', type: 'text', required: true },
      { name: 'description', label: 'Descripción', type: 'textarea' },
      { name: 'is_active', label: 'Activo', type: 'boolean' },
    ],
  },
  permissions: {
    table: 'public.permissions',
    pk: 'permission_id',
    label: 'Permisos',
    columns: [
      { name: 'name', label: 'Nombre', type: 'text', required: true },
      { name: 'description', label: 'Descripción', type: 'textarea' },
      { name: 'is_active', label: 'Activo', type: 'boolean' },
    ],
  },

  // ── Las 10 tablas que faltaban en el registro (antes solo había 16 de 26) ──

  users: {
    table: 'public.users',
    pk: 'user_id',
    label: 'Usuarios',
    genPk: 'uuid', // user_id no tiene DEFAULT en la BD; se genera aquí igual que en /api/auth/register
    columns: [
      { name: 'full_name', label: 'Nombre completo', type: 'text', required: true },
      { name: 'email', label: 'Correo electrónico', type: 'text', required: true },
      { name: 'password', label: 'Contraseña (se guarda cifrada; vacío = no se cambia)', type: 'text' },
      { name: 'program_id', label: 'Programa', type: 'select', fk: 'programs' },
      { name: 'is_active', label: 'Activo', type: 'boolean' },
    ],
  },
  students: {
    table: 'public.students',
    pk: 'student_id',
    label: 'Estudiantes',
    columns: [
      { name: 'user_id', label: 'Usuario', type: 'select', fk: 'users', required: true },
      { name: 'semester_id', label: 'Semestre', type: 'select', fk: 'semesters', required: true },
      { name: 'curriculum_id', label: 'Currículo académico', type: 'select', fk: 'academic_curricula', required: true },
    ],
  },
};

// Columna usada para mostrar cada fila de FK dentro de los <select>
const FK_DISPLAY_COLUMN = {
  programs: 'name',
  faculties: 'name',
  modalities: 'name',
  periods: 'description',
  roles: 'name',
  permissions: 'name',
  research_lines: 'name',
  research_sublines: 'name',
  statuses: 'name',
  degree_options: 'name',
  projects: 'title',
  users: 'full_name',
  semesters: 'semester_number',
  academic_curricula: 'version',
  histories: 'description',
  project_bank: 'title',
};

// Antes devolvía solo un booleano; ahora también resuelve el user_id REAL
// del administrador para poder auditar correctamente (histories.user_id
// referencia a users.user_id, que en esta base es un UUID en texto, no un
// entero autoincremental).
// `assertAdminGeneral` vivía aquí y solo distinguía "Administrador General o
// nadie". La sustituye `resolveAdminAccess`, que además reconoce al
// Administrador de Programa; se retiró al fusionar para no dejar dos
// comprobaciones de permisos compitiendo en el mismo archivo.

// ── Alcance del "Administrador de Programa" ──────────────────────────────
// El Administrador de Programa es un Docente que además tiene el rol
// "Administrador" (sin la palabra "general"). A diferencia del
// Administrador General (acceso total), el Administrador de Programa SOLO
// puede administrar, dentro de este panel genérico de base de datos, las
// Líneas y Sublíneas de Investigación de su propio programa académico.
const PROGRAM_ADMIN_ALLOWED_TABLES = new Set(['research_lines', 'research_sublines']);
// 'programs' se permite en modo solo-lectura (GET) únicamente para poblar
// el selector "Programa" del formulario; nunca se puede crear/editar/borrar.
const PROGRAM_ADMIN_READONLY_TABLES = new Set(['programs']);

async function resolveAdminAccess(client, userId, tableKey) {
  if (!userId) return { ok: false, resolvedUserId: null, isGeneralAdmin: false, isProgramAdmin: false, programId: null };

  const result = await client.query(
    `SELECT u.user_id, u.program_id,
            BOOL_OR(LOWER(r.name) LIKE '%administrador general%' OR LOWER(r.name) LIKE '%admin general%') AS is_general_admin,
            BOOL_OR((LOWER(r.name) LIKE '%administrador%' OR LOWER(r.name) = 'admin') AND LOWER(r.name) NOT LIKE '%general%') AS is_role_admin
     FROM public.users u
     LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
     LEFT JOIN public.roles r ON r.role_id = ur.role_id
     WHERE (u.user_id::text = $1 OR LOWER(u.email) = LOWER($1))
     GROUP BY u.user_id, u.program_id
     LIMIT 1`,
    [String(userId)],
  );

  if (result.rows.length === 0) {
    return { ok: false, resolvedUserId: null, isGeneralAdmin: false, isProgramAdmin: false, programId: null };
  }

  const row = result.rows[0];
  const isGeneralAdmin = !!row.is_general_admin || String(userId).toLowerCase() === 'admgeneral@unicesmag.edu.co';
  const isProgramAdmin = !isGeneralAdmin && !!row.is_role_admin;

  if (isGeneralAdmin) {
    return { ok: true, resolvedUserId: row.user_id, isGeneralAdmin: true, isProgramAdmin: false, programId: row.program_id ?? null };
  }

  if (isProgramAdmin) {
    const allowedForWrite = PROGRAM_ADMIN_ALLOWED_TABLES.has(tableKey);
    const allowedForRead = allowedForWrite || PROGRAM_ADMIN_READONLY_TABLES.has(tableKey);
    return {
      ok: allowedForRead,
      allowedForWrite,
      resolvedUserId: row.user_id,
      isGeneralAdmin: false,
      isProgramAdmin: true,
      programId: row.program_id ?? null,
    };
  }

  return { ok: false, resolvedUserId: row.user_id, isGeneralAdmin: false, isProgramAdmin: false, programId: row.program_id ?? null };
}

// IMPORTANTE: nunca debe poder abortar la transacción principal del CRUD.
// Usa un SAVEPOINT propio; si el registro de auditoría falla por cualquier
// motivo, se descarta solo esa inserción y la operación principal
// (crear/editar/eliminar) sigue intacta hasta el COMMIT.
async function logAdminTrace(client, resolvedAdminUserId, action, field = null, oldValue = null, newValue = null) {
  try {
    await client.query('SAVEPOINT admin_trace_sp');
    await client.query(
      `INSERT INTO public.histories (description, modified_field, old_value, new_value, change_type, user_id, changed_at)
       VALUES ($1, $2, $3, $4, 'ADMIN_DB_CRUD', $5, CURRENT_TIMESTAMP);`,
      [action, field, oldValue, newValue, resolvedAdminUserId],
    );
    await client.query('RELEASE SAVEPOINT admin_trace_sp');
  } catch (err) {
    console.error('Error logging admin db crud trace:', err);
    try {
      await client.query('ROLLBACK TO SAVEPOINT admin_trace_sp');
    } catch (rollbackErr) {
      console.error('Error rolling back admin trace savepoint:', rollbackErr);
    }
  }
}

// ── Reparación automática de secuencias desincronizadas ──────────────────────
// Causa del error "Ya existe la llave (xxx_id)=(12)": en algún momento se
// insertaron filas indicando manualmente el ID (import, script, migración
// antigua...), y la secuencia interna de PostgreSQL quedó desactualizada.
// Si el INSERT falla por violación de llave única SOBRE LA COLUMNA PK,
// resincronizamos la secuencia con el MAX(id) real de la tabla y reintentamos
// una sola vez. Así el problema no vuelve a ocurrir, sin intervención manual.
function isPkUniqueViolation(err, cfg) {
  return err && err.code === '23505' && typeof err.constraint === 'string'
    && (err.constraint.includes(cfg.pk) || err.constraint.includes(cfg.table.split('.').pop()));
}

async function resyncSequence(client, cfg) {
  try {
    await client.query(
      `SELECT setval(
         pg_get_serial_sequence($1, $2),
         GREATEST((SELECT COALESCE(MAX(${cfg.pk}), 0) FROM ${cfg.table}), 1),
         (SELECT COUNT(*) FROM ${cfg.table}) > 0
       );`,
      [cfg.table, cfg.pk],
    );
    return true;
  } catch (err) {
    console.error(`No se pudo resincronizar la secuencia de ${cfg.table}:`, err);
    return false;
  }
}

function getTableConfig(tableKey) {
  const config = TABLE_REGISTRY[tableKey];
  if (!config) return null;
  return config;
}

export function registerAdminDbCrudRoutes(app, pool) {
  // Metadatos de todas las tablas administrables (para construir el selector y los formularios)
  app.get('/api/admin/general/db/tables', async (req, res) => {
    // El identificador sale del token (actorId), no de req.query.adminUserId:
    // leerlo del parámetro permite suplantar a cualquiera.
    const adminUserId = actorId(req);
    // Solo lectura: no hace falta sacar un cliente del pool ni liberarlo. El
    // pool expone .query igual que un cliente, y resolveAdminAccess no usa
    // nada más.
    const scope = await resolveAdminAccess(pool, adminUserId, null);
    if (!scope.ok && !scope.isProgramAdmin) {
      return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de Administrador General del Sistema.' });
    }

    // El Administrador de Programa solo gestiona líneas y sublíneas.
    const entradas = scope.isProgramAdmin && !scope.isGeneralAdmin
      ? Object.entries(TABLE_REGISTRY).filter(([key]) => PROGRAM_ADMIN_ALLOWED_TABLES.has(key))
      : Object.entries(TABLE_REGISTRY);

    const tables = entradas.map(([key, cfg]) => ({
      key,
      label: cfg.label,
      pk: cfg.pk,
      columns: cfg.columns,
      programScoped: !!cfg.programScoped,
    }));
    return res.json({ tables });
  });

  // Listado de filas de una tabla (incluye el nombre "visible" de cada FK)
  // Acepta ?programId=<id>|all para tablas con programScoped: true.
  //   - sin programId, o programId=all  -> se muestran TODAS las filas
  //   - programId=<id>                  -> se muestran las filas globales
  //                                        (program_id IS NULL) MÁS las del
  //                                        programa seleccionado
  app.get('/api/admin/general/db/:tableKey', async (req, res) => {
    const { tableKey } = req.params;
    const { programId } = req.query;
    const adminUserId = actorId(req);
    const cfg = getTableConfig(tableKey);
    if (!cfg) return res.status(404).json({ error: 'Tabla no reconocida.' });

    try {
      const scope = await resolveAdminAccess(pool, adminUserId, tableKey);
      if (!scope.ok) {
        return res.status(403).json({ error: 'Acceso denegado.' });
      }
      if (scope.isProgramAdmin && !scope.programId) {
        return res.status(403).json({ error: 'Tu usuario no tiene un programa académico asignado.' });
      }

      let selectCols = `t.*`;
      let joins = '';
      let researchLineAlias = null;
      cfg.columns.forEach((col, idx) => {
        if (col.fk && TABLE_REGISTRY[col.fk]) {
          const fkCfg = TABLE_REGISTRY[col.fk];
          const alias = `fk${idx}`;
          const displayCol = FK_DISPLAY_COLUMN[col.fk] || fkCfg.pk;
          selectCols += `, ${alias}.${displayCol} AS "${col.name}_label"`;
          joins += ` LEFT JOIN ${fkCfg.table} ${alias} ON ${alias}.${fkCfg.pk} = t.${col.name}`;
          if (col.fk === 'research_lines') researchLineAlias = alias;
        }
      });

      const values = [];
      let whereClause = '';

      if (scope.isProgramAdmin) {
        // El Administrador de Programa solo ve las líneas propias de su
        // programa, y las sublíneas cuya línea pertenezca a su programa.
        if (tableKey === 'research_lines') {
          values.push(scope.programId);
          whereClause = ` WHERE t.program_id = $${values.length}`;
        } else if (tableKey === 'research_sublines' && researchLineAlias) {
          values.push(scope.programId);
          whereClause = ` WHERE ${researchLineAlias}.program_id = $${values.length}`;
        }
        // Para 'programs' (solo lectura, usado para poblar el <select>)
        // no se restringe: ver la lista de programas no es sensible.
      } else if (cfg.programScoped && programId && programId !== 'all') {
        values.push(programId);
        whereClause = ` WHERE (t.program_id IS NULL OR t.program_id = $${values.length})`;
      }

      const result = await pool.query(
        `SELECT ${selectCols} FROM ${cfg.table} t ${joins}${whereClause} ORDER BY t.${cfg.pk} DESC LIMIT 500;`,
        values,
      );

      // La columna de contraseñas nunca sale del servidor, ni siquiera cifrada:
      // no hay nada que un administrador pueda hacer con ella y su sitio en la
      // pantalla es lo que hacía que las contraseñas reales fueran visibles.
      const rows = cfg.columns.some((c) => c.name === 'password')
        ? result.rows.map((row) => ({ ...row, password: '' }))
        : result.rows;

      return res.json({ rows });
    } catch (err) {
      console.error(`Admin DB list error (${tableKey}):`, err);
      return res.status(500).json({ error: 'No fue posible consultar la tabla.' });
    }
  });

  // Crear fila
  app.post('/api/admin/general/db/:tableKey', async (req, res) => {
    const { tableKey } = req.params;
    // `adminUserId` se descarta del cuerpo: la identidad ya no se lee de ahí,
    // y así no se cuela como si fuera una columna de la tabla.
    const { adminUserId: _identidadDescartada, ...body } = req.body || {};
    const adminUserId = actorId(req);
    const cfg = getTableConfig(tableKey);
    if (!cfg) return res.status(404).json({ error: 'Tabla no reconocida.' });

    // Las contraseñas nunca entran a la tabla tal como se escriben. Esta
    // herramienta edita filas en bruto, así que aquí es donde hay que
    // interceptarlas; antes ponía '123456' cuando el campo venía vacío, lo que
    // creaba cuentas con una contraseña conocida por todo el mundo.
    if (tableKey === 'users') {
      if (!body.password || !String(body.password).trim()) {
        return res.status(400).json({
          error: 'Indica una contraseña para el nuevo usuario. Se guardará cifrada.',
        });
      }
      body.password = await hashPassword(String(body.password).trim());
    }

    let attemptedResync = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const nuevoId = await withTransaction(pool, async (client) => {
          // El alcance viene de origin/main y distingue Administrador General
          // de Administrador de Programa. Dentro de withTransaction el rechazo
          // se LANZA en vez de devolverse: un `return` aquí saldría del
          // callback sin revertir la transacción.
          const scope = await resolveAdminAccess(client, adminUserId, tableKey);
          if (!scope.ok || (scope.isProgramAdmin && !scope.allowedForWrite)) {
            throw new HttpError(403, 'Acceso denegado.');
          }
          const resolvedUserId = scope.resolvedUserId;

          if (scope.isProgramAdmin) {
            if (!scope.programId) {
              throw new HttpError(403, 'Tu usuario no tiene un programa académico asignado.');
            }
            if (tableKey === 'research_lines') {
              // Nunca se permite crear una línea para otro programa distinto al propio.
              body.program_id = scope.programId;
            } else if (tableKey === 'research_sublines') {
              const lineId = body.research_line_id;
              const lineCheck = await client.query(
                'SELECT program_id FROM public.research_lines WHERE research_line_id = $1',
                [lineId],
              );
              if (lineCheck.rows.length === 0 || String(lineCheck.rows[0].program_id) !== String(scope.programId)) {
                throw new HttpError(403, 'Solo puedes crear sublíneas dentro de líneas de tu propio programa.');
              }
            }
          }

          const colNames = cfg.columns.map((c) => c.name);
          const values = colNames.map((name) => (body[name] === '' ? null : body[name]));
          let insertColNames = colNames;

          // Tablas cuya PK no tiene DEFAULT en la base de datos (p. ej. users.user_id, UUID)
          if (cfg.genPk === 'uuid') {
            insertColNames = [cfg.pk, ...colNames];
            values.unshift(randomUUID());
          }

          const placeholders = insertColNames.map((_, i) => `$${i + 1}`).join(', ');
          const insertSql = `
            INSERT INTO ${cfg.table} (${insertColNames.join(', ')})
            VALUES (${placeholders})
            RETURNING ${cfg.pk};
          `;
          const result = await client.query(insertSql, values);

          await logAdminTrace(client, resolvedUserId, `Creación de registro en ${cfg.label}`, cfg.table, null, JSON.stringify(body));
          return result.rows[0][cfg.pk];
        });

        return res.json({ success: true, id: nuevoId });
      } catch (err) {
        // El rechazo por permisos no es un fallo técnico: no se reintenta.
        if (err instanceof HttpError) {
          return res.status(err.status).json({ error: err.message });
        }

        // Secuencia desincronizada: resincronizar y reintentar UNA vez.
        // La transacción ya quedó revertida, así que la resincronización va por el pool.
        if (!attemptedResync && isPkUniqueViolation(err, cfg)) {
          attemptedResync = true;
          const resynced = await resyncSequence(pool, cfg);
          if (resynced) continue; // reintenta el while(true)
        }

        console.error(`Admin DB create error (${tableKey}):`, err);
        return res.status(500).json({ error: err.detail || err.message || 'No fue posible crear el registro.' });
      }
    }
  });

  // Actualizar fila
  app.put('/api/admin/general/db/:tableKey/:id', async (req, res) => {
    const { tableKey, id } = req.params;
    // `adminUserId` se descarta del cuerpo: la identidad ya no se lee de ahí,
    // y así no se cuela como si fuera una columna de la tabla.
    const { adminUserId: _identidadDescartada, ...body } = req.body || {};
    const adminUserId = actorId(req);
    const cfg = getTableConfig(tableKey);
    if (!cfg) return res.status(404).json({ error: 'Tabla no reconocida.' });

    if (tableKey === 'users') {
      if (body.password === '' || body.password === undefined) {
        delete body.password; // no pisar la contraseña si el campo llega vacío al editar
      } else if (!isHashed(body.password)) {
        // Se comprueba si ya venía cifrada para no volver a cifrar un hash
        // cuando el formulario reenvía el valor que mostró la tabla.
        body.password = await hashPassword(String(body.password).trim());
      }
    }

    try {
      await withTransaction(pool, async (client) => {
        // Comprobaciones de alcance de origin/main, con los rechazos lanzados
        // como HttpError: dentro de withTransaction un `return` no revierte.
        const scope = await resolveAdminAccess(client, adminUserId, tableKey);
        if (!scope.ok || (scope.isProgramAdmin && !scope.allowedForWrite)) {
          throw new HttpError(403, 'Acceso denegado.');
        }
        const resolvedUserId = scope.resolvedUserId;

        if (scope.isProgramAdmin) {
          if (!scope.programId) {
            throw new HttpError(403, 'Tu usuario no tiene un programa académico asignado.');
          }
          if (tableKey === 'research_lines') {
            const current = await client.query('SELECT program_id FROM public.research_lines WHERE research_line_id = $1', [id]);
            if (current.rows.length === 0 || String(current.rows[0].program_id) !== String(scope.programId)) {
              throw new HttpError(403, 'No puedes editar líneas de investigación de otro programa académico.');
            }
            // No se permite reasignar la línea a otro programa.
            body.program_id = scope.programId;
          } else if (tableKey === 'research_sublines') {
            const current = await client.query(
              `SELECT rl.program_id
               FROM public.research_sublines rsl
               JOIN public.research_lines rl ON rl.research_line_id = rsl.research_line_id
               WHERE rsl.research_subline_id = $1`,
              [id],
            );
            if (current.rows.length === 0 || String(current.rows[0].program_id) !== String(scope.programId)) {
              throw new HttpError(403, 'No puedes editar sublíneas de otro programa académico.');
            }
            if (body.research_line_id) {
              const targetLine = await client.query('SELECT program_id FROM public.research_lines WHERE research_line_id = $1', [body.research_line_id]);
              if (targetLine.rows.length === 0 || String(targetLine.rows[0].program_id) !== String(scope.programId)) {
                throw new HttpError(403, 'Solo puedes mover la sublínea a líneas de tu propio programa.');
              }
            }
          }
        }

        const colNames = cfg.columns.map((c) => c.name).filter((name) => name !== 'password' || body.password !== undefined);
        const setClause = colNames.map((name, i) => `${name} = $${i + 1}`).join(', ');
        const values = colNames.map((name) => (body[name] === '' ? null : body[name]));
        values.push(id);

        const updateSql = `UPDATE ${cfg.table} SET ${setClause} WHERE ${cfg.pk} = $${values.length};`;
        await client.query(updateSql, values);

        await logAdminTrace(client, resolvedUserId, `Edición de registro en ${cfg.label} (ID ${id})`, cfg.table, null, JSON.stringify(body));
      });

      return res.json({ success: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(`Admin DB update error (${tableKey}):`, err);
      return res.status(500).json({ error: err.detail || err.message || 'No fue posible actualizar el registro.' });
    }
  });

  // Eliminar fila
  app.delete('/api/admin/general/db/:tableKey/:id', async (req, res) => {
    const { tableKey, id } = req.params;
    const adminUserId = actorId(req);
    const cfg = getTableConfig(tableKey);
    if (!cfg) return res.status(404).json({ error: 'Tabla no reconocida.' });

    try {
      await withTransaction(pool, async (client) => {
        // Comprobaciones de alcance de origin/main, lanzadas como HttpError.
        const scope = await resolveAdminAccess(client, adminUserId, tableKey);
        if (!scope.ok || (scope.isProgramAdmin && !scope.allowedForWrite)) {
          throw new HttpError(403, 'Acceso denegado.');
        }
        const resolvedUserId = scope.resolvedUserId;

        if (scope.isProgramAdmin) {
          if (!scope.programId) {
            throw new HttpError(403, 'Tu usuario no tiene un programa académico asignado.');
          }
          if (tableKey === 'research_lines') {
            const current = await client.query('SELECT program_id FROM public.research_lines WHERE research_line_id = $1', [id]);
            if (current.rows.length === 0 || String(current.rows[0].program_id) !== String(scope.programId)) {
              throw new HttpError(403, 'No puedes eliminar líneas de investigación de otro programa académico.');
            }
          } else if (tableKey === 'research_sublines') {
            const current = await client.query(
              `SELECT rl.program_id
               FROM public.research_sublines rsl
               JOIN public.research_lines rl ON rl.research_line_id = rsl.research_line_id
               WHERE rsl.research_subline_id = $1`,
              [id],
            );
            if (current.rows.length === 0 || String(current.rows[0].program_id) !== String(scope.programId)) {
              throw new HttpError(403, 'No puedes eliminar sublíneas de otro programa académico.');
            }
          }
        }

        await client.query(`DELETE FROM ${cfg.table} WHERE ${cfg.pk} = $1;`, [id]);

        await logAdminTrace(client, resolvedUserId, `Eliminación de registro en ${cfg.label} (ID ${id})`, cfg.table, `ID ${id}`, null);
      });

      return res.json({ success: true });
    } catch (err) {
      // Se atiende antes del 409: un rechazo por permisos no es un conflicto de
      // integridad referencial y debe seguir respondiendo 403.
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(`Admin DB delete error (${tableKey}):`, err);
      // Error típico: violación de llave foránea (el registro está en uso en otra tabla)
      return res.status(409).json({ error: 'No se pudo eliminar: el registro está referenciado en otra tabla.' });
    }
  });
}
