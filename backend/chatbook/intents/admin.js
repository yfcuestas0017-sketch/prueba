/**
 * INTENCIONES DEL CHATBOOK — PERFIL ADMINISTRADOR
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

import { formatChatbookProject, formatDateCO, getAllTeachersWithStats, getRemainingTime } from '../chatbook_helpers.js';
import { enteroSeguro } from '../../utils/sqlLiteral.js';

export async function handleAdminIntents(ctx) {
  const { pool, norm, programId, programName, programProjectScope } = ctx;

      if (/proyectos estan proximos a terminar|proximos a terminar/.test(norm)) {
        const proxRes = await pool.query(`
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
          WHERE p.finished_at IS NOT NULL ${programProjectScope}
          ORDER BY p.finished_at ASC LIMIT 10
        `);
        const projects = proxRes.rows.map(row => formatChatbookProject(row, false));
        const lines = [`PROYECTOS PRÓXIMOS A TERMINAR EN ${programName.toUpperCase()}:`, ''];
        projects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Finalización: ${formatDateCO(p.finishedAt)} (${getRemainingTime(p.finishedAt)}) | Estado: ${p.status}`);
        });
        return ({ message: lines.join('\n'), projects });
      }

      if (/proyectos comenzaron recientemente|comenzaron recientemente/.test(norm)) {
        const recentRes = await pool.query(`
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
          WHERE 1=1 ${programProjectScope}
          ORDER BY p.created_at DESC LIMIT 10
        `);
        const projects = recentRes.rows.map(row => formatChatbookProject(row, false));
        const lines = [`PROYECTOS INICIADOS RECIENTEMENTE EN ${programName.toUpperCase()}:`, ''];
        projects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Inició: ${formatDateCO(p.createdAt)} | Estado: ${p.status}`);
        });
        return ({ message: lines.join('\n'), projects });
      }

      if (/proyectos terminan este mes|terminan este mes/.test(norm)) {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const monthRes = await pool.query(`
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
          WHERE EXTRACT(MONTH FROM p.finished_at) = $1 AND EXTRACT(YEAR FROM p.finished_at) = $2
            ${programProjectScope}
          ORDER BY p.finished_at ASC
        `, [currentMonth, currentYear]);
        const projects = monthRes.rows.map(row => formatChatbookProject(row, false));
        const lines = [`PROYECTOS QUE TERMINAN ESTE MES (${projects.length}):`, ''];
        if (projects.length > 0) {
          projects.forEach(p => lines.push(`- ${p.code || 'Sin código'} — ${p.title} (Fecha: ${formatDateCO(p.finishedAt)})`));
        } else {
          lines.push('No hay proyectos con fecha de finalización programada para el mes actual.');
        }
        return ({ message: lines.join('\n'), projects });
      }

      if (/fechas de los proyectos|por fecha de finalizacion/.test(norm)) {
        const datesRes = await pool.query(`
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
          WHERE 1=1 ${programProjectScope}
          ORDER BY p.finished_at ASC NULLS LAST LIMIT 15
        `);
        const projects = datesRes.rows.map(row => formatChatbookProject(row, false));
        const lines = [`FECHAS DE PROYECTOS EN ${programName.toUpperCase()}:`, ''];
        projects.forEach(p => {
          lines.push(`- ${p.code || 'Sin código'} — ${p.title}`);
          lines.push(`  Inicio: ${formatDateCO(p.createdAt)} | Fin: ${formatDateCO(p.finishedAt)} | Estado: ${p.status}`);
          lines.push('');
        });
        return ({ message: lines.join('\n').trim(), projects });
      }

      if (/cuantos proyectos existen por estado|proyectos por estado|existen por estado/.test(norm)) {
        const countsRes = await pool.query(`
          SELECT COALESCE(s.name, 'Sin estado') as status_name, COUNT(*)::int as count
          FROM public.projects p
          LEFT JOIN public.statuses s ON s.status_id = p.status_id
          WHERE 1=1 ${programProjectScope}
          GROUP BY COALESCE(s.name, 'Sin estado')
          ORDER BY count DESC
        `);
        const total = countsRes.rows.reduce((acc, r) => acc + r.count, 0);
        const lines = [`ESTADÍSTICAS DE PROYECTOS POR ESTADO EN ${programName.toUpperCase()} (Total: ${total}):`, ''];
        countsRes.rows.forEach(r => lines.push(`• ${r.status_name}: ${r.count} proyecto(s)`));
        const stats = countsRes.rows.map(r => ({ label: r.status_name, value: r.count, sublabel: 'proyecto(s)' }));
        return ({ message: lines.join('\n'), projects: [], stats });
      }

      if (/cuantos proyectos existen actualmente|cuantos proyectos existen|total de proyectos/.test(norm)) {
        const totalRes = await pool.query(`
          SELECT COUNT(*)::int as total
          FROM public.projects p
          WHERE 1=1 ${programProjectScope}
        `);
        const total = totalRes.rows[0]?.total || 0;
        return ({
          message: `Actualmente existen ${total} proyecto(s) de grado registrados en el sistema para ${programName}.`,
          projects: []
        });
      }

      if (/proyectos estan en ejecucion|en ejecucion/.test(norm)) {
        const activeRes = await pool.query(`
          SELECT p.project_id, p.code, p.title, p.created_at, p.finished_at,
                 s.name as status_name, m.name as modality_name,
                 rl.name as line_name, rsl.name as subline_name,
                 COALESCE((SELECT json_agg(json_build_object('name', u2.full_name, 'email', u2.email, 'role', up2.project_role))
                           FROM public.user_projects up2 JOIN public.users u2 ON u2.user_id = up2.user_id
                           WHERE up2.project_id = p.project_id), '[]'::json) as participants
          FROM public.projects p
          JOIN public.statuses s ON s.status_id = p.status_id
          LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
          LEFT JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
          LEFT JOIN public.research_sublines rsl ON rsl.research_subline_id = p.research_subline_id
          WHERE (s.name ILIKE '%curso%' OR s.name ILIKE '%ejecucion%') ${programProjectScope}
          ORDER BY p.created_at DESC
        `);
        const projects = activeRes.rows.map(row => formatChatbookProject(row, false));
        const lines = [`PROYECTOS EN EJECUCIÓN (${projects.length}) EN ${programName.toUpperCase()}:`, ''];
        projects.forEach(p => lines.push(`- ${p.code || 'Sin código'} — ${p.title}`));
        return ({ message: lines.join('\n'), projects });
      }

      if (/proyectos estan terminados|terminados/.test(norm)) {
        const doneRes = await pool.query(`
          SELECT p.project_id, p.code, p.title, p.created_at, p.finished_at,
                 s.name as status_name, m.name as modality_name,
                 rl.name as line_name, rsl.name as subline_name,
                 COALESCE((SELECT json_agg(json_build_object('name', u2.full_name, 'email', u2.email, 'role', up2.project_role))
                           FROM public.user_projects up2 JOIN public.users u2 ON u2.user_id = up2.user_id
                           WHERE up2.project_id = p.project_id), '[]'::json) as participants
          FROM public.projects p
          JOIN public.statuses s ON s.status_id = p.status_id
          LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
          LEFT JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
          LEFT JOIN public.research_sublines rsl ON rsl.research_subline_id = p.research_subline_id
          WHERE (s.name ILIKE '%finalizad%' OR s.name ILIKE '%terminad%') ${programProjectScope}
          ORDER BY p.finished_at DESC
        `);
        const projects = doneRes.rows.map(row => formatChatbookProject(row, false));
        const lines = [`PROYECTOS TERMINADOS (${projects.length}) EN ${programName.toUpperCase()}:`, ''];
        projects.forEach(p => lines.push(`- ${p.code || 'Sin código'} — ${p.title} (Culminó: ${formatDateCO(p.finishedAt)})`));
        return ({ message: lines.join('\n'), projects });
      }

      if (/proyectos estan pendientes|pendientes/.test(norm)) {
        const pendRes = await pool.query(`
          SELECT p.project_id, p.code, p.title, p.created_at, p.finished_at,
                 s.name as status_name, m.name as modality_name,
                 rl.name as line_name, rsl.name as subline_name,
                 COALESCE((SELECT json_agg(json_build_object('name', u2.full_name, 'email', u2.email, 'role', up2.project_role))
                           FROM public.user_projects up2 JOIN public.users u2 ON u2.user_id = up2.user_id
                           WHERE up2.project_id = p.project_id), '[]'::json) as participants
          FROM public.projects p
          JOIN public.statuses s ON s.status_id = p.status_id
          LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
          LEFT JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
          LEFT JOIN public.research_sublines rsl ON rsl.research_subline_id = p.research_subline_id
          WHERE (s.name ILIKE '%propuest%' OR s.name ILIKE '%radicad%' OR s.name ILIKE '%pendient%') ${programProjectScope}
          ORDER BY p.created_at DESC
        `);
        const projects = pendRes.rows.map(row => formatChatbookProject(row, false));
        const lines = [`PROYECTOS PENDIENTES / EN PROPUESTA (${projects.length}) EN ${programName.toUpperCase()}:`, ''];
        projects.forEach(p => lines.push(`- ${p.code || 'Sin código'} — ${p.title}`));
        return ({ message: lines.join('\n'), projects });
      }

      if (/proyectos estan disponibles|proyectos disponibles/.test(norm)) {
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
          WHERE (s.name ILIKE '%disponib%' OR s.name ILIKE '%banco%') ${programProjectScope}
          ORDER BY p.created_at DESC
        `);
        const projects = dispRes.rows.map(row => formatChatbookProject(row, false));
        return ({
          message: projects.length > 0
            ? `Encontré ${projects.length} proyecto(s) disponible(s) en el Banco de Proyectos de ${programName}:`
            : `No hay proyectos con estado disponible en el Banco de Proyectos de ${programName}.`,
          projects
        });
      }

      if (/muestrame todos los proyectos|todos los proyectos|ver todos los proyectos/.test(norm)) {
        const allRes = await pool.query(`
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
          WHERE 1=1 ${programProjectScope}
          ORDER BY p.created_at DESC LIMIT 25
        `);
        const projects = allRes.rows.map(row => formatChatbookProject(row, false));
        return ({
          message: `Encontré ${projects.length} proyectos registrados en ${programName}:`,
          projects
        });
      }

      if (/busca proyectos por modalidad|proyectos por modalidad/.test(norm)) {
        const modRes = await pool.query(`
          SELECT COALESCE(m.name, 'Sin modalidad') as modality_name, COUNT(*)::int as count
          FROM public.projects p
          LEFT JOIN public.modalities m ON m.modality_id = p.modality_id
          WHERE 1=1 ${programProjectScope}
          GROUP BY COALESCE(m.name, 'Sin modalidad')
          ORDER BY count DESC
        `);
        const lines = [`PROYECTOS POR MODALIDAD EN ${programName.toUpperCase()}:`, ''];
        modRes.rows.forEach(r => lines.push(`• ${r.modality_name}: ${r.count} proyecto(s)`));
        const stats = modRes.rows.map(r => ({ label: r.modality_name, value: r.count, sublabel: 'proyecto(s)' }));
        return ({ message: lines.join('\n'), projects: [], stats });
      }

      if (/que lineas de investigacion existen|que lineas existen|lineas de investigacion existen/.test(norm)) {
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
        const lines = [`LÍNEAS DE INVESTIGACIÓN REGISTRADAS EN ${programName.toUpperCase()} (${linesRes.rows.length}):`, ''];
        linesRes.rows.forEach(l => {
          lines.push(`• ${l.name}: ${l.description || 'Línea de investigación institucional'}`);
          if (l.sublines && l.sublines.length > 0) {
            lines.push(`  Sublíneas: ${l.sublines.map(s => s.name).join(', ')}`);
          }
          lines.push('');
        });
        return ({ message: lines.join('\n').trim(), projects: [], lines: linesRes.rows });
      }

      if (/que sublineas existen|sublineas existen/.test(norm)) {
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
        const lines = [`SUBLÍNEAS DE INVESTIGACIÓN EN ${programName.toUpperCase()}:`, ''];
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

      if (/cuantos proyectos tiene cada linea|proyectos tiene cada linea|proyectos por linea|busca proyectos por linea/.test(norm)) {
        const linesCountRes = await pool.query(`
          SELECT rl.name as line_name, COUNT(p.project_id)::int as count
          FROM public.research_lines rl
          JOIN public.projects p ON p.research_line_id = rl.research_line_id ${programProjectScope}
          WHERE 1=1
            ${enteroSeguro(programId) ? `AND rl.program_id = ${enteroSeguro(programId)}` : ''}
          GROUP BY rl.name
          HAVING COUNT(p.project_id) > 0
          ORDER BY count DESC
        `);
        const lines = [`CANTIDAD DE PROYECTOS POR LÍNEA DE INVESTIGACIÓN EN ${programName.toUpperCase()}:`, ''];
        linesCountRes.rows.forEach(r => lines.push(`• ${r.line_name}: ${r.count} proyecto(s)`));
        const stats = linesCountRes.rows.map(r => ({ label: r.line_name, value: r.count, sublabel: 'proyecto(s)' }));
        return ({ message: lines.join('\n'), projects: [], stats });
      }

      if (/docentes pertenecen a cada linea|docentes por linea/.test(norm)) {
        const teachersByLineRes = await pool.query(`
          SELECT rl.name as line_name, u.full_name, u.email
          FROM public.projects p
          JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
          JOIN public.user_projects up ON up.project_id = p.project_id
          JOIN public.users u ON u.user_id = up.user_id
          JOIN public.user_roles ur ON ur.user_id = u.user_id
          JOIN public.roles r ON r.role_id = ur.role_id
          WHERE (LOWER(r.name) LIKE '%docent%') ${programProjectScope}
            ${enteroSeguro(programId) ? `AND rl.program_id = ${enteroSeguro(programId)}` : ''}
          GROUP BY rl.name, u.full_name, u.email
          ORDER BY rl.name, u.full_name
        `);
        const grouped = {};
        teachersByLineRes.rows.forEach(r => {
          if (!grouped[r.line_name]) grouped[r.line_name] = [];
          grouped[r.line_name].push(`${r.full_name} (${r.email})`);
        });
        const lines = [`DOCENTES POR LÍNEA DE INVESTIGACIÓN EN ${programName.toUpperCase()}:`, ''];
        Object.entries(grouped).forEach(([lName, tList]) => {
          lines.push(`• ${lName} (${tList.length} docentes):`);
          tList.forEach(t => lines.push(`  - ${t}`));
          lines.push('');
        });
        const stats = Object.entries(grouped).map(([lName, tList]) => ({
          label: lName,
          value: tList.length,
          sublabel: tList.length === 1 ? 'docente' : 'docentes',
          items: tList,
        }));
        return ({ message: lines.join('\n').trim(), projects: [], stats });
      }

      if (/proyectos estan asociados a cada linea|proyectos asociados a cada linea/.test(norm)) {
        const lineProjectsRes = await pool.query(`
          SELECT rl.name as line_name, p.code, p.title
          FROM public.projects p
          JOIN public.research_lines rl ON rl.research_line_id = p.research_line_id
          WHERE 1=1 ${programProjectScope}
            ${enteroSeguro(programId) ? `AND rl.program_id = ${enteroSeguro(programId)}` : ''}
          ORDER BY rl.name, p.code
        `);
        const grouped = {};
        lineProjectsRes.rows.forEach(r => {
          if (!grouped[r.line_name]) grouped[r.line_name] = [];
          grouped[r.line_name].push(`${r.code || 'Sin código'} — ${r.title}`);
        });
        const lines = [`PROYECTOS ASOCIADOS A CADA LÍNEA EN ${programName.toUpperCase()}:`, ''];
        Object.entries(grouped).forEach(([lName, pList]) => {
          lines.push(`• ${lName} (${pList.length} proyectos):`);
          pList.forEach(p => lines.push(`  - ${p}`));
          lines.push('');
        });
        const stats = Object.entries(grouped).map(([lName, pList]) => ({
          label: lName,
          value: pList.length,
          sublabel: pList.length === 1 ? 'proyecto' : 'proyectos',
          items: pList,
        }));
        return ({ message: lines.join('\n').trim(), projects: [], stats });
      }

      if (/que docentes existen|que docentes estan registrados|que docentes hay/.test(norm)) {
        const allProfiles = await getAllTeachersWithStats(programId);
        if (allProfiles.length === 0) {
          return ({ message: `No hay docentes registrados en la base de datos para ${programName}.`, projects: [] });
        }
        const lines = [`DOCENTES REGISTRADOS EN ${programName.toUpperCase()} (${allProfiles.length}):`, ''];
        allProfiles.forEach((p, idx) => {
          const lineStr = p.lines.length > 0 ? p.lines.join(', ') : 'Sin línea asignada';
          lines.push(`${idx + 1}. ${p.teacher.full_name} (${p.teacher.email})`);
          lines.push(`   - Línea(s): ${lineStr}`);
          lines.push(`   - Proyectos: Total ${p.totalProjects} (Asesor: ${p.asesorProjects.length}, Jurado: ${p.juradoProjects.length})`);
          lines.push('');
        });
        const stats = allProfiles.map(p => ({
          label: p.teacher.full_name,
          value: p.totalProjects,
          sublabel: p.totalProjects === 1 ? 'proyecto' : 'proyectos',
          items: [
            `Email: ${p.teacher.email}`,
            `Línea(s): ${p.lines.length > 0 ? p.lines.join(', ') : 'Sin línea asignada'}`,
            `Asesor: ${p.asesorProjects.length} | Jurado: ${p.juradoProjects.length}`,
          ],
        }));
        return ({ message: lines.join('\n').trim(), projects: [], stats });
      }

      if (/proyectos tiene asignado cada docente|proyectos por docente/.test(norm)) {
        const allProfiles = await getAllTeachersWithStats(programId);
        const lines = [`ASIGNACIÓN DE PROYECTOS POR DOCENTE EN ${programName.toUpperCase()}:`, ''];
        allProfiles.forEach(p => {
          lines.push(`• ${p.teacher.full_name} (${p.teacher.email}):`);
          lines.push(`  Total: ${p.totalProjects} | Asesor: ${p.asesorProjects.length} | Jurado: ${p.juradoProjects.length}`);
          if (p.asesorProjects.length > 0) {
            p.asesorProjects.forEach(proj => lines.push(`  - Asesor: ${proj.code || 'Sin código'} — ${proj.title}`));
          }
          if (p.juradoProjects.length > 0) {
            p.juradoProjects.forEach(proj => lines.push(`  - Jurado: ${proj.code || 'Sin código'} — ${proj.title}`));
          }
          lines.push('');
        });
        const stats = allProfiles.map(p => {
          const items = [];
          p.asesorProjects.forEach(proj => items.push(`Asesor: ${proj.code || 'Sin código'} — ${proj.title}`));
          p.juradoProjects.forEach(proj => items.push(`Jurado: ${proj.code || 'Sin código'} — ${proj.title}`));
          return {
            label: p.teacher.full_name,
            value: p.totalProjects,
            sublabel: `${p.asesorProjects.length} asesor · ${p.juradoProjects.length} jurado`,
            items,
          };
        });
        return ({ message: lines.join('\n').trim(), projects: [], stats });
      }

      if (/docentes tienen proyectos asociados|docentes con proyectos/.test(norm)) {
        const allProfiles = await getAllTeachersWithStats(programId);
        const activeTeachers = allProfiles.filter(p => p.totalProjects > 0);
        const lines = [`DOCENTES CON PROYECTOS ASOCIADOS EN ${programName.toUpperCase()} (${activeTeachers.length}):`, ''];
        activeTeachers.forEach(p => {
          lines.push(`- ${p.teacher.full_name} (${p.teacher.email}): ${p.totalProjects} proyecto(s) (${p.asesorProjects.length} como asesor, ${p.juradoProjects.length} como jurado)`);
        });
        const stats = activeTeachers.map(p => ({
          label: p.teacher.full_name,
          value: p.totalProjects,
          sublabel: `${p.asesorProjects.length} asesor · ${p.juradoProjects.length} jurado`,
          items: [`Email: ${p.teacher.email}`],
        }));
        return ({ message: lines.join('\n'), projects: [], stats });
      }

  return null;
}
