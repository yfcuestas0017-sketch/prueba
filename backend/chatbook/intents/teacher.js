/**
 * INTENCIONES DEL CHATBOOK — PERFIL DOCENTE
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

import { formatChatbookProject, formatDateCO, getRemainingTime, normalizeChatbookText } from '../chatbook_helpers.js';
import { enteroSeguro } from '../../utils/sqlLiteral.js';

export async function handleTeacherIntents(ctx) {
  const { pool, currentUser, norm, programId, programName, programProjectScope } = ctx;

      const advisedProjectsRes = await pool.query(`
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
      const advisedProjects = advisedProjectsRes.rows.map(row => formatChatbookProject(row, false));

      if (/cuando terminan los proyectos que asesoro|fechas de los proyectos que asesoro|fechas de los proyectos/.test(norm)) {
        if (advisedProjects.length === 0) return ({ message: 'No tienes proyectos asignados como asesor actualmente.', projects: [] });
        const lines = ['CRONOGRAMA DE PROYECTOS QUE ASESORAS:', ''];
        advisedProjects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Inicio: ${formatDateCO(p.createdAt)} | Finalización: ${formatDateCO(p.finishedAt)}`);
          lines.push(`  Estado: ${p.status || 'En curso'} | Restante: ${getRemainingTime(p.finishedAt)}`);
          lines.push('');
        });
        return ({ message: lines.join('\n').trim(), projects: advisedProjects });
      }

      if (/proyectos estan proximos a terminar|proximos a terminar/.test(norm) && !/todos/.test(norm)) {
        if (advisedProjects.length === 0) return ({ message: 'No tienes proyectos asignados actualmente.', projects: [] });
        const sorted = [...advisedProjects].sort((a, b) => new Date(a.finishedAt || '2099-01-01').getTime() - new Date(b.finishedAt || '2099-01-01').getTime());
        const lines = ['PROYECTOS QUE ASESORAS ORDENADOS POR FECHA DE FINALIZACIÓN:', ''];
        sorted.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Fecha de fin: ${formatDateCO(p.finishedAt)} (${getRemainingTime(p.finishedAt)})`);
        });
        return ({ message: lines.join('\n'), projects: sorted });
      }

      if (/fecha de inicio de este proyecto|fecha de finalizacion/.test(norm) && advisedProjects.length > 0) {
        const lines = ['FECHAS DE TUS PROYECTOS ASIGNADOS:', ''];
        advisedProjects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Inicio: ${formatDateCO(p.createdAt)} | Fin: ${formatDateCO(p.finishedAt)}`);
        });
        return ({ message: lines.join('\n'), projects: advisedProjects });
      }

      if (/cual es el estado de los proyectos que asesoro|estado de los proyectos que asesoro/.test(norm)) {
        if (advisedProjects.length === 0) return ({ message: 'No tienes proyectos asignados actualmente.', projects: [] });
        const lines = ['ESTADO DE LOS PROYECTOS QUE ASESORAS:', ''];
        advisedProjects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Estado: ${p.status || 'En curso'} (${p.line || 'Sin línea'})`);
        });
        return ({ message: lines.join('\n'), projects: advisedProjects });
      }

      if (/cuantos proyectos tengo en cada estado|proyectos tengo en cada estado/.test(norm)) {
        if (advisedProjects.length === 0) return ({ message: 'No tienes proyectos asignados actualmente.', projects: [] });
        const counts = {};
        advisedProjects.forEach(p => {
          const st = p.status || 'Sin estado';
          counts[st] = (counts[st] || 0) + 1;
        });
        const lines = [`TOTAL DE PROYECTOS ASESORADOS (${advisedProjects.length}) POR ESTADO:`, ''];
        Object.entries(counts).forEach(([st, cnt]) => lines.push(`- ${st}: ${cnt} proyecto(s)`));
        return ({ message: lines.join('\n'), projects: advisedProjects });
      }

      if (/proyectos estan en ejecucion|en ejecucion/.test(norm)) {
        const active = advisedProjects.filter(p => normalizeChatbookText(p.status).includes('curso') || normalizeChatbookText(p.status).includes('ejecucion'));
        const lines = [`PROYECTOS EN EJECUCIÓN (${active.length}):`, ''];
        active.forEach(p => lines.push(`- ${p.code || 'Sin código'} — ${p.title}`));
        return ({ message: lines.join('\n'), projects: active });
      }

      if (/proyectos estan terminados|terminados/.test(norm)) {
        const done = advisedProjects.filter(p => normalizeChatbookText(p.status).includes('finalizad') || normalizeChatbookText(p.status).includes('terminad'));
        const lines = [`PROYECTOS TERMINADOS (${done.length}):`, ''];
        done.forEach(p => lines.push(`- ${p.code || 'Sin código'} — ${p.title} (Fin: ${formatDateCO(p.finishedAt)})`));
        return ({ message: lines.join('\n'), projects: done });
      }

      if (/proyectos estan pendientes|pendientes/.test(norm)) {
        const pending = advisedProjects.filter(p => normalizeChatbookText(p.status).includes('propuest') || normalizeChatbookText(p.status).includes('pendient') || normalizeChatbookText(p.status).includes('radicad'));
        const lines = [`PROYECTOS PENDIENTES / EN PROPUESTA (${pending.length}):`, ''];
        pending.forEach(p => lines.push(`- ${p.code || 'Sin código'} — ${p.title}`));
        return ({ message: lines.join('\n'), projects: pending });
      }

      if (/que proyectos tengo asignados|que proyectos asesoro|proyectos que asesoro/.test(norm)) {
        if (advisedProjects.length === 0) return ({ message: 'No tienes proyectos asignados actualmente en el sistema.', projects: [] });
        const lines = [`PROYECTOS ASIGNADOS A TU CARGO (${advisedProjects.length}):`, ''];
        advisedProjects.forEach(p => {
          const authors = p.authors.map(a => a.name).join(', ') || 'Sin autores';
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Autores: ${authors} | Estado: ${p.status || 'En curso'}`);
          lines.push(`  Línea: ${p.line || 'Sin línea'}`);
          lines.push('');
        });
        return ({ message: lines.join('\n').trim(), projects: advisedProjects });
      }

      if (/estudiantes estan asociados a mis proyectos|estudiantes asociados/.test(norm)) {
        if (advisedProjects.length === 0) return ({ message: 'No tienes proyectos asignados actualmente.', projects: [] });
        const lines = ['ESTUDIANTES ASOCIADOS A TUS PROYECTOS:', ''];
        advisedProjects.forEach(p => {
          lines.push(`Proyecto: ${p.code || 'Sin código'} — ${p.title}`);
          if (p.authors && p.authors.length > 0) {
            p.authors.forEach(a => lines.push(`  • ${a.name} (${a.email || 'Sin correo'})`));
          } else {
            lines.push('  • Sin estudiantes registrados');
          }
          lines.push('');
        });
        return ({ message: lines.join('\n').trim(), projects: advisedProjects });
      }

      if (/a que linea pertenece este proyecto|a que linea pertenece|linea pertenece este proyecto/.test(norm)) {
        if (advisedProjects.length === 0) return ({ message: 'No tienes proyectos asignados para consultar su línea.', projects: [] });
        const lines = ['LÍNEAS DE TUS PROYECTOS ASIGNADOS:', ''];
        advisedProjects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}: Línea ${p.line || 'Sin línea'} (Sublínea: ${p.subline || 'Sin sublínea'})`);
        });
        return ({ message: lines.join('\n'), projects: advisedProjects });
      }

      if (/proyectos existen en mi linea|proyectos existen en esta linea|relacionados con esta tematica|busca proyectos relacionados/.test(norm)) {
        const teacherLines = [...new Set(advisedProjects.map(p => p.line).filter(Boolean))];
        const lineFilter = teacherLines.length > 0 ? teacherLines : ['Inteligencia Artificial', 'Ingeniería de Software'];
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
        `, [lineFilter]);
        const projects = lineProjectsRes.rows.map(row => formatChatbookProject(row, false));
        return ({
          message: `Encontré ${projects.length} proyecto(s) en tu línea (${lineFilter.join(', ')}) para ${programName}:`,
          projects
        });
      }

      if (/sublineas pertenecen a esta linea|sublineas/.test(norm)) {
        const sublinesRes = await pool.query(`
          SELECT rl.name as line_name, rsl.name as subline_name
          FROM public.research_sublines rsl
          JOIN public.research_lines rl ON rl.research_line_id = rsl.research_line_id
          WHERE 1=1
            ${enteroSeguro(programId) ? `AND rl.program_id = ${enteroSeguro(programId)}` : ''}
          ORDER BY rl.name, rsl.name
        `);
        const grouped = {};
        sublinesRes.rows.forEach(r => {
          if (!grouped[r.line_name]) grouped[r.line_name] = [];
          grouped[r.line_name].push(r.subline_name);
        });
        const lines = ['SUBLÍNEAS POR LÍNEA DE INVESTIGACIÓN:', ''];
        Object.entries(grouped).forEach(([lName, sList]) => {
          lines.push(`• ${lName}:`);
          lines.push(`  ${sList.join(', ')}`);
          lines.push('');
        });
        const stats = Object.entries(grouped).map(([lName, sList]) => ({
          label: lName,
          value: sList.length,
          sublabel: sList.length === 1 ? 'sublínea' : 'sublíneas',
          items: sList,
        }));
        return ({ message: lines.join('\n').trim(), projects: [], stats });
      }

      if (/docentes pertenecen a esta linea|docentes de esta linea/.test(norm)) {
        const teacherLines = [...new Set(advisedProjects.map(p => p.line).filter(Boolean))];
        const lineFilter = teacherLines.length > 0 ? teacherLines : ['Inteligencia Artificial', 'Ingeniería de Software'];
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
        `, [lineFilter]);
        const lines = [`DOCENTES ASOCIADOS A LA LÍNEA (${lineFilter.join(', ')}):`, ''];
        teachersInLineRes.rows.forEach(t => lines.push(`- ${t.full_name} (${t.email}) — ${t.line_name}`));
        const stats = teachersInLineRes.rows.map(t => ({ label: t.full_name, value: t.line_name, sublabel: t.email }));
        return ({ message: lines.join('\n'), projects: [], stats });
      }

  return null;
}
