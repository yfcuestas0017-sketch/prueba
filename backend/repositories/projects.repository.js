/**
 * REPOSITORIO DE PROYECTOS
 * UNIVERSIDAD CESMAG
 *
 * Aquí vive el SQL de lectura de proyectos. Antes estaba duplicado casi
 * literalmente en tres sitios: `projects.controller.js` (listado general),
 * `reports.controller.js` → `getDetailedReportProjects` (reporte detallado) y
 * `getProjectReportDetail` (ficha de un proyecto). Tres copias que había que
 * mantener en paralelo y que ya habían empezado a divergir: las dos del reporte
 * se quedaron sin la opción de grado cuando se añadió al listado.
 *
 * Las consultas se arman a partir de fragmentos compartidos —`PROJECT_SELECT` y
 * `PARTICIPANT_SELECT`— justamente para que no puedan volver a separarse: la
 * versión "todos" y la versión "uno" solo se diferencian en el WHERE.
 *
 * Cada función recibe `db`, que puede ser el pool o el client de una
 * transacción. Así el mismo SQL sirve dentro y fuera de una.
 */

/** Proyecto con sus catálogos resueltos (estado, modalidad, línea, sublínea, opción de grado). */
const PROJECT_SELECT = `
  SELECT
    p.project_id,
    p.title,
    p.code,
    p.created_at,
    p.finished_at,
    p.letter_link,
    p.status_id,
    p.modality_id,
    p.research_line_id,
    p.research_subline_id,
    p.degree_option_id,
    s.name as status_name,
    m.name as modality_name,
    rl.name as line_name,
    rsl.name as subline_name,
    dopt.name as degree_option_name
  FROM public.projects p
  LEFT JOIN public.statuses s ON p.status_id = s.status_id
  LEFT JOIN public.modalities m ON p.modality_id = m.modality_id
  LEFT JOIN public.research_lines rl ON p.research_line_id = rl.research_line_id
  LEFT JOIN public.research_sublines rsl ON p.research_subline_id = rsl.research_subline_id
  LEFT JOIN public.degree_options dopt ON p.degree_option_id = dopt.degree_option_id
`;

/** Vinculación persona ↔ proyecto, con programa, facultad y semestre de la persona. */
const PARTICIPANT_SELECT = `
  SELECT
    up.user_project_id,
    up.project_id,
    up.user_id,
    COALESCE(up.project_role, 'autor') as project_role,
    u.full_name,
    u.email,
    u.program_id,
    pr.name as program_name,
    f.faculty_id,
    f.name as faculty_name,
    st.semester_id,
    sem.semester_number
  FROM public.user_projects up
  JOIN public.users u ON up.user_id = u.user_id
  LEFT JOIN public.programs pr ON u.program_id = pr.program_id
  LEFT JOIN public.faculties f ON pr.faculty_id = f.faculty_id
  LEFT JOIN public.students st ON st.user_id::text = u.user_id::text
  LEFT JOIN public.semesters sem ON sem.semester_id = st.semester_id
`;

/**
 * El `user_id` se normaliza a texto aquí porque PostgreSQL lo devuelve como
 * UUID y el frontend lo compara como cadena.
 */
function normalizarParticipante(up) {
  return { ...up, user_id: String(up.user_id) };
}

/** Todos los proyectos, del más reciente al más antiguo. */
export async function findProjectRows(db) {
  const { rows } = await db.query(`${PROJECT_SELECT} ORDER BY p.created_at DESC;`);
  return rows;
}

/** Un proyecto por su id, o null si no existe. */
export async function findProjectRow(db, projectId) {
  const { rows } = await db.query(`${PROJECT_SELECT} WHERE p.project_id = $1 LIMIT 1;`, [projectId]);
  return rows[0] || null;
}

/** Todas las vinculaciones, de una sola vez, para no lanzar una consulta por proyecto. */
export async function findParticipantRows(db) {
  const { rows } = await db.query(`${PARTICIPANT_SELECT};`);
  return rows;
}

/** Las vinculaciones de un solo proyecto, ya normalizadas. */
export async function findParticipantRowsForProject(db, projectId) {
  const { rows } = await db.query(`${PARTICIPANT_SELECT} WHERE up.project_id = $1;`, [projectId]);
  return rows.map(normalizarParticipante);
}

/** Agrupa las vinculaciones por proyecto. */
export function groupParticipantsByProject(participantRows) {
  const porProyecto = {};
  participantRows.forEach((up) => {
    if (!porProyecto[up.project_id]) {
      porProyecto[up.project_id] = [];
    }
    porProyecto[up.project_id].push(normalizarParticipante(up));
  });
  return porProyecto;
}

/**
 * Proyectos con sus participantes ya agrupados: es lo que necesitan tanto el
 * listado general como el reporte detallado.
 */
export async function findProjectsWithParticipants(db) {
  const [projectRows, participantRows] = await Promise.all([
    findProjectRows(db),
    findParticipantRows(db),
  ]);
  return {
    projectRows,
    participantsByProject: groupParticipantsByProject(participantRows),
  };
}

/**
 * Cuántos avances, documentos e ítems de historial tiene cada proyecto.
 * Solo lo usa el reporte detallado.
 */
export async function findProjectActivityCounts(db) {
  const [progressRes, documentsRes, historiesRes] = await Promise.all([
    db.query(`SELECT project_id, COUNT(*)::int as count FROM public.research_progress GROUP BY project_id`),
    db.query(`SELECT project_id, COUNT(*)::int as count FROM public.research_documents GROUP BY project_id`),
    db.query(`SELECT project_id, COUNT(*)::int as count FROM public.project_histories GROUP BY project_id`),
  ]);
  return {
    progress: Object.fromEntries(progressRes.rows.map((r) => [r.project_id, r.count])),
    documents: Object.fromEntries(documentsRes.rows.map((r) => [r.project_id, r.count])),
    histories: Object.fromEntries(historiesRes.rows.map((r) => [r.project_id, r.count])),
  };
}
