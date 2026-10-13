import { randomUUID } from 'crypto';
import pool from '../config/db.js';
import { actorId } from '../middlewares/auth.middleware.js';
import { withTransaction } from '../db/withTransaction.js';
import { HttpError, sendError } from '../utils/httpError.js';
import { hashPassword } from '../utils/password.js';
import { getUserContext } from '../services/project_bank_helpers.js';
import { getApprovedPhaseTransition } from '../services/project-lifecycle.js';

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
    const semesterPhase = semesterNumber === 8 ? 'I' : semesterNumber === 9 ? 'II' : semesterNumber === 10 ? 'III' : null;
    const projectRes = await pool.query(
      `SELECT p.project_id, p.title, p.code, p.created_at, p.finished_at, p.letter_link,
              p.status_id, p.modality_id, p.research_line_id, p.research_subline_id, p.degree_option_id,
              p.process_stage, p.process_phase,
              s.name AS status_name, m.name AS modality_name,
              rl.name AS line_name, rsl.name AS subline_name,
              dopt.name AS degree_option_name,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', grade.grade_id,
                  'phase', grade.process_phase,
                  'score', grade.score,
                  'observations', grade.observations,
                  'createdAt', grade.created_at,
                  'evaluator', evaluator.full_name
                ) ORDER BY grade.process_phase NULLS FIRST, grade.created_at, grade.grade_id)
                FROM public.project_grades grade
                LEFT JOIN public.users evaluator ON evaluator.user_id = grade.evaluator_id
                WHERE grade.project_id = p.project_id
              ), '[]'::json) AS phase_grades,
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
      processStage: row.process_stage,
      processPhase: row.process_phase === null ? null : Number(row.process_phase),
      phaseGrades: row.phase_grades || [],
      participants: row.participants || [],
    } : null;
    const projectPhase = project?.processStage === 'investigacion' && project.processPhase
      ? ({ 1: 'I', 2: 'II', 3: 'III' })[project.processPhase]
      : null;
    const phase = project ? projectPhase : semesterPhase;

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

async function requireStudentAdmin(client, userId, targetProgramId = null) {
  const context = await getUserContext(client, userId);
  if (!context?.is_program_admin && !context?.is_general_admin) {
    throw new HttpError(403, 'Solo un administrador de programa o administrador general puede gestionar estudiantes.');
  }
  const programId = context.is_general_admin ? Number(targetProgramId) : Number(context.program_id);
  if (!Number.isInteger(programId) || programId <= 0) {
    throw new HttpError(400, 'Selecciona un programa académico válido.');
  }
  if (context.is_program_admin && String(programId) !== String(context.program_id)) {
    throw new HttpError(403, 'Solo puedes gestionar estudiantes de tu programa académico.');
  }
  return { context, programId };
}

async function requireTeacherAdmin(client, userId, targetProgramId) {
  const context = await getUserContext(client, userId);
  if (!context?.is_program_admin && !context?.is_general_admin) {
    throw new HttpError(403, 'Solo un administrador de programa o administrador general puede importar docentes.');
  }
  const programId = Number(targetProgramId);
  if (!Number.isInteger(programId) || programId <= 0) {
    throw new HttpError(400, 'Selecciona un programa académico válido.');
  }
  if (context.is_program_admin && String(programId) !== String(context.program_id)) {
    throw new HttpError(403, 'Solo puedes importar docentes para tu programa académico.');
  }
  return { context, programId };
}

async function advanceApprovedProjectsForAuthors(client, studentUserIds, actingUserId) {
  if (studentUserIds.length === 0) return 0;

  const projectsRes = await client.query(
    `SELECT DISTINCT up.project_id
     FROM public.user_projects up
     WHERE up.user_id::text = ANY($1::text[])
       AND LOWER(COALESCE(up.project_role, '')) IN ('autor', 'coautor')
     ORDER BY up.project_id`,
    [studentUserIds],
  );
  if (projectsRes.rows.length === 0) return 0;

  const inProgressStatus = await client.query(
    `SELECT status_id FROM public.statuses WHERE LOWER(name) = 'en curso' ORDER BY status_id LIMIT 1`,
  );
  if (!inProgressStatus.rows[0]) {
    throw new HttpError(409, 'No está configurado el estado En curso para los proyectos.');
  }

  let advanced = 0;
  for (const { project_id: projectId } of projectsRes.rows) {
    const projectRes = await client.query(
      `SELECT p.project_id, p.process_stage, p.process_phase, p.status_id, s.name AS status_name
       FROM public.projects p
       LEFT JOIN public.statuses s ON s.status_id = p.status_id
       WHERE p.project_id = $1
       FOR UPDATE OF p`,
      [projectId],
    );
    const project = projectRes.rows[0];
    if (!project) continue;

    const phase = Number(project.process_phase);
    if (project.process_stage !== 'investigacion'
      || ![1, 2].includes(phase)
      || String(project.status_name || '').trim().toLowerCase() !== 'aprobado') {
      continue;
    }
    const targetSemester = phase + 8;
    const authorsRes = await client.query(
      `SELECT COUNT(*) FILTER (WHERE authors.is_student)::int AS student_authors,
              COUNT(*) FILTER (
                WHERE authors.is_student AND authors.semester_number = $2
              )::int AS authors_at_target_semester
       FROM (
         SELECT up.user_id,
                EXISTS (
                  SELECT 1
                  FROM public.user_roles ur
                  JOIN public.roles r ON r.role_id = ur.role_id
                  WHERE ur.user_id = up.user_id AND LOWER(r.name) LIKE '%estudiant%'
                ) AS is_student,
                semester.semester_number
         FROM public.user_projects up
         LEFT JOIN LATERAL (
           SELECT sem.semester_number
           FROM public.students st
           JOIN public.semesters sem ON sem.semester_id = st.semester_id
           WHERE st.user_id = up.user_id
           ORDER BY st.student_id
           LIMIT 1
         ) semester ON true
         WHERE up.project_id = $1
           AND LOWER(COALESCE(up.project_role, '')) IN ('autor', 'coautor')
       ) authors`,
      [projectId, targetSemester],
    );
    const authorCounts = authorsRes.rows[0];
    const hasStudentAuthors = Number(authorCounts?.student_authors) > 0;
    const allAuthorsAtTargetSemester = hasStudentAuthors
      && Number(authorCounts.student_authors) === Number(authorCounts.authors_at_target_semester);
    const transition = getApprovedPhaseTransition({
      stage: project.process_stage,
      phase,
      semesterNumber: targetSemester,
      statusName: project.status_name,
      allAuthorsAtTargetSemester,
    });
    if (!transition) continue;

    const updated = await client.query(
      `UPDATE public.projects
       SET process_phase = $1, status_id = $2
       WHERE project_id = $3
         AND process_stage = 'investigacion'
         AND process_phase = $4
         AND status_id = $5
       RETURNING project_id`,
      [transition.phase, inProgressStatus.rows[0].status_id, projectId, phase, project.status_id],
    );
    if (updated.rows.length === 0) continue;

    const history = await client.query(
      `INSERT INTO public.histories
         (description, modified_field, old_value, new_value, change_type, user_id)
       VALUES ($1, 'process_phase', $2, $3, 'PROMOCION_FASE', $4)
       RETURNING history_id`,
      [
        `Avance automático por actualización de semestre: Investigación ${['', 'I', 'II', 'III'][phase]} → Investigación ${['', 'I', 'II', 'III'][transition.phase]}.`,
        `Investigación ${['', 'I', 'II', 'III'][phase]} · ${project.status_name}`,
        `Investigación ${['', 'I', 'II', 'III'][transition.phase]} · ${transition.statusName}`,
        String(actingUserId),
      ],
    );
    await client.query(
      `INSERT INTO public.project_histories (project_id, history_id) VALUES ($1, $2)`,
      [projectId, history.rows[0].history_id],
    );
    advanced += 1;
  }

  return advanced;
}

export const getAdminStudents = async (req, res) => {
  const semesterId = req.query.semesterId ? Number(req.query.semesterId) : null;
  const requestedProgramId = req.query.programId ? Number(req.query.programId) : null;
  if (req.query.semesterId && !Number.isInteger(semesterId)) {
    return res.status(400).json({ error: 'Semestre inválido.' });
  }

  try {
    const { programId } = await requireStudentAdmin(pool, actorId(req), requestedProgramId);
    const students = await pool.query(
      `SELECT u.user_id::text, u.full_name, u.email, u.program_id,
              COALESCE(u.is_active, true) AS is_active,
              st.semester_id, sem.semester_number,
              COUNT(DISTINCT p.project_id)::int AS project_count
       FROM public.users u
       JOIN public.user_roles ur ON ur.user_id = u.user_id
       JOIN public.roles r ON r.role_id = ur.role_id AND LOWER(r.name) LIKE '%estudiant%'
       LEFT JOIN public.students st ON st.user_id = u.user_id
       LEFT JOIN public.semesters sem ON sem.semester_id = st.semester_id
       LEFT JOIN public.user_projects up ON up.user_id = u.user_id
       LEFT JOIN public.projects p ON p.project_id = up.project_id
       WHERE u.program_id = $1
         AND ($2::int IS NULL OR st.semester_id = $2)
       GROUP BY u.user_id, u.full_name, u.email, u.program_id, u.is_active,
                st.semester_id, sem.semester_number
       ORDER BY sem.semester_number NULLS LAST, u.full_name`,
      [programId, semesterId],
    );
    return res.json({ programId, students: students.rows });
  } catch (err) {
    return sendError(res, err, 'Get admin students error:', 'No fue posible consultar los estudiantes.');
  }
};

export const importAdminStudents = async (req, res) => {
  const rows = req.body?.students;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'El archivo no contiene filas de estudiantes válidas.' });
  }
  if (rows.length > 2000) {
    return res.status(400).json({ error: 'La importación permite un máximo de 2000 estudiantes por archivo.' });
  }

  const seenEmails = new Set();
  const students = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const fullName = String(row.full_name || '').trim();
    const email = String(row.email || '').trim().toLowerCase();
    const programName = String(row.program_name || '').trim();
    const semesterNumber = Number(row.semester_number);
    const rowNumber = index + 2;
    if (!fullName || fullName.length > 255 || email.length > 255
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !programName || programName.length > 255
      || !Number.isInteger(semesterNumber) || semesterNumber <= 0) {
      return res.status(400).json({
        error: `La fila ${rowNumber} debe incluir full_name, email válido, program_name y semester_number.`,
      });
    }
    if (seenEmails.has(email)) {
      return res.status(400).json({ error: `El correo ${email} está repetido en el archivo (fila ${rowNumber}).` });
    }
    seenEmails.add(email);
    students.push({ fullName, email, programName, semesterNumber, rowNumber });
  }

  try {
    const imported = await withTransaction(pool, async (client) => {
      const programNames = [...new Set(students.map((student) => student.programName.toLocaleLowerCase()))];
      if (programNames.length !== 1) {
        throw new HttpError(400, 'Todas las filas deben pertenecer al mismo programa académico.');
      }
      const program = await client.query(
        `SELECT program_id, name
         FROM public.programs
         WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1))`,
        [students[0].programName],
      );
      if (program.rows.length === 0) {
        throw new HttpError(400, `No existe un programa académico con el nombre "${students[0].programName}".`);
      }
      if (program.rows.length > 1) {
        throw new HttpError(409, `El nombre "${students[0].programName}" corresponde a más de un programa. Contacta al administrador.`);
      }
      const { programId } = await requireStudentAdmin(client, actorId(req), program.rows[0].program_id);

      const semesters = await client.query(
        'SELECT semester_id, semester_number FROM public.semesters WHERE semester_number = ANY($1::int[])',
        [[...new Set(students.map((student) => student.semesterNumber))]],
      );
      const semesterIds = new Map(semesters.rows.map((semester) => [
        Number(semester.semester_number),
        Number(semester.semester_id),
      ]));
      const missingSemester = students.find((student) => !semesterIds.has(student.semesterNumber));
      if (missingSemester) {
        throw new HttpError(400, `El semestre ${missingSemester.semesterNumber} de la fila ${missingSemester.rowNumber} no existe.`);
      }

      const role = await client.query(
        "SELECT role_id FROM public.roles WHERE LOWER(name) = 'estudiante' ORDER BY role_id LIMIT 1",
      );
      if (!role.rows[0]) throw new HttpError(409, 'No está configurado el rol Estudiante.');

      const curriculum = await client.query(
        `SELECT curriculum_id
         FROM public.academic_curricula
         WHERE program_id = $1 AND LOWER(status) = 'activo'
         ORDER BY curriculum_id LIMIT 1`,
        [programId],
      );
      if (!curriculum.rows[0]) {
        throw new HttpError(409, 'No existe un currículo académico activo para el programa seleccionado.');
      }

      const passwordHash = await hashPassword('12345678');
      let created = 0;
      let updated = 0;
      const updatedStudentIds = [];
      for (const student of students) {
        const existingUser = await client.query(
          `SELECT u.user_id::text, u.program_id,
                  EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    JOIN public.roles r ON r.role_id = ur.role_id
                    WHERE ur.user_id = u.user_id AND LOWER(r.name) LIKE '%estudiant%'
                  ) AS is_student
           FROM public.users u
           WHERE LOWER(TRIM(u.email)) = $1
           LIMIT 1
           FOR UPDATE`,
          [student.email],
        );
        const semesterId = semesterIds.get(student.semesterNumber);
        if (existingUser.rows[0]) {
          const existing = existingUser.rows[0];
          if (!existing.is_student) {
            throw new HttpError(409, `El correo ${student.email} ya pertenece a un usuario que no tiene rol de estudiante.`);
          }
          if (String(existing.program_id) !== String(programId)) {
            throw new HttpError(409, `El estudiante ${student.email} ya está asociado a otro programa; no se modificó su cuenta.`);
          }
          const studentProfile = await client.query(
            `SELECT student_id FROM public.students
             WHERE user_id::text = $1 ORDER BY student_id LIMIT 1 FOR UPDATE`,
            [existing.user_id],
          );
          if (studentProfile.rows[0]) {
            await client.query(
              'UPDATE public.students SET semester_id = $1 WHERE student_id = $2',
              [semesterId, studentProfile.rows[0].student_id],
            );
          } else {
            await client.query(
              'INSERT INTO public.students (user_id, semester_id, curriculum_id) VALUES ($1, $2, $3)',
              [existing.user_id, semesterId, curriculum.rows[0].curriculum_id],
            );
          }
          updatedStudentIds.push(existing.user_id);
          updated += 1;
          continue;
        }

        const userId = randomUUID();
        await client.query(
          `INSERT INTO public.users (user_id, full_name, email, password, program_id, is_active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [userId, student.fullName, student.email, passwordHash, programId],
        );
        await client.query(
          'INSERT INTO public.user_roles (user_id, role_id) VALUES ($1, $2)',
          [userId, role.rows[0].role_id],
        );
        await client.query(
          'INSERT INTO public.students (user_id, semester_id, curriculum_id) VALUES ($1, $2, $3)',
          [userId, semesterId, curriculum.rows[0].curriculum_id],
        );
        created += 1;
      }

      const advancedProjects = await advanceApprovedProjectsForAuthors(
        client,
        [...new Set(updatedStudentIds)],
        actorId(req),
      );
      return { created, updated, total: students.length, advancedProjects };
    });
    return res.status(200).json(imported);
  } catch (err) {
    return sendError(res, err, 'Import admin students error:', 'No fue posible importar los estudiantes.');
  }
};

export const importAdminTeachers = async (req, res) => {
  const rows = req.body?.teachers;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'El archivo no contiene filas de docentes válidas.' });
  }
  if (rows.length > 2000) {
    return res.status(400).json({ error: 'La importación permite un máximo de 2000 docentes por archivo.' });
  }

  const seenEmails = new Set();
  const teachers = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const fullName = String(row.full_name || '').trim();
    const email = String(row.email || '').trim().toLowerCase();
    const programName = String(row.program_name || '').trim();
    const rowNumber = index + 2;
    if (!fullName || fullName.length > 255 || email.length > 255
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !programName || programName.length > 255) {
      return res.status(400).json({
        error: `La fila ${rowNumber} debe incluir full_name, email válido y program_name.`,
      });
    }
    if (seenEmails.has(email)) {
      return res.status(400).json({ error: `El correo ${email} está repetido en el archivo (fila ${rowNumber}).` });
    }
    seenEmails.add(email);
    teachers.push({ fullName, email, programName, rowNumber });
  }

  try {
    const imported = await withTransaction(pool, async (client) => {
      const programNames = [...new Set(teachers.map((teacher) => teacher.programName.toLocaleLowerCase()))];
      if (programNames.length !== 1) {
        throw new HttpError(400, 'Todas las filas deben pertenecer al mismo programa académico.');
      }
      const program = await client.query(
        `SELECT program_id, name
         FROM public.programs
         WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1))`,
        [teachers[0].programName],
      );
      if (program.rows.length === 0) {
        throw new HttpError(400, `No existe un programa académico con el nombre "${teachers[0].programName}".`);
      }
      if (program.rows.length > 1) {
        throw new HttpError(409, `El nombre "${teachers[0].programName}" corresponde a más de un programa. Contacta al administrador.`);
      }
      const { programId } = await requireTeacherAdmin(client, actorId(req), program.rows[0].program_id);

      const role = await client.query(
        `SELECT role_id
         FROM public.roles
        WHERE LOWER(name) LIKE '%docent%' OR LOWER(name) LIKE '%profesor%'
         ORDER BY CASE WHEN LOWER(name) = 'docente' THEN 0 ELSE 1 END, role_id
         LIMIT 1`,
      );
      if (!role.rows[0]) throw new HttpError(409, 'No está configurado el rol Docente.');

      const passwordHash = await hashPassword('12345678');
      let created = 0;
      let updated = 0;
      for (const teacher of teachers) {
        const existingUser = await client.query(
          `SELECT u.user_id::text,
                  EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    JOIN public.roles r ON r.role_id = ur.role_id
                    WHERE ur.user_id = u.user_id
                      AND (
                        LOWER(r.name) LIKE '%docent%'
                        OR LOWER(r.name) LIKE '%profesor%'
                      )
                  )
                  OR u.user_id ILIKE 'doc%'
                  OR u.email ILIKE '%docente%'
                  AS is_teacher
           FROM public.users u
           WHERE LOWER(BTRIM(u.email)) = $1
           LIMIT 1
           FOR UPDATE`,
          [teacher.email],
        );
        if (existingUser.rows[0]) {
          const existing = existingUser.rows[0];
          if (!existing.is_teacher) {
            throw new HttpError(409, `El correo ${teacher.email} ya pertenece a un usuario que no tiene rol de docente.`);
          }
          await client.query(
            'UPDATE public.users SET full_name = $1, program_id = $2 WHERE user_id::text = $3',
            [teacher.fullName, programId, existing.user_id],
          );
          updated += 1;
          continue;
        }

        const userId = randomUUID();
        await client.query(
          `INSERT INTO public.users (user_id, full_name, email, password, program_id, is_active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [userId, teacher.fullName, teacher.email, passwordHash, programId],
        );
        await client.query(
          'INSERT INTO public.user_roles (user_id, role_id) VALUES ($1, $2)',
          [userId, role.rows[0].role_id],
        );
        created += 1;
      }
      return { created, updated, total: teachers.length };
    });
    return res.status(200).json(imported);
  } catch (err) {
    return sendError(res, err, 'Import admin teachers error:', 'No fue posible importar los docentes.');
  }
};

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
