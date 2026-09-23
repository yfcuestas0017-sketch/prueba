/**
 * INTENCIONES DEL CHATBOOK — PERFIL ESTUDIANTE
 * UNIVERSIDAD CESMAG
 *
 * Cada rama reconoce una pregunta y devuelve la respuesta ya formada. Devolver
 * `null` significa "ninguna rama reconoció la pregunta": el controlador cae
 * entonces a la búsqueda general, igual que antes hacía el bloque `if` del que
 * salió este archivo.
 *
 * El orden de las ramas es significativo y se conserva tal cual: una pregunta
 * puede encajar en más de una y gana la primera.
 */

import { formatChatbookProject, formatDateCO, getDuration, getRemainingTime, getStatusMeaning, normalizeChatbookText } from '../chatbook_helpers.js';
import { enteroSeguro } from '../../utils/sqlLiteral.js';

export async function handleStudentIntents(ctx) {
  const { pool, currentUser, norm, programId, programName, programProjectScope } = ctx;

      if (/\b(fecha|fechas|inicia|duracion|dura|tiempo restante|cronograma|finalizacion|docente|docentes|profesor|profesores|asesor|asesores|jurado|jurados)\b/.test(norm) || /\btermina\b/.test(norm)) {
        return ({
          message: 'Las consultas sobre fechas y docentes no están disponibles para el perfil de estudiante.',
          projects: [],
          stats: [],
        });
      }

      const myProjectsRes = await pool.query(`
        SELECT p.project_id, p.code, p.title, p.created_at, p.finished_at,
               s.name as status_name, m.name as modality_name,
               rl.name as line_name, rsl.name as subline_name,
               up.project_role,
               COALESCE((SELECT json_agg(json_build_object('name', u2.full_name, 'email', u2.email, 'role', up2.project_role))
                         FROM public.user_projects up2 JOIN public.users u2 ON u2.user_id = up2.user_id
                         WHERE up2.project_id = p.project_id), '[]'::json) as participants
        FROM public.user_projects up
        JOIN public.projects p ON p.project_id = up.project_id
        LEFT JOIN public.statuses s ON s.status_id = p.status_id
        LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
        LEFT JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
        LEFT JOIN public.research_sublines rsl ON rsl.research_subline_id = p.research_subline_id
        WHERE up.user_id = $1
        ORDER BY p.created_at DESC
      `, [currentUser.user_id]);
      const myProjects = myProjectsRes.rows.map(row => formatChatbookProject(row, true));

      if (/cuando inicia mi proyecto|fecha de inicio de mi proyecto/.test(norm)) {
        if (myProjects.length === 0) return ({ message: 'No tienes proyectos registrados actualmente en el sistema.', projects: [] });
        const lines = ['FECHA DE INICIO DE TUS PROYECTOS:', ''];
        myProjects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Fecha de inicio: ${formatDateCO(p.createdAt)}`);
        });
        return ({ message: lines.join('\n'), projects: myProjects });
      }

      if (/cuando termina mi proyecto|fecha de finalizacion de mi proyecto|fecha de terminacion/.test(norm)) {
        if (myProjects.length === 0) return ({ message: 'No tienes proyectos registrados actualmente en el sistema.', projects: [] });
        const lines = ['FECHA DE FINALIZACIÓN DE TUS PROYECTOS:', ''];
        myProjects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Fecha de finalización: ${formatDateCO(p.finishedAt)}`);
          lines.push(`  Tiempo restante: ${getRemainingTime(p.finishedAt)}`);
        });
        return ({ message: lines.join('\n'), projects: myProjects });
      }

      if (/cuanto tiempo dura mi proyecto|duracion de mi proyecto/.test(norm)) {
        if (myProjects.length === 0) return ({ message: 'No tienes proyectos registrados actualmente.', projects: [] });
        const lines = ['DURACIÓN DE TUS PROYECTOS DE GRADO:', ''];
        myProjects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Duración estimada/registrada: ${getDuration(p.createdAt, p.finishedAt)}`);
        });
        return ({ message: lines.join('\n'), projects: myProjects });
      }

      if (/cuanto falta para que termine mi proyecto|tiempo restante/.test(norm)) {
        if (myProjects.length === 0) return ({ message: 'No tienes proyectos registrados actualmente.', projects: [] });
        const lines = ['TIEMPO RESTANTE PARA CULMINAR TUS PROYECTOS:', ''];
        myProjects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Estado actual: ${p.status || 'En desarrollo'}`);
          lines.push(`  Tiempo restante: ${getRemainingTime(p.finishedAt)}`);
        });
        return ({ message: lines.join('\n'), projects: myProjects });
      }

      if (/cuales son las fechas de mis proyectos|fechas de mis proyectos/.test(norm)) {
        if (myProjects.length === 0) return ({ message: 'No tienes proyectos registrados actualmente.', projects: [] });
        const lines = ['CRONOGRAMA Y FECHAS DE TUS PROYECTOS:', ''];
        myProjects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  • Fecha de inicio: ${formatDateCO(p.createdAt)}`);
          lines.push(`  • Fecha de finalización: ${formatDateCO(p.finishedAt)}`);
          lines.push(`  • Estado: ${p.status || 'En curso'}`);
          lines.push('');
        });
        return ({ message: lines.join('\n').trim(), projects: myProjects });
      }

      if (/cual de mis proyectos termina primero|proximo a terminar/.test(norm)) {
        if (myProjects.length === 0) return ({ message: 'No tienes proyectos registrados actualmente.', projects: [] });
        const withDates = myProjects.filter(p => p.finishedAt);
        const sorted = withDates.length > 0
          ? [...withDates].sort((a, b) => new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime())
          : myProjects;
        const first = sorted[0];
        const resp = [
          'PROYECTO MÁS PRÓXIMO A FINALIZAR:',
          '',
          `Proyecto: ${first.code || 'Sin código'} — ${first.title}`,
          `Fecha de finalización: ${formatDateCO(first.finishedAt)}`,
          `Tiempo restante: ${getRemainingTime(first.finishedAt)}`,
          `Estado actual: ${first.status || 'En curso'}`
        ].join('\n');
        return ({ message: resp, projects: [first] });
      }

      if (/que significa el estado de mi proyecto|significado del estado/.test(norm)) {
        if (myProjects.length === 0) return ({ message: 'No tienes proyectos registrados actualmente.', projects: [] });
        const lines = ['SIGNIFICADO DEL ESTADO DE TUS PROYECTOS:', ''];
        myProjects.forEach(p => {
          lines.push(`Proyecto: ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`Estado actual: ${p.status || 'Sin estado'}`);
          lines.push(`Explicación: ${getStatusMeaning(p.status)}`);
          lines.push('');
        });
        return ({ message: lines.join('\n').trim(), projects: myProjects });
      }

      if (/cual es el estado de mi proyecto|cual es el estado de mis proyectos|estado de mi proyecto|estado de mis proyectos/.test(norm)) {
        if (myProjects.length === 0) return ({ message: 'No tienes proyectos asociados a tu cuenta actualmente.', projects: [] });
        const lines = ['ESTADO ACTUAL DE TUS PROYECTOS:', ''];
        myProjects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Estado: ${p.status || 'Sin estado'}`);
        });
        return ({ message: lines.join('\n'), projects: myProjects });
      }

      if (/proyectos mios estan en ejecucion|proyectos en ejecucion|en curso/.test(norm) && /mio|mis|tengo/.test(norm)) {
        const active = myProjects.filter(p => normalizeChatbookText(p.status).includes('curso') || normalizeChatbookText(p.status).includes('ejecucion'));
        if (active.length === 0) return ({ message: 'No tienes proyectos en ejecución actualmente.', projects: [] });
        const lines = [`TIENES ${active.length} PROYECTO(S) EN EJECUCIÓN:`, ''];
        active.forEach(p => lines.push(`- ${p.code || 'Sin código'} — ${p.title} (${p.line || 'Sin línea'})`));
        return ({ message: lines.join('\n'), projects: active });
      }

      if (/tengo algun proyecto terminado|proyecto terminado|proyectos terminados/.test(norm) && /mio|mis|tengo/.test(norm)) {
        const done = myProjects.filter(p => normalizeChatbookText(p.status).includes('finalizad') || normalizeChatbookText(p.status).includes('terminad'));
        if (done.length === 0) return ({ message: 'No tienes proyectos finalizados aún. Tus proyectos continúan en desarrollo.', projects: [] });
        const lines = [`TIENES ${done.length} PROYECTO(S) TERMINADO(S):`, ''];
        done.forEach(p => lines.push(`- ${p.code || 'Sin código'} — ${p.title} (Culminó: ${formatDateCO(p.finishedAt)})`));
        return ({ message: lines.join('\n'), projects: done });
      }

      if (/cuales son mis proyectos|mis proyectos|muestrame mis proyectos/.test(norm)) {
        if (myProjects.length === 0) return ({ message: 'No tienes proyectos asociados actualmente.', projects: [] });
        const lines = [`TIENES ${myProjects.length} PROYECTO(S) REGISTRADO(S):`, ''];
        myProjects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Línea: ${p.line || 'Sin línea'} | Estado: ${p.status || 'En curso'}`);
        });
        return ({ message: lines.join('\n'), projects: myProjects });
      }

      if (/quien es mi docente asesor|quien es mi asesor|que docente esta asociado a mi proyecto|docente asesor/.test(norm)) {
        if (myProjects.length === 0) return ({ message: 'No tienes proyectos registrados actualmente.', projects: [] });
        const lines = ['DOCENTES ASESORES ASOCIADOS A TUS PROYECTOS:', ''];
        myProjects.forEach(p => {
          const advisors = p.teachers.filter(t => t.name);
          lines.push(`Proyecto: ${p.code || 'Sin código'} — ${p.title}`);
          if (advisors.length > 0) {
            lines.push(`Asesor(es): ${advisors.map(a => `${a.name} (${a.email || 'Sin correo'})`).join(', ')}`);
          } else {
            lines.push('Asesor(es): Aún no tiene asesor asignado.');
          }
          lines.push('');
        });
        return ({ message: lines.join('\n').trim(), projects: myProjects });
      }

      if (/docentes pertenecen a mi linea|docentes de mi linea/.test(norm)) {
        const myLines = [...new Set(myProjects.map(p => p.line).filter(Boolean))];
        if (myLines.length === 0) return ({ message: 'No tienes una línea de investigación registrada en tus proyectos para consultar sus docentes.', projects: [] });
        const teachersInLineRes = await pool.query(`
          SELECT DISTINCT u.full_name, u.email, rl.name as line_name
          FROM public.users u
          JOIN public.user_projects up ON up.user_id = u.user_id
          JOIN public.projects p ON p.project_id = up.project_id
          JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
          JOIN public.user_roles ur ON ur.user_id = u.user_id
          JOIN public.roles r ON r.role_id = ur.role_id
          WHERE (LOWER(r.name) LIKE '%docent%')
            AND rl.name = ANY($1)
            ${programProjectScope}
          ORDER BY u.full_name
        `, [myLines]);
        if (teachersInLineRes.rows.length === 0) {
          return ({ message: `No se encontraron docentes registrados en tu línea (${myLines.join(', ')}) para tu programa.`, projects: [] });
        }
        const lines = [`DOCENTES DE TU LÍNEA DE INVESTIGACIÓN (${myLines.join(', ')}):`, ''];
        teachersInLineRes.rows.forEach(t => lines.push(`- ${t.full_name} (${t.email}) — ${t.line_name}`));
        const stats = teachersInLineRes.rows.map(t => ({ label: t.full_name, value: t.line_name, sublabel: t.email }));
        return ({ message: lines.join('\n'), projects: [], stats });
      }

      if (/cual es mi linea de investigacion|cual es mi linea/.test(norm)) {
        const myLines = [...new Set(myProjects.map(p => p.line).filter(Boolean))];
        if (myLines.length === 0) return ({ message: 'No tienes una línea de investigación registrada en tus proyectos actualmente.', projects: [] });
        return ({ message: `Tu línea de investigación registrada en ${programName} es: ${myLines.join(', ')}.`, projects: myProjects });
      }

      if (/cual es la sublinea de mi proyecto|sublinea de mi proyecto/.test(norm)) {
        const mySublines = [...new Set(myProjects.map(p => p.subline).filter(Boolean))];
        if (mySublines.length === 0) return ({ message: 'No tienes una sublínea registrada en tus proyectos actualmente.', projects: [] });
        return ({ message: `La sublínea de tu proyecto es: ${mySublines.join(', ')}.`, projects: myProjects });
      }

      if (/proyectos existen en mi linea|proyectos relacionados con mi linea|busca proyectos relacionados|muestrame proyectos similares|busca proyectos similares/.test(norm)) {
        const myLines = [...new Set(myProjects.map(p => p.line).filter(Boolean))];
        if (myLines.length === 0) return ({ message: 'No tienes una línea de investigación asignada para consultar proyectos similares.', projects: [] });
        const lineProjectsRes = await pool.query(`
          SELECT p.project_id, p.code, p.title, p.created_at, p.finished_at,
                 s.name as status_name, m.name as modality_name,
                 rl.name as line_name, rsl.name as subline_name,
                 COALESCE((SELECT json_agg(json_build_object('name', u2.full_name, 'email', u2.email, 'role', up2.project_role))
                           FROM public.user_projects up2 JOIN public.users u2 ON u2.user_id = up2.user_id
                           WHERE up2.project_id = p.project_id), '[]'::json) as participants
          FROM public.projects p
          JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
          LEFT JOIN public.research_sublines rsl ON rsl.research_subline_id = p.research_subline_id
          LEFT JOIN public.statuses s ON s.status_id = p.status_id
          LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
          WHERE rl.name = ANY($1) ${programProjectScope}
          ORDER BY p.created_at DESC LIMIT 15
        `, [myLines]);
        const projects = lineProjectsRes.rows.map(row => formatChatbookProject(row, true));
        return ({
          message: `Encontré ${projects.length} proyecto(s) en tu línea (${myLines.join(', ')}) en ${programName}:`,
          projects
        });
      }

      if (/que otras lineas existen|lineas existen|lineas de investigacion|busca proyectos sobre/.test(norm)) {
        const linesRes = await pool.query(`
          SELECT rl.research_line_id, rl.name, rl.description,
                 COALESCE((SELECT json_agg(json_build_object('name', rsl.name, 'description', rsl.description))
                           FROM public.research_sublines rsl 
                           WHERE rsl.research_line_id = rl.research_line_id
                          ), '[]'::json) as sublines
          FROM public.research_lines rl
          WHERE 1=1
            ${enteroSeguro(programId) ? `AND rl.program_id = ${enteroSeguro(programId)}` : ''}
          ORDER BY rl.name
        `);
        const lines = [`LÍNEAS DE INVESTIGACIÓN DISPONIBLES EN ${programName.toUpperCase()}:`, ''];
        linesRes.rows.forEach(l => {
          lines.push(`• ${l.name}: ${l.description || 'Línea de investigación institucional'}`);
          if (l.sublines && l.sublines.length > 0) {
            lines.push(`  Sublíneas: ${l.sublines.map(s => s.name).join(', ')}`);
          }
          lines.push('');
        });
        return ({ message: lines.join('\n').trim(), projects: [], lines: linesRes.rows });
      }

      if (/proyectos estan disponibles|banco de proyectos|proyectos disponibles/.test(norm)) {
        const dispRes = await pool.query(`
          SELECT p.project_id, p.code, p.title, p.created_at, p.finished_at,
                 s.name as status_name, m.name as modality_name,
                 rl.name as line_name, rsl.name as subline_name,
                 COALESCE((SELECT json_agg(json_build_object('name', u2.full_name, 'email', u2.email, 'role', up2.project_role))
                           FROM public.user_projects up2 JOIN public.users u2 ON u2.user_id = up2.user_id
                           WHERE up2.project_id = p.project_id), '[]'::json) as participants
          FROM public.projects p
          LEFT JOIN public.statuses s ON s.status_id = p.status_id
          LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
          LEFT JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
          LEFT JOIN public.research_sublines rsl ON rsl.research_subline_id = p.research_subline_id
          WHERE (s.name ILIKE '%disponib%' OR s.name ILIKE '%banco%' OR s.name ILIKE '%propuest%')
            ${programProjectScope}
          ORDER BY p.created_at DESC LIMIT 15
        `);
        const projects = dispRes.rows.map(row => formatChatbookProject(row, true));
        return ({
          message: projects.length > 0
            ? `Encontré ${projects.length} proyecto(s) disponibles/propuestas en el Banco de Proyectos de ${programName}:`
            : `Actualmente no hay proyectos con estado disponible en el Banco de Proyectos de ${programName}.`,
          projects
        });
      }

  return null;
}
