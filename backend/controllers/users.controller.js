import pool from '../config/db.js';
import { actorId } from '../middlewares/auth.middleware.js';
import { withTransaction } from '../db/withTransaction.js';
import { HttpError, sendError } from '../utils/httpError.js';

/**
 * Solo la propia persona —o alguien administrativo— puede consultar o cambiar
 * los datos académicos de un estudiante.
 *
 * Antes estos endpoints solo comprobaban que el identificador de la URL fuera
 * válido: cambiando ese identificador cualquiera podía leer el proceso de
 * investigación de otro estudiante o moverlo de semestre (§6.2 de la auditoría).
 */
async function exigirPropioOAdministrativo(client, req, targetUserId) {
  const solicitante = actorId(req);
  if (!solicitante) throw new HttpError(401, 'Debes iniciar sesión para realizar esta acción.');
  if (String(solicitante) === String(targetUserId)) return;
  if (await assertAdmin(client, solicitante)) return;
  throw new HttpError(403, 'No tienes permisos para consultar o modificar los datos de otro estudiante.');
}

export const checkCoauthor = async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email requerido.' });

  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.program_id, p.name as program_name
       FROM public.users u
       LEFT JOIN public.programs p ON u.program_id = p.program_id
       WHERE LOWER(u.email) = LOWER($1)
       LIMIT 1`,
      [String(email).trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'El usuario con ese correo no fue encontrado en el sistema.' });
    }

    const row = result.rows[0];
    res.json({
      user: {
        user_id: String(row.user_id),
        full_name: row.full_name,
        email: row.email,
        program_id: row.program_id,
        program_name: row.program_name,
      },
    });
  } catch (err) {
    console.error('Check coauthor error:', err);
    res.status(500).json({ error: 'Error al verificar usuario.' });
  }
};

function activeProjectPredicate(projectAlias = 'p', statusAlias = 's') {
  return `NOT (LOWER(COALESCE(${statusAlias}.name, '')) IN ('finalizado', 'terminado', 'cancelado'))`;
}

export const getStudentResearchProcess = async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  if (!userId) return res.status(400).json({ error: 'Usuario inválido.' });

  try {
    await exigirPropioOAdministrativo(pool, req, userId);

    const studentRes = await pool.query(
      `SELECT s.user_id, sem.semester_number
       FROM public.students s
       JOIN public.semesters sem ON sem.semester_id = s.semester_id
       WHERE s.user_id::text = $1 LIMIT 1`,
      [userId],
    );
    if (studentRes.rows.length === 0) {
      return res.json({ semesterNumber: null, phase: null, project: null, canCreate: false, reason: 'semester_missing' });
    }

    const semesterNumber = Number(studentRes.rows[0].semester_number);
    const phase = semesterNumber === 8 ? 'I' : semesterNumber === 9 ? 'II' : semesterNumber === 10 ? 'III' : null;
    const projectRes = await pool.query(
      `SELECT p.project_id, p.title, p.code, p.created_at, p.finished_at, p.letter_link,
              p.status_id, p.modality_id, p.research_line_id, p.research_subline_id, p.degree_option_id,
              s.name AS status_name, m.name AS modality_name,
              rl.name AS line_name, rsl.name AS subline_name,
              dopt.name AS degree_option_name,
              COALESCE((SELECT json_agg(json_build_object('id', u.user_id, 'name', u.full_name, 'email', u.email, 'role', COALESCE(up2.project_role, 'autor')) ORDER BY u.full_name)
                        FROM public.user_projects up2 JOIN public.users u ON u.user_id = up2.user_id
                        WHERE up2.project_id = p.project_id), '[]'::json) AS participants
       FROM public.user_projects up
       JOIN public.projects p ON p.project_id = up.project_id
       LEFT JOIN public.statuses s ON s.status_id = p.status_id
       LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
       LEFT JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
       LEFT JOIN public.research_sublines rsl ON rsl.research_subline_id = p.research_subline_id
       LEFT JOIN public.degree_options dopt ON dopt.degree_option_id = p.degree_option_id
       WHERE up.user_id::text = $1
       ORDER BY CASE WHEN ${activeProjectPredicate()} THEN 0 ELSE 1 END, p.created_at DESC
       LIMIT 1`,
      [userId],
    );
    const row = projectRes.rows[0];
    const project = row ? {
      id: row.project_id,
      title: row.title,
      code: row.code,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
      letterLink: row.letter_link,
      status: row.status_name,
      modality: row.modality_name,
      line: row.line_name,
      subline: row.subline_name,
      degreeOptionId: row.degree_option_id,
      degreeOptionName: row.degree_option_name || null,
      participants: row.participants || [],
    } : null;

    return res.json({
      semesterNumber,
      phase,
      project,
      canCreate: semesterNumber === 8 && !project,
      reason: project ? 'project_exists' : semesterNumber === 8 ? null : 'previous_proposal_required',
    });
  } catch (err) {
    return sendError(res, err, 'Student research process error:', 'No fue posible consultar el proceso académico.');
  }
};

export const updateStudentAcademicProfile = async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  const semesterId = Number(req.body?.semesterId);
  if (!userId || !Number.isInteger(semesterId)) return res.status(400).json({ error: 'Selecciona un semestre válido.' });

  try {
    const curriculumId = await withTransaction(pool, async (client) => {
      await exigirPropioOAdministrativo(client, req, userId);

      const userRes = await client.query('SELECT user_id FROM public.users WHERE user_id::text = $1 LIMIT 1', [userId]);
      if (userRes.rows.length === 0) {
        throw new HttpError(404, 'Usuario no encontrado.');
      }
      const semesterRes = await client.query('SELECT semester_id FROM public.semesters WHERE semester_id = $1 LIMIT 1', [semesterId]);
      if (semesterRes.rows.length === 0) {
        throw new HttpError(400, 'El semestre seleccionado no existe.');
      }
      const curriculumRes = await client.query(
        `SELECT curriculum_id FROM public.academic_curricula WHERE LOWER(status) = 'activo' ORDER BY curriculum_id LIMIT 1`,
      );
      if (curriculumRes.rows.length === 0) {
        throw new HttpError(400, 'No existe un currículo académico activo.');
      }
      const existingStudent = await client.query('SELECT student_id FROM public.students WHERE user_id::text = $1 ORDER BY student_id LIMIT 1', [userId]);
      if (existingStudent.rows.length > 0) {
        await client.query(
          'UPDATE public.students SET semester_id = $1, curriculum_id = $2 WHERE student_id = $3',
          [semesterId, curriculumRes.rows[0].curriculum_id, existingStudent.rows[0].student_id],
        );
      } else {
        await client.query(
          `INSERT INTO public.students (user_id, semester_id, curriculum_id)
           VALUES ($1, $2, $3)`,
          [userId, semesterId, curriculumRes.rows[0].curriculum_id],
        );
      }
      return curriculumRes.rows[0].curriculum_id;
    });

    return res.json({ success: true, semesterId, curriculumId });
  } catch (err) {
    return sendError(res, err, 'Update academic profile error:', 'No fue posible guardar el semestre académico.');
  }
};

async function assertAdmin(client, userId) {
  const result = await client.query(
    `SELECT 1 FROM public.user_roles ur
     JOIN public.roles r ON r.role_id = ur.role_id
     WHERE ur.user_id::text = $1 AND LOWER(r.name) LIKE '%admin%' LIMIT 1`,
    [String(userId)],
  );
  return result.rows.length > 0;
}

export const getAcademicSettings = async (req, res) => {
  try {
    if (!(await assertAdmin(pool, actorId(req)))) return res.status(403).json({ error: 'No tienes permisos para administrar el calendario académico.' });
    const [semesters, students] = await Promise.all([
      pool.query('SELECT semester_id, semester_number, start_date, end_date FROM public.semesters ORDER BY semester_number'),
      pool.query(
        `SELECT u.user_id, u.full_name, u.email, sem.semester_number, st.semester_id, p.project_id, p.title, p.code
         FROM public.users u
         JOIN public.user_roles ur ON ur.user_id = u.user_id
         JOIN public.roles r ON r.role_id = ur.role_id AND LOWER(r.name) LIKE '%estudiant%'
         LEFT JOIN public.students st ON st.user_id = u.user_id
         LEFT JOIN public.semesters sem ON sem.semester_id = st.semester_id
         LEFT JOIN public.user_projects up ON up.user_id = u.user_id
         LEFT JOIN public.projects p ON p.project_id = up.project_id
         ORDER BY u.full_name`,
      ),
    ]);
    return res.json({ semesters: semesters.rows, students: students.rows });
  } catch (err) {
    return sendError(res, err, 'Academic settings error:', 'No fue posible cargar la configuración académica.');
  }
};

export const updateSemesterDates = async (req, res) => {
  const semesterId = Number(req.params.id);
  const { startDate, endDate } = req.body || {};
  const userId = actorId(req);
  if (!Number.isInteger(semesterId)) return res.status(400).json({ error: 'Semestre inválido.' });
  try {
    const semester = await withTransaction(pool, async (client) => {
      if (!(await assertAdmin(client, userId))) {
        throw new HttpError(403, 'No tienes permisos para administrar el calendario académico.');
      }
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        throw new HttpError(400, 'La fecha de inicio no puede ser posterior a la fecha de fin.');
      }
      const result = await client.query(
        `UPDATE public.semesters SET start_date = $1::date, end_date = $2::date WHERE semester_id = $3
         RETURNING semester_id, semester_number, start_date, end_date`,
        [startDate || null, endDate || null, semesterId],
      );
      return result.rows[0];
    });

    return res.json({ semester });
  } catch (err) {
    return sendError(res, err, 'Semester dates error:', 'No fue posible guardar las fechas.');
  }
};

export const applyAcademicPromotion = async (req, res) => {
  const { referenceDate } = req.body || {};
  const userId = actorId(req);
  try {
    const promovidos = await withTransaction(pool, async (client) => {
      if (!(await assertAdmin(client, userId))) {
        throw new HttpError(403, 'No tienes permisos para aplicar promociones académicas.');
      }
      const today = referenceDate || new Date().toISOString().slice(0, 10);
      const result = await client.query(
      `WITH eligible AS (
         SELECT st.student_id, s2.semester_id AS next_semester_id, sem.semester_number
         FROM public.students st
         JOIN public.semesters sem ON sem.semester_id = st.semester_id
         JOIN public.semesters s2 ON s2.semester_number = sem.semester_number + 1
         WHERE sem.end_date IS NOT NULL AND sem.end_date < $1::date AND sem.semester_number IN (8, 9)
       )
       UPDATE public.students st SET semester_id = eligible.next_semester_id
       FROM eligible WHERE st.student_id = eligible.student_id
       RETURNING st.user_id, eligible.semester_number AS previous_semester, eligible.semester_number + 1 AS new_semester`,
        [today],
      );
      return result.rows;
    });

    return res.json({ promoted: promovidos.length, students: promovidos });
  } catch (err) {
    return sendError(res, err, 'Academic promotion error:', 'No fue posible aplicar la promoción académica.');
  }
};
