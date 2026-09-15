import pool from '../config/db.js';
import { getUserContext, recordProjectBankHistory, computeProjectBankDiff } from '../services/project_bank_helpers.js';

export const getProjectBank = async (req, res) => {
  const { programId, status, lineId, sublineId, proposerRole, proposerId, year, search } = req.query;
  const requestingUserId = req.query.userId || req.headers['x-user-id'] || null;

  try {
    const userCtx = await getUserContext(pool, requestingUserId);

    const whereClauses = [];
    const params = [];
    let paramIndex = 1;

    if (userCtx && userCtx.is_general_admin) {
      // El Administrador General puede ver todos los programas, o filtrar
      // por uno en particular usando el selector de programa.
      const targetProgram = (programId && programId !== 'all')
        ? parseInt(programId, 10)
        : null;

      if (targetProgram) {
        whereClauses.push(`pb.program_id = $${paramIndex++}`);
        params.push(targetProgram);
      }
    } else if (userCtx && (userCtx.is_program_admin || userCtx.is_docente || userCtx.is_student)) {
      // Docentes, Administradores de Programa y Estudiantes solo ven las
      // ideas de su propio programa académico.
      if (userCtx.program_id) {
        whereClauses.push(`pb.program_id = $${paramIndex++}`);
        params.push(parseInt(userCtx.program_id, 10));
      } else {
        whereClauses.push('1 = 0');
      }
    } else {
      const targetProgram = (programId && programId !== 'all')
        ? parseInt(programId, 10)
        : null;

      if (targetProgram) {
        whereClauses.push(`pb.program_id = $${paramIndex++}`);
        params.push(targetProgram);
      }
    }

    if (proposerId) {
      // Filtro para "Mis ideas publicadas": solo las ideas propuestas por
      // el usuario indicado (docente, admin de programa o admin general).
      whereClauses.push(`pb.proposer_id::text = $${paramIndex++}`);
      params.push(String(proposerId));
    }

    if (status && status !== 'all') {
      whereClauses.push(`LOWER(pb.status) = LOWER($${paramIndex++})`);
      params.push(status);
    }
    if (lineId && lineId !== 'all') {
      whereClauses.push(`pb.research_line_id = $${paramIndex++}`);
      params.push(parseInt(lineId, 10));
    }
    if (sublineId && sublineId !== 'all') {
      whereClauses.push(`pb.research_subline_id = $${paramIndex++}`);
      params.push(parseInt(sublineId, 10));
    }
    if (proposerRole && proposerRole !== 'all') {
      whereClauses.push(`LOWER(pb.proposer_role) = LOWER($${paramIndex++})`);
      params.push(proposerRole);
    }
    if (year && year !== 'all') {
      whereClauses.push(`EXTRACT(YEAR FROM pb.created_at)::INTEGER = $${paramIndex++}`);
      params.push(parseInt(year, 10));
    }
    if (search && search.trim()) {
      whereClauses.push(`(
        pb.title ILIKE $${paramIndex} OR 
        pb.description ILIKE $${paramIndex} OR 
        pb.keywords ILIKE $${paramIndex} OR 
        u_prop.full_name ILIKE $${paramIndex}
      )`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT 
        pb.project_bank_id,
        pb.project_bank_id AS id,
        pb.title,
        pb.description,
        pb.general_objective,
        pb.specific_objectives,
        pb.research_line_id,
        rl.name AS line_name,
        pb.research_subline_id,
        rsl.name AS subline_name,
        pb.program_id,
        pr.name AS program_name,
        pb.keywords,
        pb.observations,
        pb.proposer_id,
        u_prop.full_name AS proposer_name,
        u_prop.email AS proposer_email,
        pb.proposer_role,
        pb.status,
        pb.assigned_student_id,
        u_stud.full_name AS assigned_student_name,
        u_stud.email AS assigned_student_email,
        pb.assigned_at,
        pb.created_at,
        pb.updated_at,
        EXTRACT(YEAR FROM pb.created_at)::INTEGER AS year
      FROM public.project_bank pb
      LEFT JOIN public.research_lines rl ON pb.research_line_id = rl.research_line_id
      LEFT JOIN public.research_sublines rsl ON pb.research_subline_id = rsl.research_subline_id
      LEFT JOIN public.programs pr ON pb.program_id = pr.program_id
      LEFT JOIN public.users u_prop ON pb.proposer_id = u_prop.user_id
      LEFT JOIN public.users u_stud ON pb.assigned_student_id = u_stud.user_id
      ${whereSql}
      ORDER BY pb.created_at DESC;
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get project bank error:', err);
    res.status(500).json({ error: 'Error al obtener ideas del Banco de Proyectos: ' + err.message });
  }
};

export const getProjectBankDetail = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID de proyecto no válido.' });

  const requestingUserId = req.query.userId || req.headers['x-user-id'] || null;

  try {
    const userCtx = await getUserContext(pool, requestingUserId);

    const query = `
      SELECT 
        pb.project_bank_id,
        pb.project_bank_id AS id,
        pb.title,
        pb.description,
        pb.general_objective,
        pb.specific_objectives,
        pb.research_line_id,
        rl.name AS line_name,
        pb.research_subline_id,
        rsl.name AS subline_name,
        pb.program_id,
        pr.name AS program_name,
        pb.keywords,
        pb.observations,
        pb.proposer_id,
        u_prop.full_name AS proposer_name,
        u_prop.email AS proposer_email,
        pb.proposer_role,
        pb.status,
        pb.assigned_student_id,
        u_stud.full_name AS assigned_student_name,
        u_stud.email AS assigned_student_email,
        pb.assigned_at,
        pb.created_at,
        pb.updated_at,
        EXTRACT(YEAR FROM pb.created_at)::INTEGER AS year
      FROM public.project_bank pb
      LEFT JOIN public.research_lines rl ON pb.research_line_id = rl.research_line_id
      LEFT JOIN public.research_sublines rsl ON pb.research_subline_id = rsl.research_subline_id
      LEFT JOIN public.programs pr ON pb.program_id = pr.program_id
      LEFT JOIN public.users u_prop ON pb.proposer_id = u_prop.user_id
      LEFT JOIN public.users u_stud ON pb.assigned_student_id = u_stud.user_id
      WHERE pb.project_bank_id = $1;
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Idea de proyecto no encontrada.' });
    }

    const project = result.rows[0];

    if (userCtx && userCtx.role_name === 'estudiante') {
      if (String(project.program_id) !== String(userCtx.program_id)) {
        return res.status(403).json({ error: 'Acceso denegado: este proyecto pertenece a otro programa académico.' });
      }
    }

    res.json(project);
  } catch (err) {
    console.error('Get project bank by id error:', err);
    res.status(500).json({ error: 'Error al consultar idea: ' + err.message });
  }
};

export const getProjectBankHistory = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID de proyecto no válido.' });

  const requestingUserId = req.query.userId || req.headers['x-user-id'] || null;

  try {
    const userCtx = await getUserContext(pool, requestingUserId);

    const projCheck = await pool.query('SELECT project_bank_id, program_id FROM public.project_bank WHERE project_bank_id = $1', [id]);
    if (projCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }

    if (userCtx && userCtx.role_name === 'estudiante') {
      if (String(projCheck.rows[0].program_id) !== String(userCtx.program_id)) {
        return res.status(403).json({ error: 'Acceso denegado: este proyecto pertenece a otro programa académico.' });
      }
    }

    let historyQuery = `
      SELECT 
        pbh.project_bank_history_id,
        pbh.project_bank_id,
        pbh.user_id,
        u.full_name AS user_name,
        u.email AS user_email,
        COALESCE(r.name, 'Usuario') AS user_role,
        pbh.action,
        pbh.previous_status,
        pbh.new_status,
        pbh.changes,
        pbh.created_at
      FROM public.project_bank_histories pbh
      LEFT JOIN public.users u ON pbh.user_id = u.user_id
      LEFT JOIN public.user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN public.roles r ON ur.role_id = r.role_id
      WHERE pbh.project_bank_id = $1
    `;
    const params = [id];

    if (userCtx && (userCtx.role_name === 'estudiante' || userCtx.role_name === 'docente')) {
      params.push(String(requestingUserId));
      historyQuery += `
        AND (
          pbh.user_id::text = $${params.length}
          OR LOWER(COALESCE(r.name, '')) IN ('administrador', 'admin')
          OR u.user_id ILIKE 'admin%'
          OR u.email ILIKE '%admin%'
          OR pbh.user_id IS NULL
        )
      `;
    }

    historyQuery += ` ORDER BY pbh.created_at DESC;`;

    const histRes = await pool.query(historyQuery, params);
    res.json(histRes.rows);
  } catch (err) {
    console.error('Get project bank history error:', err);
    res.status(500).json({ error: 'Error al consultar historial: ' + err.message });
  }
};

export const createProjectBankIdea = async (req, res) => {
  const {
    title,
    description,
    generalObjective,
    specificObjectives,
    researchLineId,
    researchSublineId,
    programId,
    keywords,
    observations,
    userId,
    userRole,
  } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: 'Título y descripción son campos obligatorios.' });
  }

  const userCtx = await getUserContext(pool, userId);
  const normalizedRole = (userCtx?.role_name || userRole || '').toLowerCase();
  const isAuthorized = !!userCtx
    ? (userCtx.is_general_admin || userCtx.is_program_admin || userCtx.is_docente)
    : (normalizedRole.includes('admin') || normalizedRole.includes('docente'));
  if (!isAuthorized) {
    return res.status(403).json({ error: 'No tienes permisos para crear ideas en el Banco de Proyectos.' });
  }

  // Etiqueta del proponente para mostrar en el listado público del Banco.
  const roleLabel = userCtx?.is_general_admin
    ? 'Administrador General'
    : userCtx?.is_program_admin
      ? 'Administrador de Programa'
      : userCtx?.is_docente
        ? 'Docente'
        : (normalizedRole.includes('admin') ? 'Administrador' : 'Docente');

  // El Administrador General puede proponer ideas para cualquier programa
  // (o dejarlo sin programa específico). Docentes y Administradores de
  // Programa SIEMPRE quedan restringidos a su propio programa académico,
  // sin importar lo que se haya enviado en el formulario.
  const targetProgramId = userCtx && !userCtx.is_general_admin
    ? (userCtx.program_id ? parseInt(userCtx.program_id, 10) : null)
    : (programId ? parseInt(programId, 10) : null);

  if (userCtx && !userCtx.is_general_admin && !targetProgramId) {
    return res.status(403).json({ error: 'Tu usuario no tiene un programa académico asignado; no es posible registrar la idea.' });
  }

  try {
    const insertQuery = `
      INSERT INTO public.project_bank (
        title, description, general_objective, specific_objectives,
        research_line_id, research_subline_id, program_id, keywords,
        observations, proposer_id, proposer_role, status,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Disponible', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const insertRes = await pool.query(insertQuery, [
      title.trim(),
      description.trim(),
      generalObjective?.trim() || null,
      specificObjectives?.trim() || null,
      researchLineId ? parseInt(researchLineId, 10) : null,
      researchSublineId ? parseInt(researchSublineId, 10) : null,
      targetProgramId,
      keywords?.trim() || null,
      observations?.trim() || null,
      userId,
      roleLabel,
    ]);

    const createdProject = insertRes.rows[0];

    await recordProjectBankHistory(pool, {
      projectBankId: createdProject.project_bank_id,
      userId,
      action: 'CREATE',
      previousStatus: null,
      newStatus: 'Disponible',
      changes: {
        event: 'Creación de idea en Banco de Proyectos',
        initial_status: 'Disponible',
        title: createdProject.title,
        program_id: createdProject.program_id,
      },
    });

    res.status(201).json(createdProject);
  } catch (err) {
    console.error('Create project bank error:', err);
    res.status(500).json({ error: 'Error al registrar idea de proyecto: ' + err.message });
  }
};

export const updateProjectBankIdea = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID de proyecto no válido.' });

  const {
    title,
    description,
    generalObjective,
    specificObjectives,
    researchLineId,
    researchSublineId,
    programId,
    keywords,
    observations,
    userId,
    userRole,
  } = req.body;

  try {
    const checkRes = await pool.query('SELECT * FROM public.project_bank WHERE project_bank_id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Idea de proyecto no encontrada.' });
    }

    const current = checkRes.rows[0];
    const userCtx = await getUserContext(pool, userId);
    const normalizedRole = (userCtx?.role_name || userRole || '').toLowerCase();
    const isAdmin = userCtx
      ? (userCtx.is_general_admin || userCtx.is_program_admin)
      : normalizedRole.includes('admin');
    const isOwnerTeacher = (userCtx ? userCtx.is_docente : normalizedRole.includes('docente'))
      && String(current.proposer_id) === String(userId);

    if (!isAdmin && !isOwnerTeacher) {
      return res.status(403).json({ error: 'No tienes permiso para editar este proyecto.' });
    }

    // Un Administrador de Programa (no general) no puede reasignar la idea
    // a otro programa distinto del suyo.
    if (userCtx && userCtx.is_program_admin && !userCtx.is_general_admin) {
      if (String(current.program_id) !== String(userCtx.program_id)) {
        return res.status(403).json({ error: 'No puedes editar ideas de otro programa académico.' });
      }
    }

    const effectiveProgramId = (userCtx && !userCtx.is_general_admin)
      ? userCtx.program_id
      : (programId ? parseInt(programId, 10) : current.program_id);

    const diff = computeProjectBankDiff(current, req.body);

    const updateQuery = `
      UPDATE public.project_bank
      SET 
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        general_objective = COALESCE($3, general_objective),
        specific_objectives = COALESCE($4, specific_objectives),
        research_line_id = $5,
        research_subline_id = $6,
        program_id = $7,
        keywords = COALESCE($8, keywords),
        observations = COALESCE($9, observations),
        updated_at = CURRENT_TIMESTAMP
      WHERE project_bank_id = $10
      RETURNING *;
    `;

    const updateRes = await pool.query(updateQuery, [
      title ? title.trim() : null,
      description ? description.trim() : null,
      generalObjective ? generalObjective.trim() : null,
      specificObjectives ? specificObjectives.trim() : null,
      researchLineId ? parseInt(researchLineId, 10) : null,
      researchSublineId ? parseInt(researchSublineId, 10) : null,
      effectiveProgramId ? parseInt(effectiveProgramId, 10) : null,
      keywords ? keywords.trim() : null,
      observations ? observations.trim() : null,
      id,
    ]);

    const updatedProject = updateRes.rows[0];

    await recordProjectBankHistory(pool, {
      projectBankId: id,
      userId,
      action: 'UPDATE',
      previousStatus: current.status,
      newStatus: updatedProject.status,
      changes: diff,
    });

    res.json(updatedProject);
  } catch (err) {
    console.error('Update project bank error:', err);
    res.status(500).json({ error: 'Error al actualizar idea: ' + err.message });
  }
};

export const toggleProjectBankStatus = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID de proyecto no válido.' });

  const { status, userRole, userId } = req.body;
  const userCtx = await getUserContext(pool, userId);
  const normalizedRole = (userCtx?.role_name || userRole || '').toLowerCase();
  const isAdmin = userCtx
    ? (userCtx.is_general_admin || userCtx.is_program_admin)
    : normalizedRole.includes('admin');

  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo los administradores pueden cambiar el estado del proyecto.' });
  }

  if (!['Disponible', 'Inactivo'].includes(status)) {
    return res.status(400).json({ error: 'Estado no válido para esta acción. Debe ser Disponible o Inactivo.' });
  }

  try {
    const checkRes = await pool.query('SELECT * FROM public.project_bank WHERE project_bank_id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    const current = checkRes.rows[0];

    if (userCtx && userCtx.is_program_admin && !userCtx.is_general_admin) {
      if (String(current.program_id) !== String(userCtx.program_id)) {
        return res.status(403).json({ error: 'No puedes cambiar el estado de ideas de otro programa académico.' });
      }
    }

    const updateRes = await pool.query(
      `UPDATE public.project_bank 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE project_bank_id = $2 
       RETURNING *`,
      [status, id]
    );

    const updated = updateRes.rows[0];
    const actionName = status === 'Inactivo' ? 'DEACTIVATE' : 'REACTIVATE';

    await recordProjectBankHistory(pool, {
      projectBankId: id,
      userId: userId || 'admin001',
      action: actionName,
      previousStatus: current.status,
      newStatus: status,
      changes: {
        note: status === 'Inactivo' ? 'Proyecto desactivado del Banco de Proyectos' : 'Proyecto reactivado en el Banco de Proyectos',
        previous_status: current.status,
        new_status: status,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error('Patch project bank status error:', err);
    res.status(500).json({ error: 'Error al cambiar estado: ' + err.message });
  }
};

export const selectProjectBankIdea = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID de proyecto no válido.' });

  const studentId = req.body.studentId || req.query.userId || req.headers['x-user-id'];

  if (!studentId) {
    return res.status(400).json({ error: 'Se requiere el identificador del estudiante.' });
  }

  try {
    const studentCtx = await getUserContext(pool, studentId);
    if (!studentCtx) {
      return res.status(404).json({ error: 'Estudiante no encontrado en el sistema.' });
    }

    const projectCheck = await pool.query(
      `SELECT project_bank_id, title, status, program_id FROM public.project_bank WHERE project_bank_id = $1`,
      [id]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'El proyecto no existe.' });
    }

    const targetProject = projectCheck.rows[0];

    if (!studentCtx.program_id || String(targetProject.program_id) !== String(studentCtx.program_id)) {
      return res.status(403).json({
        error: 'No puedes seleccionar este proyecto porque pertenece a un programa académico diferente.'
      });
    }

    const existingAssignment = await pool.query(
      `SELECT project_bank_id, title FROM public.project_bank 
       WHERE assigned_student_id = $1 AND status = 'Asignado'`,
      [studentId]
    );

    if (existingAssignment.rows.length > 0) {
      return res.status(400).json({
        error: 'Ya tienes un proyecto de grado asignado. Un estudiante solamente puede tener un proyecto asignado.',
        assignedProject: existingAssignment.rows[0]
      });
    }

    if (targetProject.status !== 'Disponible') {
      return res.status(400).json({
        error: `El proyecto no está disponible para selección. Estado actual: ${targetProject.status}`
      });
    }

    const assignRes = await pool.query(
      `UPDATE public.project_bank
       SET 
         status = 'Asignado',
         assigned_student_id = $1,
         assigned_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE project_bank_id = $2 AND status = 'Disponible'
       RETURNING *;`,
      [studentId, id]
    );

    if (assignRes.rows.length === 0) {
      return res.status(409).json({ error: 'El proyecto fue asignado a otro estudiante hace un instante.' });
    }

    await recordProjectBankHistory(pool, {
      projectBankId: id,
      userId: studentId,
      action: 'SELECT',
      previousStatus: 'Disponible',
      newStatus: 'Asignado',
      changes: {
        event: 'Selección y asignación oficial del proyecto de grado',
        assigned_student_id: studentId,
        student_name: studentCtx.full_name,
        student_program_id: studentCtx.program_id,
        previous_status: 'Disponible',
        new_status: 'Asignado',
      },
    });

    res.json({
      message: 'Proyecto seleccionado correctamente.',
      project: assignRes.rows[0]
    });
  } catch (err) {
    console.error('Select project bank error:', err);
    res.status(500).json({ error: 'Error al seleccionar proyecto: ' + err.message });
  }
};

export const getStudentAssignedProject = async (req, res) => {
  const { studentId } = req.params;
  try {
    const query = `
      SELECT 
        pb.project_bank_id,
        pb.project_bank_id AS id,
        pb.title,
        pb.description,
        pb.general_objective,
        pb.specific_objectives,
        pb.research_line_id,
        rl.name AS line_name,
        pb.research_subline_id,
        rsl.name AS subline_name,
        pb.program_id,
        pr.name AS program_name,
        pb.keywords,
        pb.observations,
        pb.proposer_id,
        u_prop.full_name AS proposer_name,
        u_prop.email AS proposer_email,
        pb.proposer_role,
        pb.status,
        pb.assigned_student_id,
        pb.assigned_at,
        pb.created_at,
        pb.updated_at
      FROM public.project_bank pb
      LEFT JOIN public.research_lines rl ON pb.research_line_id = rl.research_line_id
      LEFT JOIN public.research_sublines rsl ON pb.research_subline_id = rsl.research_subline_id
      LEFT JOIN public.programs pr ON pb.program_id = pr.program_id
      LEFT JOIN public.users u_prop ON pb.proposer_id = u_prop.user_id
      WHERE pb.assigned_student_id = $1 AND pb.status = 'Asignado'
      LIMIT 1;
    `;
    const result = await pool.query(query, [studentId]);

    if (result.rows.length === 0) {
      return res.json({ hasAssignedProject: false, project: null });
    }

    res.json({ hasAssignedProject: true, project: result.rows[0] });
  } catch (err) {
    console.error('Get student assigned project error:', err);
    res.status(500).json({ error: 'Error al consultar proyecto asignado: ' + err.message });
  }
};
