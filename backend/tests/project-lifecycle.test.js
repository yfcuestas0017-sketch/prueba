import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getApprovedPhaseTransition,
  getInitialProjectLifecycle,
  getProjectReviewTransition,
  isFinalProjectStatus,
} from '../services/project-lifecycle.js';

test('recognizes finalized project statuses without matching unrelated names', () => {
  assert.equal(isFinalProjectStatus('Finalizado'), true);
  assert.equal(isFinalProjectStatus('  TERMINADO '), true);
  assert.equal(isFinalProjectStatus('En curso'), false);
  assert.equal(isFinalProjectStatus(null), false);
});

test('student proposal starts in review and has no research phase', () => {
  assert.deepEqual(getInitialProjectLifecycle(true), {
    stage: 'propuesta',
    phase: null,
    statusName: 'En revisión',
  });
  assert.deepEqual(getProjectReviewTransition({
    stage: 'propuesta',
    phase: null,
    requestedStatusName: 'Aprobado',
  }), {
    stage: 'investigacion',
    phase: 1,
    statusName: 'En curso',
  });
});

test('non-proposal project keeps the standard initial investigation phase', () => {
  assert.deepEqual(getInitialProjectLifecycle(false), {
    stage: 'investigacion',
    phase: 1,
    statusName: null,
  });
});

test('proposal review does not start research until it is approved', () => {
  assert.deepEqual(getProjectReviewTransition({
    stage: 'propuesta',
    phase: null,
    requestedStatusName: 'No aprobado',
  }), {
    stage: 'propuesta',
    phase: null,
    statusName: 'No aprobado',
  });
});

test('advances an approved phase I project when all student authors reach semester 9', () => {
  assert.deepEqual(getApprovedPhaseTransition({
    stage: 'investigacion',
    phase: 1,
    semesterNumber: 9,
    statusName: 'Aprobado',
    allAuthorsAtTargetSemester: true,
  }), { phase: 2, statusName: 'En curso' });
});

test('advances an approved phase II project when all student authors reach semester 10', () => {
  assert.deepEqual(getApprovedPhaseTransition({
    stage: 'investigacion',
    phase: 2,
    semesterNumber: 10,
    statusName: 'Aprobado',
    allAuthorsAtTargetSemester: true,
  }), { phase: 3, statusName: 'En curso' });
});

test('does not advance until every student author reaches the target semester', () => {
  assert.equal(getApprovedPhaseTransition({
    stage: 'investigacion',
    phase: 1,
    semesterNumber: 9,
    statusName: 'Aprobado',
    allAuthorsAtTargetSemester: false,
  }), null);
});

test('does not re-advance when the semester is re-imported or the project is not approved', () => {
  const base = {
    stage: 'investigacion',
    phase: 2,
    semesterNumber: 9,
    allAuthorsAtTargetSemester: true,
  };
  assert.equal(getApprovedPhaseTransition({ ...base, statusName: 'En curso' }), null);
  assert.equal(getApprovedPhaseTransition({ ...base, statusName: 'Aprobado' }), null);
});

test('finalizes an approved phase III project during review', () => {
  assert.deepEqual(getProjectReviewTransition({
    stage: 'investigacion',
    phase: 3,
    requestedStatusName: 'Aprobado',
  }), {
    stage: 'investigacion',
    phase: 3,
    statusName: 'Finalizado',
  });
});

test('keeps phase III active when its review is not approved', () => {
  assert.deepEqual(getProjectReviewTransition({
    stage: 'investigacion',
    phase: 3,
    requestedStatusName: 'No aprobado',
  }), {
    stage: 'investigacion',
    phase: 3,
    statusName: 'No aprobado',
  });
});

test('leaves phase I and II approval for the next semester import', () => {
  assert.deepEqual(getProjectReviewTransition({
    stage: 'investigacion',
    phase: 2,
    requestedStatusName: 'Aprobado',
  }), {
    stage: 'investigacion',
    phase: 2,
    statusName: 'Aprobado',
  });
});
