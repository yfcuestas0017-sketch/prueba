const FINAL_PROJECT_STATUSES = new Set(['finalizado', 'terminado', 'completado', 'sustentado']);
const PHASE_LABELS = new Map([
  [1, 'I'],
  [2, 'II'],
  [3, 'III'],
]);

export function isFinalProjectStatus(status) {
  return FINAL_PROJECT_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function isRejectedProjectStatus(status) {
  return String(status || '').trim().toLowerCase() === 'no aprobado';
}

export function getStudentProjectMessage(project, defaultMessage) {
  const phaseLabel = PHASE_LABELS.get(Number(project?.processPhase));

  if (isRejectedProjectStatus(project?.status) && phaseLabel) {
    return `No aprobaste Investigación ${phaseLabel}. El proyecto permanece en esta fase hasta que el administrador registre una nueva decisión.`;
  }

  return defaultMessage;
}
