import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, isInitialPassword } from '../utils/password.js';

test('recognizes the initial password stored as legacy plaintext or bcrypt', async () => {
  assert.equal(await isInitialPassword('12345678'), true);
  assert.equal(await isInitialPassword(await hashPassword('12345678')), true);
});

test('does not require a change when the stored password is not the initial password', async () => {
  assert.equal(await isInitialPassword('otra-clave-segura'), false);
  assert.equal(await isInitialPassword(await hashPassword('otra-clave-segura')), false);
});
