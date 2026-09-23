/**
 * HELPERS DEL CHATBOOK
 * UNIVERSIDAD CESMAG
 *
 * Normalización de texto, formato de fechas y duraciones, y consultas de
 * docentes. Estaban al principio de `chatbook.controller.js`, delante de una
 * función de 1.272 líneas; se separaron para que los manejadores de cada rol
 * puedan usarlos sin arrastrar el controlador entero.
 */

import pool from '../config/db.js';

export const CHATBOOK_NOT_FOUND = 'No encuentro esta información registrada actualmente en el sistema.';
export const CHATBOOK_STOP_WORDS = new Set([
  'docente', 'docentes', 'profesor', 'profesores', 'profesora', 'profesoras',
  'asesor', 'asesores', 'asesora', 'jurado', 'jurados', 'evaluador', 'evaluadores',
  'sistema', 'investigacion', 'investigación', 'linea', 'línea', 'sublinea', 'sublínea',
  'proyectos', 'proyecto', 'trabajos', 'trabajo', 'nuevo', 'nueva', 'usuario', 'usuarios',
  'cuenta', 'para', 'como', 'sobre', 'tiene', 'estan', 'están', 'cuantos', 'cuántos',
  'cuales', 'cuáles', 'quien', 'quién', 'quienes', 'quiénes', 'informacion', 'información',
  'que', 'qué', 'cual', 'cuál', 'los', 'las', 'del', 'con', 'por', 'son', 'mis', 'sus',
  'este', 'esta', 'estos', 'estas', 'mío', 'mía', 'míos', 'mías', 'todos', 'todas',
  'existen', 'hay', 'cada', 'uno', 'una'
]);

export function normalizeChatbookText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function normalizeChatbookRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('docent') || normalized.includes('asesor') || normalized.includes('profesor')) return 'docente';
  if (normalized.includes('estudiant')) return 'estudiante';
  return 'estudiante';
}

export function detectOtherProgramQuery(normMessage, userProgramId, allPrograms, allLines = [], allSublines = []) {
  if (!userProgramId || !allPrograms || allPrograms.length <= 1) return null;
  const currentProg = allPrograms.find(p => p.program_id === userProgramId);
  const currentProgNorm = currentProg ? normalizeChatbookText(currentProg.name) : '';

  for (const prog of allPrograms) {
    if (prog.program_id === userProgramId) continue;
    const progNorm = normalizeChatbookText(prog.name);

    if (progNorm.length >= 4 && normMessage.includes(progNorm)) {
      return prog;
    }

    const words = progNorm.split(/\s+/).filter(w => w.length >= 4 && !['para', 'sobre', 'ciencias', 'facultad', 'de', 'del', 'la', 'el', 'los', 'las', 'educacion'].includes(w));
    for (const word of words) {
      if (currentProgNorm.includes(word)) continue;
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(normMessage)) {
        return prog;
      }
    }
  }

  const otherLines = allLines.filter(l => l.program_id && l.program_id !== userProgramId);
  for (const line of otherLines) {
    const lineNorm = normalizeChatbookText(line.name);
    const lineWords = lineNorm.split(/\s+/).filter(w => w.length >= 4 && !['investigacion', 'sistemas', 'estudio', 'procesos', 'linea', 'sublinea', 'para', 'sobre', 'ciencias', 'facultad', 'de', 'del', 'la', 'el', 'los', 'las'].includes(w));
    if (lineNorm.length >= 8 && normMessage.includes(lineNorm)) {
      return allPrograms.find(p => p.program_id === line.program_id) || { name: 'otro programa' };
    }
    if (lineWords.length >= 2) {
      const matchCount = lineWords.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(normMessage)).length;
      if (matchCount >= 2) {
        return allPrograms.find(p => p.program_id === line.program_id) || { name: 'otro programa' };
      }
    }
  }

  const otherSublines = allSublines.filter(sl => {
    const parentLine = allLines.find(l => l.research_line_id === sl.research_line_id);
    return parentLine && parentLine.program_id && parentLine.program_id !== userProgramId;
  });
  for (const sl of otherSublines) {
    const slNorm = normalizeChatbookText(sl.name);
    if (slNorm.length >= 6 && normMessage.includes(slNorm)) {
      const parentLine = allLines.find(l => l.research_line_id === sl.research_line_id);
      return allPrograms.find(p => p.program_id === parentLine.program_id) || { name: 'otro programa' };
    }
  }

  return null;
}

export function formatDateCO(d) {
  if (!d) return 'Sin fecha registrada';
  try {
    return new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(d);
  }
}

export function getRemainingTime(targetDate) {
  if (!targetDate) return 'Sin fecha límite definida';
  const now = new Date();
  const target = new Date(targetDate);
  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Finalizó hace ${Math.abs(diffDays)} días (${formatDateCO(targetDate)})`;
  if (diffDays === 0) return `Termina hoy (${formatDateCO(targetDate)})`;
  if (diffDays <= 30) return `Faltan ${diffDays} días (${formatDateCO(targetDate)})`;
  const diffMonths = Math.floor(diffDays / 30);
  const remDays = diffDays % 30;
  return `Faltan aproximadamente ${diffMonths} mes(es)${remDays > 0 ? ` y ${remDays} días` : ''} (${formatDateCO(targetDate)})`;
}

export function getDuration(startDate, endDate) {
  if (!startDate || !endDate) return 'Duración estimada estándar de 2 semestres académicos (1 año)';
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const months = Math.round(diffDays / 30);
  return `${months} meses (${diffDays} días calendario)`;
}

export function getStatusMeaning(statusName) {
  const norm = normalizeChatbookText(statusName);
  if (norm.includes('propuest') || norm.includes('radicad')) {
    return 'Propuesta / Radicado: El anteproyecto está formulado y radicado para revisión académica y aprobación del comité.';
  }
  if (norm.includes('curso') || norm.includes('ejecucion') || norm.includes('aprobado')) {
    return 'En curso / En ejecución: El proyecto de grado fue aprobado formalmente y se encuentra en desarrollo activo bajo la dirección de tu asesor.';
  }
  if (norm.includes('finalizad') || norm.includes('terminad') || norm.includes('sustentad')) {
    return 'Finalizado: El trabajo de grado culminó satisfactoriamente su proceso de desarrollo, evaluación y sustentación.';
  }
  if (norm.includes('suspendid') || norm.includes('pausad')) {
    return 'Suspendido: El proyecto cuenta con una pausa justificada o prórroga en trámite.';
  }
  if (norm.includes('rechazad') || norm.includes('no aprobad')) {
    return 'Rechazado: El proyecto no fue aprobado y requiere ajustes sustanciales o nueva formulación.';
  }
  if (norm.includes('disponib') || norm.includes('banco')) {
    return 'Disponible: El proyecto está publicado en el Banco de Proyectos esperando ser seleccionado.';
  }
  return `Estado: ${statusName}. El proyecto se encuentra registrado activamente en el sistema.`;
}

export function formatChatbookProject(row, isStudent = false) {
  const participants = row.participants || [];
  return {
    id: row.project_id,
    title: row.title,
    code: row.code,
    createdAt: isStudent ? null : row.created_at,
    finishedAt: isStudent ? null : row.finished_at,
    line: row.line_name,
    subline: row.subline_name,
    modality: row.modality_name,
    status: isStudent ? null : row.status_name,
    authors: participants.filter((person) => ['autor', 'coautor'].includes(String(person.role).toLowerCase())),
    teachers: isStudent ? [] : participants.filter((person) => ['asesor', 'jurado', 'docente'].includes(String(person.role).toLowerCase())),
    participants,
  };
}

export function formatProjectMessage(project, role = 'usuario') {
  const isStudent = role === 'estudiante';
  const peopleInfo = (people) => people.length
    ? people.map((person) => [person.name, person.email, person.program].filter(Boolean).join(' · ') + (person.role ? ` (${person.role})` : '')).join(', ')
    : CHATBOOK_NOT_FOUND;

  const lines = [
    'INFORMACIÓN DEL PROYECTO',
    `Nombre: ${project.title || CHATBOOK_NOT_FOUND}`,
    `Código: ${project.code || CHATBOOK_NOT_FOUND}`,
  ];

  if (!isStudent) {
    lines.push(`Estado: ${project.status || CHATBOOK_NOT_FOUND}`);
    lines.push(`Fecha de inicio: ${project.createdAt ? new Date(project.createdAt).toLocaleDateString('es-CO') : CHATBOOK_NOT_FOUND}`);
    lines.push(`Fecha de finalización: ${project.finishedAt ? new Date(project.finishedAt).toLocaleDateString('es-CO') : CHATBOOK_NOT_FOUND}`);
  }

  lines.push(`Línea de investigación: ${project.line || CHATBOOK_NOT_FOUND}`);
  lines.push(`Sublínea de investigación: ${project.subline || CHATBOOK_NOT_FOUND}`);
  lines.push(`Modalidad: ${project.modality || CHATBOOK_NOT_FOUND}`);
  lines.push(`Autores: ${peopleInfo(project.authors || [])}`);

  if (!isStudent) {
    lines.push(`Docentes asociados: ${peopleInfo(project.teachers || [])}`);
  }

  return lines.join('\n');
}

export async function findTeacherInChatbook(message, programId = null) {
  const normMessage = normalizeChatbookText(message);

  let querySql = `
    SELECT u.user_id, u.full_name, u.email, pr.name AS program_name, u.program_id
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.user_id
    JOIN public.roles r ON r.role_id = ur.role_id
    LEFT JOIN public.programs pr ON pr.program_id = u.program_id
    WHERE (LOWER(r.name) LIKE '%docent%' OR LOWER(r.name) LIKE '%profesor%')
  `;
  const params = [];
  if (programId) {
    params.push(programId);
    querySql += ` AND (u.program_id = $1 OR EXISTS (SELECT 1 FROM public.user_projects up_t JOIN public.projects p_t ON p_t.project_id = up_t.project_id JOIN public.user_projects up_a ON up_a.project_id = p_t.project_id JOIN public.users u_a ON u_a.user_id = up_a.user_id WHERE up_t.user_id = u.user_id AND u_a.program_id = $1 AND (up_a.project_role = 'autor' OR up_a.project_role = 'coautor' OR up_a.project_role IS NULL)))`;
  }
  querySql += ` ORDER BY LENGTH(u.full_name) DESC`;

  const teachersRes = await pool.query(querySql, params);

  const matched = [];
  for (const t of teachersRes.rows) {
    const normFullName = normalizeChatbookText(t.full_name);
    const normEmail = normalizeChatbookText(t.email);
    const emailUser = normEmail.split('@')[0];

    if (normFullName.length >= 3) {
      const fullNameEscaped = normFullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${fullNameEscaped}\\b`).test(normMessage)) {
        matched.push({ teacher: t, score: 1000 + normFullName.length });
        continue;
      }
    }

    if (emailUser.length >= 3 && !CHATBOOK_STOP_WORDS.has(emailUser)) {
      const emailEscaped = emailUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${emailEscaped}\\b`).test(normMessage)) {
        matched.push({ teacher: t, score: 500 + emailUser.length });
        continue;
      }
    }

    const nameParts = normFullName.split(/\s+/).filter((p) => p.length >= 3 && !CHATBOOK_STOP_WORDS.has(p));
    if (nameParts.length > 0) {
      let matchedParts = 0;
      let matchedChars = 0;
      for (const part of nameParts) {
        const regex = new RegExp(`\\b${part}\\b`, 'i');
        if (regex.test(normMessage)) {
          matchedParts++;
          matchedChars += part.length;
        }
      }
      if (matchedParts > 0) {
        matched.push({ teacher: t, score: (matchedParts * 100) + matchedChars });
      }
    }
  }

  matched.sort((a, b) => b.score - a.score);
  return matched.length > 0 ? matched[0].teacher : null;
}

export async function getTeacherFullProfile(teacherId, programId = null) {
  const teacherRes = await pool.query(
    `SELECT u.user_id, u.full_name, u.email, pr.name AS program_name, u.program_id
     FROM public.users u
     LEFT JOIN public.programs pr ON pr.program_id = u.program_id
     WHERE u.user_id = $1`,
    [teacherId]
  );
  if (teacherRes.rows.length === 0) return null;
  const teacher = teacherRes.rows[0];

  let projectsSql = `
    SELECT 
       p.project_id,
       p.code,
       p.title,
       s.name AS status_name,
       rl.name AS line_name,
       rsl.name AS subline_name,
       COALESCE(up.project_role, 'asesor') AS project_role,
       p.created_at,
       p.finished_at
     FROM public.user_projects up
     JOIN public.projects p ON p.project_id = up.project_id
     LEFT JOIN public.statuses s ON s.status_id = p.status_id
     LEFT JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
     LEFT JOIN public.research_sublines rsl ON rsl.research_subline_id = p.research_subline_id
     WHERE up.user_id = $1
  `;
  const params = [teacherId];
  if (programId) {
    params.push(programId);
    projectsSql += ` AND (EXISTS (SELECT 1 FROM public.user_projects up_pr JOIN public.users u_pr ON u_pr.user_id = up_pr.user_id WHERE up_pr.project_id = p.project_id AND u_pr.program_id = $2 AND (up_pr.project_role = 'autor' OR up_pr.project_role = 'coautor' OR up_pr.project_role IS NULL)))`;
  }
  projectsSql += ` ORDER BY p.code`;

  const projectsRes = await pool.query(projectsSql, params);

  const projects = projectsRes.rows.map((row) => ({
    id: row.project_id,
    title: row.title,
    code: row.code,
    line: row.line_name,
    subline: row.subline_name,
    status: row.status_name,
    project_role: row.project_role,
    authors: [],
    teachers: [{ name: teacher.full_name, email: teacher.email }],
  }));

  const lines = [...new Set(projectsRes.rows.map((p) => p.line_name).filter(Boolean))];
  const sublines = [...new Set(projectsRes.rows.map((p) => p.subline_name).filter(Boolean))];

  const asesorProjects = projects.filter((p) => String(p.project_role).toLowerCase().includes('asesor'));
  const juradoProjects = projects.filter((p) => String(p.project_role).toLowerCase().includes('jurado'));
  const otherProjects = projects.filter((p) =>
    !String(p.project_role).toLowerCase().includes('asesor') &&
    !String(p.project_role).toLowerCase().includes('jurado')
  );

  const otherRolesMap = {};
  otherProjects.forEach((p) => {
    const roleKey = p.project_role || 'otro';
    if (!otherRolesMap[roleKey]) otherRolesMap[roleKey] = [];
    otherRolesMap[roleKey].push(p);
  });

  return {
    teacher,
    projects,
    lines,
    sublines,
    totalProjects: projects.length,
    asesorProjects,
    juradoProjects,
    otherRolesMap,
  };
}

export async function getAllTeachersWithStats(programId = null) {
  let teachersSql = `
    SELECT u.user_id, u.full_name, u.email, pr.name AS program_name
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.user_id
    JOIN public.roles r ON r.role_id = ur.role_id
    LEFT JOIN public.programs pr ON pr.program_id = u.program_id
    WHERE (LOWER(r.name) LIKE '%docent%' OR LOWER(r.name) LIKE '%profesor%')
  `;
  const params = [];
  if (programId) {
    params.push(programId);
    teachersSql += ` AND (u.program_id = $1 OR EXISTS (SELECT 1 FROM public.user_projects up_t JOIN public.projects p_t ON p_t.project_id = up_t.project_id JOIN public.user_projects up_a ON up_a.project_id = p_t.project_id JOIN public.users u_a ON u_a.user_id = up_a.user_id WHERE up_t.user_id = u.user_id AND u_a.program_id = $1 AND (up_a.project_role = 'autor' OR up_a.project_role = 'coautor' OR up_a.project_role IS NULL)))`;
  }
  teachersSql += ` ORDER BY u.full_name`;

  const teachersRes = await pool.query(teachersSql, params);

  const teacherList = [];
  for (const t of teachersRes.rows) {
    const profile = await getTeacherFullProfile(t.user_id, programId);
    if (profile) {
      teacherList.push(profile);
    }
  }
  return teacherList;
}

export function formatTeacherDetailMessage(profile) {
  const { teacher, lines, sublines, totalProjects, asesorProjects, juradoProjects, otherRolesMap } = profile;

  const linesText = lines.length > 0 ? lines.join(', ') : 'Sin línea registrada actualmente';
  const sublinesText = sublines.length > 0 ? sublines.join(', ') : 'Sin sublínea registrada';

  const output = [
    'INFORMACIÓN DEL DOCENTE',
    '',
    `Nombre: ${teacher.full_name || CHATBOOK_NOT_FOUND}`,
    `Línea de investigación: ${linesText}`,
    `Sublínea: ${sublinesText}`,
    '',
    'Participación en proyectos:',
    `- Total de proyectos: ${totalProjects}`,
    `- Como asesor: ${asesorProjects.length}`,
    `- Como jurado: ${juradoProjects.length}`,
  ];

  for (const [roleName, pList] of Object.entries(otherRolesMap)) {
    output.push(`- Como ${roleName}: ${pList.length}`);
  }

  if (asesorProjects.length > 0) {
    output.push('');
    output.push('Proyectos como asesor:');
    asesorProjects.forEach((p) => {
      output.push(`- ${p.code || 'Sin código'} — ${p.title || 'Sin título'}`);
    });
  }

  if (juradoProjects.length > 0) {
    output.push('');
    output.push('Proyectos como jurado:');
    juradoProjects.forEach((p) => {
      output.push(`- ${p.code || 'Sin código'} — ${p.title || 'Sin título'}`);
    });
  }

  for (const [roleName, pList] of Object.entries(otherRolesMap)) {
    output.push('');
    output.push(`Proyectos como ${roleName}:`);
    pList.forEach((p) => {
      output.push(`- ${p.code || 'Sin código'} — ${p.title || 'Sin título'}`);
    });
  }

  return output.join('\n');
}
