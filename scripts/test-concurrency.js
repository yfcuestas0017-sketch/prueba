/**
 * PRUEBAS DE CONCURRENCIA
 * UNIVERSIDAD CESMAG
 *
 * Comprueba que las tres condiciones de carrera corregidas siguen cerradas.
 * No basta con leer el código: hay que lanzar las peticiones **a la vez**, que
 * es la única forma de que una carrera se manifieste.
 *
 * Uso:
 *   1. Levantar el backend:  npm run backend
 *   2. En otra terminal:     npm run test:concurrency
 *
 * Crea usuarios e ideas desechables y los borra en un `finally`, de modo que no
 * deja rastro aunque falle a mitad. Firma los tokens con `signSessionToken`
 * porque corre en la misma máquina y lee el mismo JWT_SECRET que el servidor.
 *
 * Qué demuestra cada bloque:
 *   1 y 2. Que los identificadores ya no se calculan con MAX(id)+1: cinco altas
 *          simultáneas de rol obtienen cinco identificadores distintos. Con el
 *          código anterior, todas leían el mismo máximo y chocaban.
 *   3.     Que un estudiante no puede quedarse con dos ideas a la vez. El
 *          bloqueo consultivo serializa sus peticiones.
 *   4.     Que dos peticiones a la misma idea solo prosperan una vez.
 */
import { randomUUID } from 'crypto';
import pool from '../backend/config/db.js';
import { hashPassword } from '../backend/utils/password.js';
import { signSessionToken } from '../backend/utils/token.js';

const PUERTO = process.env.PORT || 5000;
const API = `http://127.0.0.1:${PUERTO}/api`;
let ok = 0, fail = 0;
const check = (n, cond, det = '') => {
  if (cond) { ok++; console.log(`  OK    ${n}`); } else { fail++; console.log(`  FALLA ${n} ${det}`); }
};

async function call(path, { token, ...opts } = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const ID_ADMIN = 'conc_' + randomUUID().slice(0, 10);
const ID_EST = 'conc_' + randomUUID().slice(0, 10);
const creados = { roles: [], permisos: [], programas: [], ideas: [] };
let tokenAdmin, tokenEst, programaEstudiante;

async function preparar() {
  const { rows: rAdmin } = await pool.query("SELECT role_id FROM public.roles WHERE LOWER(name) LIKE '%administrador general%' LIMIT 1");
  const { rows: rEst } = await pool.query("SELECT role_id FROM public.roles WHERE LOWER(name) = 'estudiante' LIMIT 1");
  const { rows: prog } = await pool.query('SELECT program_id FROM public.programs ORDER BY program_id LIMIT 1');
  programaEstudiante = prog[0].program_id;

  for (const [id, rol, programa] of [[ID_ADMIN, rAdmin[0].role_id, null], [ID_EST, rEst[0].role_id, programaEstudiante]]) {
    await pool.query(
      'INSERT INTO public.users (user_id, full_name, email, password, program_id, is_active) VALUES ($1,$2,$3,$4,$5,true)',
      [id, 'Prueba de concurrencia', `${id}@test.local`, await hashPassword('x'), programa]);
    await pool.query('INSERT INTO public.user_roles (user_id, role_id) VALUES ($1,$2)', [id, rol]);
  }

  tokenAdmin = signSessionToken({ id: ID_ADMIN, email: `${ID_ADMIN}@test.local`, role: 'administrador general', roleId: rAdmin[0].role_id, programId: null, permissions: [] });
  tokenEst = signSessionToken({ id: ID_EST, email: `${ID_EST}@test.local`, role: 'estudiante', roleId: rEst[0].role_id, programId: programaEstudiante, permissions: [] });
  console.log(`(preparados 2 usuarios de prueba; programa ${programaEstudiante})`);
}

async function limpiar() {
  for (const id of creados.ideas) await pool.query('DELETE FROM public.project_bank_histories WHERE project_bank_id = $1', [id]);
  for (const id of creados.ideas) await pool.query('DELETE FROM public.project_bank WHERE project_bank_id = $1', [id]);
  for (const id of creados.roles) {
    await pool.query('DELETE FROM public.role_permissions WHERE role_id = $1', [id]);
    await pool.query('DELETE FROM public.user_roles WHERE role_id = $1', [id]);
    await pool.query('DELETE FROM public.roles WHERE role_id = $1', [id]);
  }
  for (const id of creados.permisos) await pool.query('DELETE FROM public.permissions WHERE permission_id = $1', [id]);
  for (const id of creados.programas) await pool.query('DELETE FROM public.programs WHERE program_id = $1', [id]);
  await pool.query('DELETE FROM public.histories WHERE user_id = ANY($1)', [[ID_ADMIN, ID_EST]]);
  await pool.query('DELETE FROM public.user_roles WHERE user_id = ANY($1)', [[ID_ADMIN, ID_EST]]);
  await pool.query('DELETE FROM public.users WHERE user_id = ANY($1)', [[ID_ADMIN, ID_EST]]);
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM public.users WHERE email LIKE 'conc_%@test.local'");
  console.log(`(usuarios de prueba restantes: ${rows[0].n})`);
}

async function pruebas() {
  console.log('\n-- 1. Altas simultaneas de roles (antes: MAX(role_id)+1) --');
  const sufijo = randomUUID().slice(0, 6);
  const altas = await Promise.all([1, 2, 3, 4, 5].map((i) =>
    call('/admin/general/roles', {
      token: tokenAdmin, method: 'POST',
      body: JSON.stringify({ name: `Rol concurrencia ${sufijo} ${i}`, description: 'prueba', is_active: false }),
    })));
  const exitosas = altas.filter((r) => r.status === 200 && r.body.roleId);
  exitosas.forEach((r) => creados.roles.push(r.body.roleId));
  check('las 5 altas simultaneas tienen exito', exitosas.length === 5,
    `(${exitosas.length}/5) ${JSON.stringify(altas.filter(r => r.status !== 200).map(r => r.body)).slice(0, 140)}`);
  const ids = exitosas.map((r) => r.body.roleId);
  check('los 5 identificadores son distintos', new Set(ids).size === ids.length, `(${ids.join(', ')})`);

  console.log('\n-- 2. Altas simultaneas de permisos --');
  const altasP = await Promise.all([1, 2, 3].map((i) =>
    call('/admin/general/permissions', {
      token: tokenAdmin, method: 'POST',
      body: JSON.stringify({ name: `perm_conc_${sufijo}_${i}`, description: 'prueba', is_active: false }),
    })));
  const okP = altasP.filter((r) => r.status === 200 && r.body.permissionId);
  okP.forEach((r) => creados.permisos.push(r.body.permissionId));
  check('las 3 altas de permisos tienen exito', okP.length === 3, `(${okP.length}/3)`);
  check('identificadores de permiso distintos', new Set(okP.map(r => r.body.permissionId)).size === okP.length);

  console.log('\n-- 3. Un estudiante intenta tomar DOS ideas a la vez (antes: sin bloqueo) --');
  const { rows: linea } = await pool.query('SELECT research_line_id FROM public.research_lines WHERE program_id = $1 LIMIT 1', [programaEstudiante]);
  for (let i = 0; i < 2; i++) {
    const { rows } = await pool.query(
      `INSERT INTO public.project_bank (title, description, general_objective, research_line_id, program_id, status, proposer_id, proposer_role, created_at, updated_at)
       VALUES ($1, 'prueba de concurrencia', 'prueba', $2, $3, 'Disponible', $4, 'Administrador', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING project_bank_id`,
      [`Idea concurrencia ${sufijo} ${i}`, linea[0]?.research_line_id || null, programaEstudiante, ID_ADMIN]);
    creados.ideas.push(rows[0].project_bank_id);
  }
  console.log(`   (creadas las ideas ${creados.ideas.join(' y ')})`);

  const intentos = await Promise.all(creados.ideas.map((idIdea) =>
    call(`/project-bank/${idIdea}/select`, { token: tokenEst, method: 'POST', body: JSON.stringify({}) })));
  intentos.forEach((r, i) => console.log(`   idea ${creados.ideas[i]} -> ${r.status} ${String(r.body.error || r.body.message || '').slice(0, 70)}`));

  const { rows: asignadas } = await pool.query(
    "SELECT project_bank_id FROM public.project_bank WHERE assigned_student_id = $1 AND status = 'Asignado'", [ID_EST]);
  check('el estudiante acaba con UNA sola idea asignada, no dos', asignadas.length === 1,
    `(quedaron ${asignadas.length}: ${asignadas.map(a => a.project_bank_id).join(', ')})`);
  check('exactamente una peticion tuvo exito', intentos.filter(r => r.status === 200).length === 1,
    `(${intentos.filter(r => r.status === 200).length} con exito)`);

  console.log('\n-- 4. Dos estudiantes distintos por la MISMA idea --');
  // Se libera la idea y se intenta desde el mismo estudiante dos veces sobre ella
  const idIdea = creados.ideas[0];
  await pool.query("UPDATE public.project_bank SET status = 'Disponible', assigned_student_id = NULL WHERE project_bank_id = ANY($1)", [creados.ideas]);
  const dobles = await Promise.all([0, 1].map(() =>
    call(`/project-bank/${idIdea}/select`, { token: tokenEst, method: 'POST', body: JSON.stringify({}) })));
  const conExito = dobles.filter((r) => r.status === 200).length;
  check('solo una de las dos peticiones a la misma idea tiene exito', conExito === 1, `(${conExito})`);
}

try {
  const salud = await fetch(`${API}/health`);
  if (!salud.ok) throw new Error(String(salud.status));
} catch {
  console.error(`\nNo hay backend escuchando en ${API}.`);
  console.error('Levántalo primero en otra terminal:\n');
  console.error('    npm run backend\n');
  await pool.end();
  process.exit(2);
}

await preparar();
try {
  await pruebas();
} finally {
  await limpiar();
  console.log(`\n=== ${ok} correctas, ${fail} fallidas ===`);
  await pool.end();
}
process.exit(fail ? 1 : 0);
