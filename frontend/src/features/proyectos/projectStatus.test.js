import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStudentProjectMessage,
  isFinalProjectStatus,
  isRejectedProjectStatus,
} from './projectStatus.js';

test('does not treat a rejected project as finalized', () => {
  assert.equal(isFinalProjectStatus('No aprobado'), false);
  assert.equal(isFinalProjectStatus('Aprobado'), false);
  assert.equal(isFinalProjectStatus('Finalizado'), true);
  assert.equal(isFinalProjectStatus('Sustentado'), true);
  assert.equal(isRejectedProjectStatus(' No aprobado '), true);
});

test('tells the student which phase was not approved', () => {
  assert.equal(
    getStudentProjectMessage(
      { status: 'No aprobado', processPhase: 3 },
      'Ya tienes un proyecto de investigación registrado.',
    ),
    'No aprobaste Investigación III. El proyecto permanece en esta fase hasta que el administrador registre una nueva decisión.',
  );
});
