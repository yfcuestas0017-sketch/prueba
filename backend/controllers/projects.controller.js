import pool from '../config/db.js';
import { actorId } from '../middlewares/auth.middleware.js';
import { getUserContext } from '../services/project_bank_helpers.js';
import { withTransaction } from '../db/withTransaction.js';
import { HttpError, sendError } from '../utils/httpError.js';
import { findProjectsWithParticipants } from '../repositories/projects.repository.js';
import { buildProjectBase } from '../services/projects.mapper.js';

const STUDENT_PROJECT_BLOCK_MESSAGE = 'Este estudiante ya está vinculado a un proyecto de investigación activo y no puede registrar un nuevo proyecto.';

function isStudentProjectRole(roleName) {
  return String(roleName || '').toLowerCase().includes('estudiant');
}

function activeProjectPredicate(projectAlias = 'p', statusAlias = 's') {
  return `NOT (LOWER(COALESCE(${statusAlias}.name, '')) IN ('finalizado', 'terminado', 'cancelado'))`;
}

/**
 * Roles que pueden actuar sobre cualquier proyecto, no solo sobre el suyo.
 */
const ROLES_ADMINISTRATIVOS = ['administrador general', 'administrador', 'director'];

function esRolAdministrativo(roleName) {
  const rol = String(roleName || '').toLowerCase();
  return ROLES_ADMINISTRATIVOS.some((administrativo) => rol.includes(administrativo));
}

/**
 * Comprueba que quien pide tenga derecho sobre ESTE proyecto.
 *
 * Es el control que faltaba: los endpoints validaban que el identificador fuera
 * un número, pero no que el proyecto fuera de quien lo estaba tocando. Con la
 * identidad ya verificada por el token, aquí se cierra el segundo lado del
 * problema: cualquiera con sesión podía editar o borrar el proyecto de grado de
 * cualquier otra persona con solo cambiar el número de la URL (§6.2).
 */
async function exigirPermisoSobreProyecto(client, projectId, userId, { soloAdministrativo = false } = {}) {
  if (!userId) {
    throw new HttpError(401, 'Debes iniciar sesión para realizar esta acción.');
  }

  const contexto = await getUserContext(client, userId);
  if (esRolAdministrativo(contexto?.role_name)) return contexto;

  if (soloAdministrativo) {
    throw new HttpError(403, 'Solo un administrador o director puede realizar esta acción.');
  }

  const vinculo = await getProjectMembership(client, projectId, userId);
  if (!vinculo) {
    throw new HttpError(403, 'No tienes permisos sobre este proyecto.');
  }
  return contexto;
}

async function getProjectMembership(client, projectId, userId) {
  const result = await client.query(
    `SELECT up.project_role, p.title
     FROM public.user_projects up
     JOIN public.projects p ON p.project_id = up.project_id
     WHERE up.project_id = $1 AND up.user_id::text = $2 LIMIT 1`,
    [projectId, String(userId)],
  );
  return result.rows[0] || null;
}

async function canRegisterResearchRecord(client, projectId, userId, allowedSemesters) {
  const membership = await getProjectMembership(client, projectId, userId);
  if (!membership) return { allowed: false, error: 'No tienes permisos para registrar información en este proyecto.' };
  const semester = await client.query(
    `SELECT sem.semester_number
     FROM public.students st JOIN public.semesters sem ON sem.semester_id = st.semester_id
     WHERE st.user_id::text = $1 LIMIT 1`,
    [String(userId)],
  );
  if (!allowedSemesters.includes(Number(semester.rows[0]?.semester_number))) {
    return { allowed: false, error: 'Esta acción no corresponde a tu semestre académico.' };
  }
  return { allowed: true, membership };
}

export const getResearchProgress = async (req, res) => {
  const projectId = Number(req.params.id);
  const userId = String(actorId(req) || '');
  if (!Number.isInteger(projectId) || !userId) return res.status(400).json({ error: 'Proyecto o usuario inválido.' });
  try {
    const membership = await getProjectMembership(pool, projectId, userId);
    if (!membership) return res.status(403).json({ error: 'No tienes permisos para consultar estos avances.' });
    const result = await pool.query(
      `SELECT rp.progress_id, rp.description, rp.created_at, u.full_name AS author_name
       FROM public.research_progress rp JOIN public.users u ON u.user_id = rp.user_id
       WHERE rp.project_id = $1 ORDER BY rp.created_at DESC`,
      [projectId],
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Get research progress error:', err);
    return res.status(500).json({ error: 'No fue posible consultar los avances.' });
  }
};

export const createResearchProgress = async (req, res) => {
  const projectId = Number(req.params.id);
  const { description } = req.body || {};
  const userId = actorId(req);
  if (!Number.isInteger(projectId) || !userId || !String(description || '').trim()) return res.status(400).json({ error: 'El avance y el usuario son obligatorios.' });
  try {
    const progress = await withTransaction(pool, async (client) => {
      const access = await canRegisterResearchRecord(client, projectId, userId, [9, 10]);
      if (!access.allowed) throw new HttpError(403, access.error);
      const result = await client.query(
        `INSERT INTO public.research_progress (project_id, user_id, description)
         VALUES ($1, $2, $3) RETURNING progress_id, project_id, description, created_at`,
        [projectId, String(userId), String(description).trim()],
      );

      const histRes = await client.query(
        `INSERT INTO public.histories (description, change_type, user_id)
         VALUES ($1, 'AVANCE', $2) RETURNING history_id`,
        [`Registro de avance de investigación: ${String(description).trim().slice(0, 100)}`, String(userId)],
      );
      await client.query(
        `INSERT INTO public.project_histories (project_id, history_id) VALUES ($1, $2)`,
        [projectId, histRes.rows[0].history_id],
      );

      return result.rows[0];
    });

    return res.status(201).json({ progress });
  } catch (err) {
    return sendError(res, err, 'Create research progress error:', 'No fue posible registrar el avance.');
  }
};

export const getResearchDocuments = async (req, res) => {
  const projectId = Number(req.params.id);
  const userId = String(actorId(req) || '');
  if (!Number.isInteger(projectId) || !userId) return res.status(400).json({ error: 'Proyecto o usuario inválido.' });
  try {
    const membership = await getProjectMembership(pool, projectId, userId);
    if (!membership) return res.status(403).json({ error: 'No tienes permisos para consultar estos documentos.' });
    const result = await pool.query(
      `SELECT rd.document_id, rd.document_type, rd.file_url, rd.observations, rd.delivered_at, u.full_name AS author_name
       FROM public.research_documents rd JOIN public.users u ON u.user_id = rd.user_id
       WHERE rd.project_id = $1 ORDER BY rd.delivered_at DESC`,
      [projectId],
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Get research documents error:', err);
    return res.status(500).json({ error: 'No fue posible consultar los documentos.' });
  }
};

export const createResearchDocument = async (req, res) => {
  const projectId = Number(req.params.id);
  const { documentType, fileUrl, observations } = req.body || {};
  const userId = actorId(req);
  if (!Number.isInteger(projectId) || !userId || !String(documentType || '').trim() || !String(fileUrl || '').trim()) return res.status(400).json({ error: 'El tipo y enlace del documento son obligatorios.' });
  try {
    const document = await withTransaction(pool, async (client) => {
      const access = await canRegisterResearchRecord(client, projectId, userId, [9, 10]);
      if (!access.allowed) throw new HttpError(403, access.error);
      const result = await client.query(
        `INSERT INTO public.research_documents (project_id, user_id, document_type, file_url, observations)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING document_id, project_id, document_type, file_url, observations, delivered_at`,
        [projectId, String(userId), String(documentType).trim(), String(fileUrl).trim(), observations ? String(observations).trim() : null],
      );

      const histRes = await client.query(
        `INSERT INTO public.histories (description, change_type, user_id)
         VALUES ($1, 'DOCUMENTO', $2) RETURNING history_id`,
        [`Entrega de documento de investigación: ${String(documentType).trim()}`, String(userId)],
      );
      await client.query(
        `INSERT INTO public.project_histories (project_id, history_id) VALUES ($1, $2)`,
        [projectId, histRes.rows[0].history_id],
      );

      return result.rows[0];
    });

    return res.status(201).json({ document });
  } catch (err) {
    return sendError(res, err, 'Create research document error:', 'No fue posible registrar el documento.');
  }
};

export const getProjects = async (req, res) => {
  const { programId } = req.query;
  const parsedProgramId = programId ? parseInt(programId, 10) : null;

  try {
    const { projectRows, participantsByProject } = await findProjectsWithParticipants(pool);

    let enrichedProjects = projectRows.map((p) => {
      const participants = participantsByProject[p.project_id] || [];
      return {
        ...buildProjectBase(p, participants),
        degreeOptionId: p.degree_option_id,
        degreeOptionName: p.degree_option_name || null,
        user_projects: participants,
      };
    });

    if (parsedProgramId) {
      enrichedProjects = enrichedProjects.filter(p => String(p.programId) === String(parsedProgramId));
    }

    res.json(enrichedProjects);
  } catch (err) {
    return sendError(res, err, 'Get projects error:', 'Error al obtener proyectos.');
  }
};

export const createProject = async (req, res) => {
  const { title, code, statusId, modalityId, lineId, sublineId, letterLink, degreeOptionId, degree_option_id, creatorUserId, coauthors } = req.body;
  const finalDegreeOptionId = (degreeOptionId !== undefined ? degreeOptionId : degree_option_id) ? parseInt(degreeOptionId || degree_option_id, 10) : null;

  if (!title) {
    return res.status(400).json({ error: 'El título del proyecto es obligatorio.' });
  }

  if (!creatorUserId) {
    return res.status(400).json({ error: 'El usuario creador es obligatorio.' });
  }

  try {
    const newProj = await withTransaction(pool, async (client) => {
    const creatorRes = await client.query(
      `SELECT u.user_id, COALESCE(r.name, '') AS role_name
       FROM public.users u
       LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN public.roles r ON r.role_id = ur.role_id
       WHERE u.user_id::text = $1 LIMIT 1`,
      [String(creatorUserId)],
    );
    if (creatorRes.rows.length === 0) {
      throw new HttpError(403, 'El usuario creador no está autorizado.');
    }

    if (isStudentProjectRole(creatorRes.rows[0].role_name)) {
      const candidateIds = [String(creatorUserId), ...(Array.isArray(coauthors) ? coauthors.map((person) => String(person.id || '')).filter(Boolean) : [])];
      const uniqueCandidateIds = [...new Set(candidateIds)].sort();
      for (const candidateId of uniqueCandidateIds) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`grado-project-user:${candidateId}`]);
      }

      const candidateProjectsRes = await client.query(
        `SELECT DISTINCT ON (up.user_id) up.user_id::text, p.title, p.project_id
         FROM public.user_projects up
         JOIN public.projects p ON p.project_id = up.project_id
         LEFT JOIN public.statuses s ON s.status_id = p.status_id
         WHERE up.user_id::text = ANY($1::text[])
           AND ${activeProjectPredicate()}
         ORDER BY up.user_id, p.created_at DESC`,
        [uniqueCandidateIds],
      );
      if (candidateProjectsRes.rows.length > 0) {
        const creatorProject = candidateProjectsRes.rows.find((row) => row.user_id === String(creatorUserId));
        const conflictingMember = candidateProjectsRes.rows.find((row) => row.user_id !== String(creatorUserId));
        if (creatorProject) {
          throw new HttpError(409, STUDENT_PROJECT_BLOCK_MESSAGE);
        }
        const memberNameRes = await client.query('SELECT full_name FROM public.users WHERE user_id::text = $1', [conflictingMember.user_id]);
        const memberName = memberNameRes.rows[0]?.full_name || 'El estudiante';
        throw new HttpError(409, `${memberName} ya está vinculado al proyecto ${conflictingMember.title} y no puede ser agregado a un nuevo proyecto.`);
      }

      const semesterRes = await client.query(
        `SELECT sem.semester_number
         FROM public.students st JOIN public.semesters sem ON sem.semester_id = st.semester_id
         WHERE st.user_id::text = $1 LIMIT 1`,
        [String(creatorUserId)],
      );
      if (semesterRes.rows.length === 0 || Number(semesterRes.rows[0].semester_number) !== 8) {
        throw new HttpError(403, 'Solo estudiantes de 8° semestre sin proyecto pueden registrar una propuesta de investigación.');
      }
    }

    const insertProjectQuery = `
      INSERT INTO public.projects 
        (title, code, status_id, modality_id, research_line_id, research_subline_id, letter_link, degree_option_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING project_id, title, code, created_at, status_id, modality_id, research_line_id, research_subline_id, letter_link, degree_option_id;
    `;
    const projRes = await client.query(insertProjectQuery, [
      title.trim(),
      code ? code.trim() : null,
      statusId ? parseInt(statusId, 10) : null,
      modalityId ? parseInt(modalityId, 10) : null,
      lineId ? parseInt(lineId, 10) : null,
      sublineId ? parseInt(sublineId, 10) : null,
      letterLink ? letterLink.trim() : null,
      finalDegreeOptionId,
    ]);

    const proyecto = projRes.rows[0];

    if (creatorUserId) {
      await client.query(
        `INSERT INTO public.user_projects (project_id, user_id, project_role)
         VALUES ($1, $2, 'autor')`,
        [proyecto.project_id, String(creatorUserId)]
      );
    }

    if (Array.isArray(coauthors) && coauthors.length > 0) {
      for (const co of coauthors) {
        if (co.id && String(co.id) !== String(creatorUserId)) {
          await client.query(
            `INSERT INTO public.user_projects (project_id, user_id, project_role)
             VALUES ($1, $2, $3)`,
            [proyecto.project_id, String(co.id), co.role || 'coautor']
          );
        }
      }
    }

    const historyRes = await client.query(
      `INSERT INTO public.histories (description, change_type, user_id)
       VALUES ($1, 'CREATE', $2) RETURNING history_id`,
      ['Creación inicial del proyecto', creatorUserId ? String(creatorUserId) : null]
    );
    const historyId = historyRes.rows[0].history_id;

    await client.query(
      `INSERT INTO public.project_histories (project_id, history_id) VALUES ($1, $2)`,
      [proyecto.project_id, historyId]
    );

      return proyecto;
    });

    res.status(201).json({ project: newProj });
  } catch (err) {
    return sendError(res, err, 'Create project error:', 'Error al crear el proyecto.');
  }
};

export const updateProject = async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const { title, code, statusId, modalityId, lineId, sublineId, letterLink, degreeOptionId, degree_option_id } = req.body;
  const actingUserId = actorId(req);

  if (isNaN(projectId)) return res.status(400).json({ error: 'ID de proyecto inválido.' });

  try {
    const proyectoActualizado = await withTransaction(pool, async (client) => {
    // Editar un proyecto requiere ser administrativo o formar parte de él.
    await exigirPermisoSobreProyecto(client, projectId, actingUserId);

    const currentRes = await client.query(`
      SELECT p.*, s.name as status_name, m.name as modality_name, rl.name as line_name, rsl.name as subline_name, dopt.name as degree_option_name
      FROM public.projects p
      LEFT JOIN public.statuses s ON p.status_id = s.status_id
      LEFT JOIN public.modalities m ON p.modality_id = m.modality_id
      LEFT JOIN public.research_lines rl ON p.research_line_id = rl.research_line_id
      LEFT JOIN public.research_sublines rsl ON p.research_subline_id = rsl.research_subline_id
      LEFT JOIN public.degree_options dopt ON p.degree_option_id = dopt.degree_option_id
      WHERE p.project_id = $1
    `, [projectId]);

    if (currentRes.rows.length === 0) {
      throw new HttpError(404, 'Proyecto no encontrado.');
    }
    const oldProj = currentRes.rows[0];

    const finalStatusId = statusId !== undefined ? (statusId ? parseInt(statusId, 10) : null) : oldProj.status_id;
    const finalModalityId = modalityId !== undefined ? (modalityId ? parseInt(modalityId, 10) : null) : oldProj.modality_id;
    const finalLineId = lineId !== undefined ? (lineId ? parseInt(lineId, 10) : null) : oldProj.research_line_id;
    const finalSublineId = sublineId !== undefined ? (sublineId ? parseInt(sublineId, 10) : null) : oldProj.research_subline_id;
    const targetDegOpt = degreeOptionId !== undefined ? degreeOptionId : degree_option_id;
    const finalDegreeOptionId = targetDegOpt !== undefined ? (targetDegOpt ? parseInt(targetDegOpt, 10) : null) : oldProj.degree_option_id;

    const updateQuery = `
      UPDATE public.projects
      SET title = $1,
          code = $2,
          status_id = $3,
          modality_id = $4,
          research_line_id = $5,
          research_subline_id = $6,
          letter_link = $7,
          degree_option_id = $8
      WHERE project_id = $9
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [
      title ? title.trim() : oldProj.title,
      code !== undefined ? (code ? code.trim() : null) : oldProj.code,
      finalStatusId,
      finalModalityId,
      finalLineId,
      finalSublineId,
      letterLink !== undefined ? (letterLink ? letterLink.trim() : null) : oldProj.letter_link,
      finalDegreeOptionId,
      projectId,
    ]);

    const logHistory = async (desc, field, oldVal, newVal) => {
      const histRes = await client.query(
        `INSERT INTO public.histories (description, modified_field, old_value, new_value, change_type, user_id)
         VALUES ($1, $2, $3, $4, 'UPDATE', $5) RETURNING history_id`,
        [desc, field, oldVal ? String(oldVal) : null, newVal ? String(newVal) : null, actingUserId ? String(actingUserId) : null]
      );
      await client.query(
        'INSERT INTO public.project_histories (project_id, history_id) VALUES ($1, $2)',
        [projectId, histRes.rows[0].history_id]
      );
    };

    if (title && title.trim() !== (oldProj.title || '').trim()) {
      await logHistory(`Modificación de título: "${oldProj.title}" → "${title.trim()}"`, 'title', oldProj.title, title.trim());
    }

    if (code !== undefined && (code || '').trim() !== (oldProj.code || '').trim()) {
      await logHistory(`Modificación de código: "${oldProj.code || 'Sin código'}" → "${code ? code.trim() : 'Sin código'}"`, 'code', oldProj.code || 'Sin código', code ? code.trim() : 'Sin código');
    }

    if (statusId !== undefined && finalStatusId !== oldProj.status_id) {
      const sRes = await client.query('SELECT name FROM public.statuses WHERE status_id = $1', [finalStatusId]);
      const newStatusName = sRes.rows[0]?.name || String(finalStatusId);
      await logHistory(`Actualización de estado: ${oldProj.status_name || 'Sin estado'} → ${newStatusName}`, 'status_id', oldProj.status_name, newStatusName);
    }

    if (modalityId !== undefined && finalModalityId !== oldProj.modality_id) {
      const mRes = await client.query('SELECT name FROM public.modalities WHERE modality_id = $1', [finalModalityId]);
      const newModName = mRes.rows[0]?.name || String(finalModalityId);
      await logHistory(`Actualización de modalidad: ${oldProj.modality_name || 'Sin modalidad'} → ${newModName}`, 'modality_id', oldProj.modality_name, newModName);
    }

    if (lineId !== undefined && finalLineId !== oldProj.research_line_id) {
      const lRes = await client.query('SELECT name FROM public.research_lines WHERE research_line_id = $1', [finalLineId]);
      const newLineName = lRes.rows[0]?.name || String(finalLineId);
      await logHistory(`Actualización de línea de investigación: ${oldProj.line_name || 'Sin línea'} → ${newLineName}`, 'research_line_id', oldProj.line_name, newLineName);
    }

    if (sublineId !== undefined && finalSublineId !== oldProj.research_subline_id) {
      const slRes = await client.query('SELECT name FROM public.research_sublines WHERE research_subline_id = $1', [finalSublineId]);
      const newSublineName = slRes.rows[0]?.name || String(finalSublineId);
      await logHistory(`Actualización de sublínea de investigación: ${oldProj.subline_name || 'Sin sublínea'} → ${newSublineName}`, 'research_subline_id', oldProj.subline_name, newSublineName);
    }

    if (letterLink !== undefined && (letterLink || '').trim() !== (oldProj.letter_link || '').trim()) {
      await logHistory(`Actualización de enlace de carta de aprobación o documento`, 'letter_link', oldProj.letter_link || 'Sin enlace', letterLink ? letterLink.trim() : 'Sin enlace');
    }

    if (targetDegOpt !== undefined && finalDegreeOptionId !== oldProj.degree_option_id) {
      let newDegName = 'Opción de grado pendiente';
      if (finalDegreeOptionId) {
        const dRes = await client.query('SELECT name FROM public.degree_options WHERE degree_option_id = $1', [finalDegreeOptionId]);
        newDegName = dRes.rows[0]?.name || String(finalDegreeOptionId);
      }
      await logHistory(`Actualización de opción de grado: ${oldProj.degree_option_name || 'Opción de grado pendiente'} → ${newDegName}`, 'degree_option_id', oldProj.degree_option_name || 'Pendiente', newDegName);
    }

      return updateRes.rows[0];
    });

    res.json({ project: proyectoActualizado });
  } catch (err) {
    return sendError(res, err, 'Update project error:', 'Error al actualizar proyecto.');
  }
};

export const updateProjectParticipants = async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const { participants } = req.body;
  const actingUserId = actorId(req);

  if (isNaN(projectId)) return res.status(400).json({ error: 'ID de proyecto inválido.' });
  if (!Array.isArray(participants)) return res.status(400).json({ error: 'La lista de participantes es inválida.' });

  const VALID_ROLES = new Set(['autor', 'coautor', 'asesor', 'jurado']);
  for (const p of participants) {
    if (!p.id || !VALID_ROLES.has(p.role)) {
      return res.status(400).json({ error: 'Cada participante debe tener un usuario y un rol válido (autor, coautor, asesor o jurado).' });
    }
  }

  try {
    await withTransaction(pool, async (client) => {
      // Cambiar quién figura como autor, asesor o jurado de un proyecto es una
      // decisión administrativa, no algo que pueda hacer cualquiera que tenga
      // sesión abierta.
      await exigirPermisoSobreProyecto(client, projectId, actingUserId, { soloAdministrativo: true });

      const projRes = await client.query('SELECT project_id, title FROM public.projects WHERE project_id = $1', [projectId]);
      if (projRes.rows.length === 0) {
        throw new HttpError(404, 'Proyecto no encontrado.');
      }

      await client.query('DELETE FROM public.user_projects WHERE project_id = $1', [projectId]);

      const seen = new Set();
      for (const p of participants) {
        const key = `${p.id}:${p.role}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await client.query(
          `INSERT INTO public.user_projects (project_id, user_id, project_role) VALUES ($1, $2, $3)`,
          [projectId, String(p.id), p.role]
        );
      }

      const historyRes = await client.query(
        `INSERT INTO public.histories (description, change_type, user_id)
         VALUES ('Actualización del equipo del proyecto (autores, asesor, jurados)', 'UPDATE', $1) RETURNING history_id`,
        [actingUserId ? String(actingUserId) : null]
      );
      await client.query(
        'INSERT INTO public.project_histories (project_id, history_id) VALUES ($1, $2)',
        [projectId, historyRes.rows[0].history_id]
      );
    });

    // La lectura del equipo se hace después de confirmar la transacción, igual
    // que antes: devuelve el estado ya persistido.
    const teamRes = await pool.query(
      `SELECT up.user_id, COALESCE(up.project_role, 'autor') as project_role, u.full_name, u.email, u.program_id, pr.name as program_name
       FROM public.user_projects up
       JOIN public.users u ON up.user_id = u.user_id
       LEFT JOIN public.programs pr ON u.program_id = pr.program_id
       WHERE up.project_id = $1`,
      [projectId]
    );

    res.json({
      success: true,
      participants: teamRes.rows.map(r => ({
        id: String(r.user_id), name: r.full_name, email: r.email, role: r.project_role, program: r.program_name,
      })),
    });
  } catch (err) {
    return sendError(res, err, 'Update project team error:', 'Error al actualizar el equipo del proyecto.');
  }
};

export const deleteProject = async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'ID de proyecto inválido.' });

  try {
    await withTransaction(pool, async (client) => {
      await exigirPermisoSobreProyecto(client, projectId, actorId(req), { soloAdministrativo: true });

      await client.query('DELETE FROM public.project_histories WHERE project_id = $1', [projectId]);
      await client.query('DELETE FROM public.user_projects WHERE project_id = $1', [projectId]);
      const borrado = await client.query('DELETE FROM public.projects WHERE project_id = $1 RETURNING project_id', [projectId]);
      // Antes esto devolvía 200 aunque el proyecto no existiera (acción 1.5 del informe).
      if (borrado.rows.length === 0) {
        throw new HttpError(404, 'Proyecto no encontrado.');
      }
    });

    res.json({ success: true, message: 'Proyecto eliminado correctamente.' });
  } catch (err) {
    return sendError(res, err, 'Delete project error:', 'Error al eliminar proyecto.');
  }
};

export const getProjectHistory = async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'ID de proyecto inválido.' });

  const requestingUserId = actorId(req);

  try {
    const userCtx = await getUserContext(pool, requestingUserId);

    let query = `
      SELECT 
        h.history_id, 
        h.description, 
        h.modified_field, 
        h.old_value, 
        h.new_value, 
        h.change_type, 
        h.changed_at,
        h.user_id,
        u.full_name AS user_name,
        u.email AS user_email,
        u.program_id,
        p.name AS program_name,
        COALESCE(r.name, 'Usuario') AS user_role
      FROM public.histories h
      LEFT JOIN public.users u ON u.user_id::text = h.user_id::text
      LEFT JOIN public.programs p ON p.program_id = u.program_id
      LEFT JOIN public.user_roles ur ON ur.user_id::text = u.user_id::text
      LEFT JOIN public.roles r ON r.role_id = ur.role_id
      JOIN public.project_histories ph ON ph.history_id = h.history_id
      WHERE ph.project_id = $1
    `;
    const params = [projectId];

    if (userCtx && (userCtx.role_name === 'estudiante' || userCtx.role_name === 'docente')) {
      params.push(String(requestingUserId));
      query += `
        AND (
          h.user_id::text = $${params.length}
          OR LOWER(COALESCE(r.name, '')) IN ('administrador', 'admin')
          OR u.user_id ILIKE 'admin%'
          OR u.email ILIKE '%admin%'
          OR h.user_id IS NULL
        )
      `;
    }

    query += ` ORDER BY h.changed_at DESC;`;
    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ error: 'Error al cargar historial.' });
  }
};
