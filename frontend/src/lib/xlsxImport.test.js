import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImportHeader, parseCsv } from './xlsxImport.js';

test('parses comma-delimited CSV with quoted commas and UTF-8 BOM', () => {
  assert.deepEqual(
    parseCsv('\uFEFFfull_name,email,program_name\r\n"Ana, María",ana@example.edu,Ingeniería'),
    [
      ['full_name', 'email', 'program_name'],
      ['Ana, María', 'ana@example.edu', 'Ingeniería'],
    ],
  );
});

test('parses semicolon-delimited CSV and normalizes headers', () => {
  assert.deepEqual(
    parseCsv('full_name;email;program_name\nCarlos;car@example.edu;Sistemas'),
    [
      ['full_name', 'email', 'program_name'],
      ['Carlos', 'car@example.edu', 'Sistemas'],
    ],
  );
  assert.equal(normalizeImportHeader(' Full_Name '), 'full_name');
});

test('rejects CSV with an unterminated quoted value', () => {
  assert.throws(() => parseCsv('full_name,email\n"Ana,ana@example.edu'), /comillas sin cerrar/);
});
