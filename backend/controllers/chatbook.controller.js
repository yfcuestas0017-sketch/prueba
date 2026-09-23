import pool from '../config/db.js';
import { enteroSeguro } from '../utils/sqlLiteral.js';
import { actorId } from '../middlewares/auth.middleware.js';
import { isDegreeOptionQuery, handleDegreeOptionsChatbook } from '../services/chatbook_degree_options.js';
import {
  classifyChatbookQuery,
  handleSecurityResponse,
  handleRegulationChatbookQuery,
  handleMixedChatbookQuery,
} from '../chatbook/chatbook_orchestrator.js';
import { handleStudentIntents } from '../chatbook/intents/student.js';
import { handleTeacherIntents } from '../chatbook/intents/teacher.js';
import { handleAdminIntents } from '../chatbook/intents/admin.js';
import {
  detectOtherProgramQuery,
  findTeacherInChatbook,
  formatChatbookProject,
  formatProjectMessage,
  formatTeacherDetailMessage,
  getTeacherFullProfile,
  normalizeChatbookRole,
  normalizeChatbookText,
} from '../chatbook/chatbook_helpers.js';


export const queryChatbook = async (req, res) => {
  const { message } = req.body || {};
  // El Chatbook responde con datos distintos según quién pregunte, así que la
  // identidad sale del token: antes venía en el cuerpo del mensaje y se podía
  // escribir la de cualquier otra persona para ver su información.
  const userId = actorId(req);
  if (!userId || !String(message || '').trim()) {
    return res.status(400).json({ error: 'Escribe una pregunta para continuar.' });
  }

  try {
    const accessRes = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.program_id, pr.name AS program_name, COALESCE(r.name, 'usuario') AS role_name
       FROM public.users u
       LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN public.roles r ON r.role_id = ur.role_id
       LEFT JOIN public.programs pr ON pr.program_id = u.program_id
       WHERE u.user_id::text = $1
       LIMIT 1`,
      [String(userId)]
    );
    if (accessRes.rows.length === 0) {
      return res.status(403).json({ error: 'No tienes permisos para consultar esta información.' });
    }

    const currentUser = accessRes.rows[0];
    const role = normalizeChatbookRole(currentUser.role_name);
    const isStudent = role === 'estudiante';
    const isTeacher = role === 'docente';
    const isAdmin = role === 'admin';
    const programId = currentUser.program_id;
    const programName = currentUser.program_name || 'Universidad CESMAG';

    const norm = normalizeChatbookText(message);
    const rawText = String(message || '');
    const projectCode = rawText.match(/\b[A-Z]{1,8}-\d+\b/i)?.[0] || '';

    const [allProgramsRes, allLinesRes, allSublinesRes] = await Promise.all([
      pool.query('SELECT program_id, name FROM public.programs'),
      pool.query('SELECT research_line_id, name, program_id FROM public.research_lines'),
      pool.query('SELECT research_subline_id, name, research_line_id FROM public.research_sublines'),
    ]);
    const allPrograms = allProgramsRes.rows;
    const allLines = allLinesRes.rows;
    const allSublines = allSublinesRes.rows;

    const crossProgramAttempt = detectOtherProgramQuery(norm, programId, allPrograms, allLines, allSublines);
    if (crossProgramAttempt) {
      return res.json({
        message: 'La información solicitada pertenece a otro programa académico y no está disponible para su perfil.',
        projects: [],
        stats: [],
      });
    }

    // El identificador de programa se valida como entero antes de incrustarlo:
    // es un valor que sale de la base de datos, pero este es el patrón que se
    // copia y acaba reutilizándose con entradas que no son de fiar (§6.5).
    const programIdSeguro = enteroSeguro(programId);
    const programProjectScope = programIdSeguro
      ? `AND (EXISTS (SELECT 1 FROM public.user_projects up_pr JOIN public.users u_pr ON u_pr.user_id = up_pr.user_id WHERE up_pr.project_id = p.project_id AND u_pr.program_id = ${programIdSeguro} AND (up_pr.project_role = 'autor' OR up_pr.project_role = 'coautor' OR up_pr.project_role IS NULL)))`
      : '';

    const queryCategory = classifyChatbookQuery(norm, rawText);

    if (queryCategory === 'SECURITY') {
      return res.json(handleSecurityResponse());
    }

    if (queryCategory === 'BOTH') {
      const mixedResult = await handleMixedChatbookQuery({
        pool,
        norm,
        rawText,
        currentUser,
        programId,
        programName,
        isStudent,
      });
      return res.json(mixedResult);
    }

    if (queryCategory === 'REGULATION') {
      const regResult = await handleRegulationChatbookQuery({ norm, rawText });
      return res.json(regResult);
    }

    if (projectCode) {
      const codeRes = await pool.query(`
        SELECT p.project_id, p.title, p.code, p.created_at, p.finished_at,
               s.name AS status_name, m.name AS modality_name,
               rl.name AS line_name, rsl.name AS subline_name,
               COALESCE((SELECT json_agg(json_build_object('name', u.full_name, 'email', u.email, 'program', pr.name, 'role', COALESCE(up.project_role, 'autor')) ORDER BY u.full_name)
                         FROM public.user_projects up JOIN public.users u ON u.user_id = up.user_id
                         LEFT JOIN public.programs pr ON pr.program_id = u.program_id
                         WHERE up.project_id = p.project_id), '[]'::json) AS participants
        FROM public.projects p
        LEFT JOIN public.statuses s ON s.status_id = p.status_id
        LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
        LEFT JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
        LEFT JOIN public.research_sublines rsl ON rsl.research_subline_id = p.research_subline_id
        WHERE p.code ILIKE $1 ${programProjectScope}
        LIMIT 1
      `, [projectCode]);

      if (codeRes.rows.length > 0) {
        const formatted = formatChatbookProject(codeRes.rows[0], isStudent);
        return res.json({
          message: formatProjectMessage(formatted, role),
          projects: [formatted],
          projectDetail: formatted,
          context: formatted,
        });
      }

      const anyCodeRes = await pool.query(`
        SELECT p.project_id FROM public.projects p WHERE p.code ILIKE $1 LIMIT 1
      `, [projectCode]);
      if (anyCodeRes.rows.length > 0) {
        return res.json({
          message: 'La información solicitada pertenece a otro programa académico y no está disponible para su perfil.',
          projects: [],
          stats: [],
        });
      }
    }

    const matchedTeacher = (!isStudent || /quien es|profesor|docente|asesor/.test(norm)) 
      ? await findTeacherInChatbook(message, programId) 
      : null;

    if (!matchedTeacher && (!isStudent || /quien es|profesor|docente|asesor/.test(norm))) {
      const otherTeacher = await findTeacherInChatbook(message, null);
      if (otherTeacher) {
        return res.json({
          message: 'La información solicitada pertenece a otro programa académico y no está disponible para su perfil.',
          projects: [],
          stats: [],
        });
      }
    }
    if (matchedTeacher && !/que docentes estan|que docentes son|que docentes existen|que docentes hay|que docentes tienen|docentes pertenecen a|lineas de investigacion|que lineas|que sublineas|proyectos estan proximos|comenzaron recientemente|terminan este mes|fechas de los proyectos|muestrame todos|todos los proyectos|por fecha de finalizacion|cuantos proyectos|proyectos por estado|proyectos por modalidad|proyectos estan en ejecucion|proyectos estan terminados|proyectos estan pendientes|proyectos estan disponibles|proyectos por linea|proyectos tiene cada linea|proyectos asociados a cada linea|proyectos tienen asignado/.test(norm)) {
      if (isStudent) {
        return res.json({ message: 'Las consultas sobre docentes no están disponibles para el perfil de estudiante.', projects: [], stats: [] });
      }

      const profile = await getTeacherFullProfile(matchedTeacher.user_id, programId);
      if (profile) {
        const asksOnlyLine = /linea de investigacion|lineas de investigacion|a que linea|cual es su linea|cual es la linea/.test(norm) && !/proyectos|trabajos|cuantos/.test(norm);
        const asksCountsOnly = /cuantos trabajos|cuantos proyectos|cantidad de trabajos|cantidad de proyectos|total de proyectos|total de trabajos/.test(norm);
        const asksAsesorCount = asksCountsOnly && /asesor/.test(norm);
        const asksJuradoCount = asksCountsOnly && /jurado/.test(norm);
        const asksAsesorProjects = /en que proyectos es asesor|proyectos como asesor|trabajos como asesor/.test(norm);
        const asksJuradoProjects = /en que proyectos es jurado|proyectos como jurado|trabajos como jurado/.test(norm);

        if (asksOnlyLine) {
          const lineStr = profile.lines.length > 0 ? profile.lines.join(', ') : 'Sin línea registrada actualmente';
          const sublineStr = profile.sublines.length > 0 ? profile.sublines.join(', ') : 'Sin sublínea registrada';
          const resp = [
            'LÍNEA DE INVESTIGACIÓN DEL DOCENTE',
            '',
            `Docente: ${profile.teacher.full_name}`,
            `Línea de investigación: ${lineStr}`,
            `Sublínea: ${sublineStr}`,
            '',
            `Participación: ${profile.totalProjects} proyecto(s) (${profile.asesorProjects.length} como asesor, ${profile.juradoProjects.length} como jurado).`,
          ].join('\n');
          return res.json({ message: resp, projects: profile.projects, teacher: profile });
        }

        if (asksAsesorCount) {
          const resp = [
            'PARTICIPACIÓN COMO ASESOR',
            '',
            `Docente: ${profile.teacher.full_name}`,
            `Cantidad de proyectos como asesor: ${profile.asesorProjects.length}`,
            ...(profile.asesorProjects.length > 0 ? [
              '',
              'Proyectos:',
              ...profile.asesorProjects.map((p) => `- ${p.code || 'Sin código'} — ${p.title}`),
            ] : []),
          ].join('\n');
          return res.json({ message: resp, projects: profile.asesorProjects, teacher: profile });
        }

        if (asksJuradoCount) {
          const resp = [
            'PARTICIPACIÓN COMO JURADO',
            '',
            `Docente: ${profile.teacher.full_name}`,
            `Cantidad de proyectos como jurado: ${profile.juradoProjects.length}`,
            ...(profile.juradoProjects.length > 0 ? [
              '',
              'Proyectos:',
              ...profile.juradoProjects.map((p) => `- ${p.code || 'Sin código'} — ${p.title}`),
            ] : []),
          ].join('\n');
          return res.json({ message: resp, projects: profile.juradoProjects, teacher: profile });
        }

        if (asksCountsOnly) {
          const resp = [
            'TOTAL DE PROYECTOS DEL DOCENTE',
            '',
            `Docente: ${profile.teacher.full_name}`,
            `Total de proyectos registrados: ${profile.totalProjects}`,
            `- Como asesor: ${profile.asesorProjects.length}`,
            `- Como jurado: ${profile.juradoProjects.length}`,
            ...Object.entries(profile.otherRolesMap).map(([r, l]) => `- Como ${r}: ${l.length}`),
          ].join('\n');
          return res.json({ message: resp, projects: profile.projects, teacher: profile });
        }

        if (asksAsesorProjects) {
          const resp = [
            `PROYECTOS COMO ASESOR — ${profile.teacher.full_name}`,
            '',
            `Total como asesor: ${profile.asesorProjects.length}`,
            ...(profile.asesorProjects.length > 0 ? [
              '',
              ...profile.asesorProjects.map((p) => `- ${p.code || 'Sin código'} — ${p.title} (${p.line || 'Sin línea'})`),
            ] : ['No registra proyectos como asesor.']),
          ].join('\n');
          return res.json({ message: resp, projects: profile.asesorProjects, teacher: profile });
        }

        if (asksJuradoProjects) {
          const resp = [
            `PROYECTOS COMO JURADO — ${profile.teacher.full_name}`,
            '',
            `Total como jurado: ${profile.juradoProjects.length}`,
            ...(profile.juradoProjects.length > 0 ? [
              '',
              ...profile.juradoProjects.map((p) => `- ${p.code || 'Sin código'} — ${p.title} (${p.line || 'Sin línea'})`),
            ] : ['No registra proyectos como jurado.']),
          ].join('\n');
          return res.json({ message: resp, projects: profile.juradoProjects, teacher: profile });
        }

        return res.json({
          message: formatTeacherDetailMessage(profile),
          projects: profile.projects,
          teacher: profile,
          context: null,
        });
      }
    }

    if (isDegreeOptionQuery(norm)) {
      const degreeResult = await handleDegreeOptionsChatbook({
        pool,
        norm,
        rawText,
        currentUser,
        programId,
        programName,
        programProjectScope,
        isStudent,
      });
      return res.json(degreeResult);
    }

    const ctx = { pool, currentUser, norm, programId, programName, programProjectScope };

    if (isStudent) {
      const respuesta = await handleStudentIntents(ctx);
      if (respuesta) return res.json(respuesta);
    }

    if (isTeacher) {
      const respuesta = await handleTeacherIntents(ctx);
      if (respuesta) return res.json(respuesta);
    }

    if (isAdmin) {
      const respuesta = await handleAdminIntents(ctx);
      if (respuesta) return res.json(respuesta);
    }

    const values = [];
    const filters = [];

    const cleanSearch = rawText
      .replace(/\b(busca|buscar|muéstrame|muestrame|quiero|información|informacion|proyectos|proyecto|disponibles|disponible|de|sobre|en|la|el|los|las|qué|que|cuál|cual|hay|existen|mis|mi|similares|relacionados|con)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanSearch.length >= 2) {
      values.push(`%${cleanSearch}%`);
      filters.push(`(p.title ILIKE $${values.length} OR p.code ILIKE $${values.length} OR rl.name ILIKE $${values.length} OR rsl.name ILIKE $${values.length} OR m.name ILIKE $${values.length} OR s.name ILIKE $${values.length})`);
    }

    const fallbackRes = await pool.query(`
      SELECT p.project_id, p.title, p.code, p.created_at, p.finished_at,
             s.name AS status_name, m.name AS modality_name,
             rl.name AS line_name, rsl.name AS subline_name,
             COALESCE((SELECT json_agg(json_build_object('name', u.full_name, 'email', u.email, 'program', pr.name, 'role', COALESCE(up.project_role, 'autor')) ORDER BY u.full_name)
                       FROM public.user_projects up JOIN public.users u ON u.user_id = up.user_id
                       LEFT JOIN public.programs pr ON pr.program_id = u.program_id
                       WHERE up.project_id = p.project_id), '[]'::json) AS participants
      FROM public.projects p
      LEFT JOIN public.statuses s ON s.status_id = p.status_id
      LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
      LEFT JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
      LEFT JOIN public.research_sublines rsl ON rsl.research_subline_id = p.research_subline_id
      WHERE 1=1 ${programProjectScope} ${filters.length ? `AND ${filters.join(' AND ')}` : ''}
      ORDER BY p.created_at DESC LIMIT 20
    `, values);

    const projects = fallbackRes.rows.map(row => formatChatbookProject(row, isStudent));

    if (projects.length === 0 && filters.length > 0) {
      const anyProgramCheck = await pool.query(`
        SELECT p.project_id
        FROM public.projects p
        LEFT JOIN public.statuses s ON s.status_id = p.status_id
        LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
        LEFT JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
        LEFT JOIN public.research_sublines rsl ON rsl.research_subline_id = p.research_subline_id
        WHERE ${filters.join(' AND ')}
        LIMIT 1
      `, values);

      if (anyProgramCheck.rows.length > 0) {
        return res.json({
          message: 'La información solicitada pertenece a otro programa académico y no está disponible para su perfil.',
          projects: [],
          stats: [],
        });
      }
    }

    return res.json({
      message: projects.length > 0
        ? `Encontré ${projects.length} proyecto(s) relacionados con tu consulta en ${programName}:`
        : `No encontré proyectos que coincidan con tu búsqueda en ${programName}.`,
      projects,
      context: projects.length === 1 ? projects[0] : null,
    });
  } catch (err) {
    console.error('Chatbook query error:', err);
    return res.status(500).json({ error: 'No puedo consultar la información en este momento. Intenta nuevamente más tarde.' });
  }
};
