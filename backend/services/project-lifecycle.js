const EXPECTED_SEMESTER_BY_PHASE = new Map([
  [1, 9],
  [2, 10],
]);

export function getInitialProjectLifecycle(isStudentProposal) {
  return isStudentProposal
    ? { stage: 'propuesta', phase: null, statusName: 'En revisión' }
    : { stage: 'investigacion', phase: 1, statusName: null };
}

export function getApprovedPhaseTransition({
  stage,
  phase,
  semesterNumber,
  statusName,
  allAuthorsAtTargetSemester,
}) {
  const normalizedStage = String(stage || '').trim().toLowerCase();
  const normalizedStatus = String(statusName || '').trim().toLowerCase();
  const currentPhase = Number(phase);
  const targetSemester = EXPECTED_SEMESTER_BY_PHASE.get(currentPhase);

  if (normalizedStage !== 'investigacion'
    || normalizedStatus !== 'aprobado'
    || !allAuthorsAtTargetSemester
    || Number(semesterNumber) !== targetSemester) {
    return null;
  }

  return { phase: currentPhase + 1, statusName: 'En curso' };
}

export function getProjectReviewTransition({ stage, phase, requestedStatusName }) {
  const normalizedStage = String(stage || '').trim().toLowerCase();
  const normalizedStatus = String(requestedStatusName || '').trim().toLowerCase();
  const currentPhase = phase === null || phase === undefined ? null : Number(phase);

  if (normalizedStage === 'propuesta' && normalizedStatus === 'aprobado') {
    return { stage: 'investigacion', phase: 1, statusName: 'En curso' };
  }
  if (normalizedStage === 'investigacion' && normalizedStatus === 'aprobado' && currentPhase === 3) {
    return { stage: 'investigacion', phase: 3, statusName: 'Finalizado' };
  }
  return { stage: normalizedStage, phase: currentPhase, statusName: requestedStatusName };
}
