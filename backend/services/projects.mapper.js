/**
 * PRESENTACIÓN DE PROYECTOS
 * UNIVERSIDAD CESMAG
 *
 * Convierte las filas del repositorio en el objeto que consume el frontend.
 * Estaba duplicado entre el listado general y el reporte detallado; eran ~130
 * líneas repetidas con una única diferencia real: el reporte sustituye los
 * nulos por textos legibles ("Sin estado", "Sin programa"), porque sus tablas y
 * sus PDF no pueden mostrar celdas vacías.
 *
 * Esa diferencia se expresa ahora con el parámetro `defaults`, en vez de con
 * dos copias del mismo mapeo.
 */

/**
 * Aplica un valor por defecto SOLO si se configuró uno. Si no hay defecto, el
 * valor pasa tal cual —incluido `null` o cadena vacía—, que es como se comporta
 * hoy el listado general.
 */
function conDefecto(valor, defecto, fila) {
  if (defecto === null || defecto === undefined) return valor;
  if (valor) return valor;
  return typeof defecto === 'function' ? defecto(fila) : defecto;
}

/**
 * Separa a los participantes por su papel en el proyecto.
 *
 * El "autor principal" es de quien se toman el programa, la facultad y el
 * semestre del proyecto. Se prefiere al primer autor o coautor; si el proyecto
 * no tiene ninguno (solo asesor o jurado), se cae al primer participante.
 */
export function splitParticipants(participants = []) {
  const authors = participants.filter((up) => up.project_role === 'autor' || up.project_role === 'coautor');
  const advisors = participants.filter((up) => up.project_role === 'asesor');
  const jurors = participants.filter((up) => up.project_role === 'jurado');
  return { authors, advisors, jurors, primaryAuthor: authors[0] || participants[0] };
}

/**
 * Periodo académico en formato AAAA-1 o AAAA-2, según el semestre calendario en
 * que se creó el proyecto. Devuelve null si el proyecto no tiene fecha.
 */
export function academicPeriodOf(createdAt) {
  if (!createdAt) return null;
  const fecha = new Date(createdAt);
  const year = fecha.getFullYear();
  const month = fecha.getMonth() + 1;
  return `${year}-${month <= 6 ? '1' : '2'}`;
}

/** Un autor o coautor, con su semestre. */
export function mapAuthor(a) {
  return {
    id: String(a.user_id),
    name: a.full_name,
    email: a.email,
    role: a.project_role,
    program: a.program_name,
    programId: a.program_id,
    semesterNumber: a.semester_number,
  };
}

/** Un asesor o jurado: no llevan semestre ni papel, porque son docentes. */
export function mapMember(a) {
  return {
    id: String(a.user_id),
    name: a.full_name,
    email: a.email,
    program: a.program_name,
    programId: a.program_id,
  };
}

/**
 * Los campos que el listado general y el reporte detallado tienen en común.
 * Cada uno añade después lo suyo: la opción de grado y `user_projects` en el
 * primero, los contadores de actividad en el segundo.
 *
 * `defaults` acepta por clave un texto o una función de la fila (el reporte usa
 * una función para el código: `PR-<id>`).
 */
export function buildProjectBase(p, participants = [], defaults = {}) {
  const { authors, advisors, jurors, primaryAuthor } = splitParticipants(participants);

  return {
    id: p.project_id,
    project_id: p.project_id,
    title: p.title,
    code: conDefecto(p.code, defaults.code, p),
    created_at: p.created_at,
    finished_at: p.finished_at,
    letterLink: p.letter_link,
    statusId: p.status_id,
    status: conDefecto(p.status_name, defaults.status, p),
    modalityId: p.modality_id,
    modality: conDefecto(p.modality_name, defaults.modality, p),
    lineId: p.research_line_id,
    line: conDefecto(p.line_name, defaults.line, p),
    sublineId: p.research_subline_id,
    subline: conDefecto(p.subline_name, defaults.subline, p),
    programId: primaryAuthor?.program_id || null,
    programName: conDefecto(primaryAuthor?.program_name || null, defaults.program, p),
    facultyName: conDefecto(primaryAuthor?.faculty_name || null, defaults.faculty, p),
    semesterNumber: primaryAuthor?.semester_number || null,
    semesterId: primaryAuthor?.semester_id || null,
    academicPeriod: conDefecto(academicPeriodOf(p.created_at), defaults.period, p),
    authors: authors.map(mapAuthor),
    advisors: advisors.map(mapMember),
    jurors: jurors.map(mapMember),
  };
}

/**
 * Textos por defecto del reporte detallado. Se declaran una sola vez, aquí,
 * para que no se dispersen por el controlador.
 */
export const REPORT_DEFAULTS = {
  code: (p) => `PR-${p.project_id}`,
  status: 'Sin estado',
  modality: 'Sin modalidad',
  line: 'Sin línea',
  subline: 'Sin sublínea',
  program: 'Sin programa',
  faculty: 'Sin facultad',
  period: 'Sin periodo',
};
