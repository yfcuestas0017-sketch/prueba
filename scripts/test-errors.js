/**
 * BATERIA DEL MANEJO CENTRAL DE ERRORES
 * UNIVERSIDAD CESMAG
 *
 * Uso:
 *   1. Levantar el backend:  npm run backend
 *   2. En otra terminal:     npm run test:errors
 *
 * Prueba en dos niveles:
 *   A) El middleware aislado, sobre una app de Express desechable. Es la unica
 *      forma de provocar un fallo NO PREVISTO sin dejar una ruta de pruebas
 *      metida en el servidor real.
 *   B) El servidor en marcha, para el 404 de la API, el JSON mal formado y el
 *      cuerpo que supera el limite.
 */
import express from 'express';
import pool from '../backend/config/db.js';
import { signSessionToken } from '../backend/utils/token.js';
import { HttpError } from '../backend/utils/httpError.js';
import {
  asignarIdPeticion,
  rutaNoEncontrada,
  manejadorDeErrores,
} from '../backend/middlewares/error.middleware.js';

let ok = 0, fail = 0;
const check = (n, cond, det = '') => {
  if (cond) { ok++; console.log(`  OK    ${n}`); } else { fail++; console.log(`  FALLA ${n} ${det}`); }
};

/* ── A. El middleware aislado ─────────────────────────────────────────────── */
console.log('\n-- A. Middleware aislado --');

const app = express();
app.use(asignarIdPeticion);
app.use(express.json({ limit: '1kb' }));
app.get('/api/estalla-sincrono', () => { throw new Error('fallo sincrono de prueba'); });
app.get('/api/estalla-asincrono', async () => {
  await new Promise((r) => setTimeout(r, 1));
  throw new Error('fallo asincrono de prueba');
});
app.get('/api/dominio', () => { throw new HttpError(409, 'Conflicto de dominio.'); });
app.get('/api/cors', () => { throw new Error('Origen no autorizado por CORS: http://malo.example'); });
app.post('/api/eco', (req, res) => res.json({ recibido: true }));
app.use('/api', rutaNoEncontrada);
app.use(manejadorDeErrores);

const servidor = app.listen(0);
const puerto = servidor.address().port;
const base = `http://127.0.0.1:${puerto}`;

async function pedir(ruta, opciones = {}) {
  const res = await fetch(base + ruta, opciones);
  const texto = await res.text();
  let cuerpo = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { _noEsJson: texto.slice(0, 60) }; }
  return { status: res.status, cuerpo, idCabecera: res.headers.get('x-request-id') };
}

const sincrono = await pedir('/api/estalla-sincrono');
check('un fallo sincrono devuelve 500 en JSON', sincrono.status === 500 && !sincrono.cuerpo._noEsJson,
  JSON.stringify(sincrono.cuerpo).slice(0, 80));
check('la respuesta NO filtra el mensaje interno', !JSON.stringify(sincrono.cuerpo).includes('fallo sincrono'),
  JSON.stringify(sincrono.cuerpo).slice(0, 80));
check('la respuesta trae un errorId', Boolean(sincrono.cuerpo.errorId));
check('el errorId coincide con la cabecera X-Request-Id', sincrono.cuerpo.errorId === sincrono.idCabecera,
  `(${sincrono.cuerpo.errorId} vs ${sincrono.idCabecera})`);

const asincrono = await pedir('/api/estalla-asincrono');
check('un fallo ASINCRONO tambien se captura (Express 5)', asincrono.status === 500 && Boolean(asincrono.cuerpo.errorId),
  `(${asincrono.status})`);

const dominio = await pedir('/api/dominio');
check('un HttpError conserva su codigo y su mensaje',
  dominio.status === 409 && dominio.cuerpo.error === 'Conflicto de dominio.', JSON.stringify(dominio.cuerpo));
check('un HttpError NO lleva errorId (no es un fallo del servidor)', !dominio.cuerpo.errorId);

const cors = await pedir('/api/cors');
check('un rechazo de CORS es 403, no 500', cors.status === 403, `(${cors.status})`);

const noExiste = await pedir('/api/ruta-que-no-existe');
check('una ruta inexistente de la API devuelve 404 en JSON',
  noExiste.status === 404 && !noExiste.cuerpo._noEsJson, JSON.stringify(noExiste.cuerpo).slice(0, 80));

const malFormado = await pedir('/api/eco', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{esto no es json',
});
check('un JSON mal formado devuelve 400, no 500', malFormado.status === 400,
  `(${malFormado.status}) ${JSON.stringify(malFormado.cuerpo).slice(0, 70)}`);

const enorme = await pedir('/api/eco', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ relleno: 'x'.repeat(5000) }),
});
check('un cuerpo demasiado grande devuelve 413', enorme.status === 413,
  `(${enorme.status}) ${JSON.stringify(enorme.cuerpo).slice(0, 70)}`);

servidor.close();

/* ── B. El servidor real ──────────────────────────────────────────────────── */
console.log('\n-- B. Servidor real en el puerto 5000 --');

const PUERTO = process.env.PORT || 5000;
const API = `http://127.0.0.1:${PUERTO}/api`;
const { rows } = await pool.query(
  `SELECT u.user_id, u.email, u.program_id, r.role_id FROM public.users u
     JOIN public.user_roles ur ON ur.user_id = u.user_id
     JOIN public.roles r ON r.role_id = ur.role_id
    WHERE LOWER(r.name) LIKE '%administrador general%' LIMIT 1`);
const a = rows[0];
const token = signSessionToken({ id: a.user_id, email: a.email, role: 'administrador general', roleId: a.role_id, programId: a.program_id, permissions: [] });

async function real(ruta, opciones = {}) {
  const res = await fetch(API + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opciones.headers || {}) },
  });
  const texto = await res.text();
  let cuerpo = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { _noEsJson: texto.slice(0, 80) }; }
  return { status: res.status, cuerpo, idCabecera: res.headers.get('x-request-id') };
}

const r404 = await real('/no-existe-esta-ruta');
check('ruta inexistente CON sesion -> 404 en JSON', r404.status === 404 && !r404.cuerpo._noEsJson,
  `(${r404.status}) ${JSON.stringify(r404.cuerpo).slice(0, 80)}`);

const rMal = await real('/chatbook/query', { method: 'POST', body: '{roto' });
check('JSON mal formado -> 400 en JSON', rMal.status === 400,
  `(${rMal.status}) ${JSON.stringify(rMal.cuerpo).slice(0, 70)}`);

const rGrande = await real('/chatbook/query', { method: 'POST', body: JSON.stringify({ message: 'x'.repeat(3 * 1024 * 1024) }) });
check('cuerpo de 3 MB -> 413 (el limite es 2 MB)', rGrande.status === 413,
  `(${rGrande.status}) ${JSON.stringify(rGrande.cuerpo).slice(0, 70)}`);

const rOk = await real('/projects');
check('las rutas que existen siguen funcionando', rOk.status === 200, `(${rOk.status})`);
check('toda respuesta lleva X-Request-Id', Boolean(rOk.idCabecera), `(${rOk.idCabecera})`);

const rDbAdmin = await real('/admin/general/db/tables');
check('las rutas de admin_db_crud NO quedaron tapadas por el 404', rDbAdmin.status === 200,
  `(${rDbAdmin.status}) ${JSON.stringify(rDbAdmin.cuerpo).slice(0, 70)}`);

console.log(`\n=== ${ok} correctas, ${fail} fallidas ===`);
await pool.end();
process.exit(fail ? 1 : 0);
