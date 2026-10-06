/**
 * BATERIA DE AUTENTICACION Y AUTORIZACION
 * UNIVERSIDAD CESMAG
 *
 * Comprueba que la capa de seguridad sigue en pie: que nada se puede hacer sin
 * sesion, que la identidad no se puede falsificar y que los caminos que la
 * auditoria senalaba como vias de entrada estan cerrados.
 *
 * Uso:
 *   1. Levantar el backend:  npm run backend
 *   2. En otra terminal:     npm run test:auth
 *
 * Crea dos usuarios desechables --uno Administrador General y otro Estudiante,
 * con contrasenas aleatorias ya hasheadas-- y los borra en un `finally`. No toca
 * ninguna cuenta real: desde que las contrasenas estan en bcrypt no se puede
 * leer la de nadie, y tampoco deberia poderse.
 *
 * AVISO: el limitador de intentos vive en la memoria del proceso y la ultima
 * comprobacion de esta bateria lo deja agotado. Ejecutarla dos veces seguidas
 * da 429 en todos los inicios de sesion y parece una regresion enorme sin serlo.
 * El script lo detecta y pide reiniciar el backend.
 */
import pool from '../backend/config/db.js';
import { hashPassword } from '../backend/utils/password.js';
import { randomUUID } from 'crypto';

const PUERTO = process.env.PORT || 5000;
const API = `http://127.0.0.1:${PUERTO}/api`;
let ok = 0, fail = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  OK    ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre} ${detalle}`); }
};

async function call(path, { token, ...opts } = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const CLAVE_ADMIN = 'Prueba-Admin-' + randomUUID().slice(0, 8);
const CLAVE_EST = 'Prueba-Est-' + randomUUID().slice(0, 8);
const ID_ADMIN = 'test_' + randomUUID().slice(0, 12);
const ID_EST = 'test_' + randomUUID().slice(0, 12);
const MAIL_ADMIN = `prueba.admin.${ID_ADMIN}@test.local`;
const MAIL_EST = `prueba.est.${ID_EST}@test.local`;

async function crearUsuariosDePrueba() {
  const { rows: rolAdmin } = await pool.query(
    "SELECT role_id FROM public.roles WHERE LOWER(name) LIKE '%administrador general%' LIMIT 1");
  const { rows: rolEst } = await pool.query(
    "SELECT role_id FROM public.roles WHERE LOWER(name) = 'estudiante' LIMIT 1");

  for (const [id, mail, clave, rol] of [
    [ID_ADMIN, MAIL_ADMIN, CLAVE_ADMIN, rolAdmin[0].role_id],
    [ID_EST, MAIL_EST, CLAVE_EST, rolEst[0].role_id],
  ]) {
    await pool.query(
      'INSERT INTO public.users (user_id, full_name, email, password, is_active) VALUES ($1, $2, $3, $4, true)',
      [id, 'Usuario de prueba (auditoría)', mail, await hashPassword(clave)]);
    await pool.query('INSERT INTO public.user_roles (user_id, role_id) VALUES ($1, $2)', [id, rol]);
  }
  console.log(`(creados 2 usuarios de prueba: ${MAIL_ADMIN}, ${MAIL_EST})`);
}

async function borrarUsuariosDePrueba() {
  await pool.query('DELETE FROM public.user_roles WHERE user_id = ANY($1)', [[ID_ADMIN, ID_EST]]);
  await pool.query('DELETE FROM public.users WHERE user_id = ANY($1)', [[ID_ADMIN, ID_EST]]);
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM public.users WHERE email LIKE '%@test.local'");
  console.log(`(usuarios de prueba restantes en la base de datos: ${rows[0].n})`);
}

async function pruebas() {
  console.log('\n-- 1. Salud del servidor');
  const salud = await call('/health');
  check('/health responde 200 y comprueba la base de datos',
    salud.status === 200 && salud.body.database === 'ok', JSON.stringify(salud.body));

  console.log('\n-- 2. Endpoints protegidos sin sesion');
  for (const ruta of ['/projects', '/analytics', '/reports/detailed', '/users/check-coauthor?email=a@b.co', '/degree-options', '/teachers']) {
    const r = await call(ruta);
    check(`GET ${ruta} -> 401 sin token`, r.status === 401, `(devolvio ${r.status})`);
  }
  const borrado = await call('/projects/999999', { method: 'DELETE' });
  check('DELETE /projects/999999 -> 401 sin token', borrado.status === 401, `(devolvio ${borrado.status})`);
  const chatAnon = await call('/chatbook/query', { method: 'POST', body: JSON.stringify({ message: 'hola' }) });
  check('POST /chatbook/query -> 401 sin token', chatAnon.status === 401, `(devolvio ${chatAnon.status})`);

  console.log('\n-- 3. Suplantacion de identidad (auditoria 5.3)');
  const suplantacion = await call('/admin/general/roles/1/permissions', {
    method: 'POST',
    body: JSON.stringify({ adminUserId: 'admgeneral@unicesmag.edu.co', permissionIds: [] }),
  });
  check('POST con adminUserId falsificado y sin token -> 401',
    suplantacion.status === 401, `(devolvio ${suplantacion.status})`);

  console.log('\n-- 4. Catalogo publico recortado');
  const catAnon = await call('/catalogs');
  check('/catalogs sin sesion responde 200', catAnon.status === 200);
  check('/catalogs sin sesion SI trae semestres (necesarios para registrarse)', (catAnon.body.semesters || []).length > 0);
  check('/catalogs sin sesion NO trae roles', (catAnon.body.roles || []).length === 0);
  check('/catalogs sin sesion NO trae permisos', (catAnon.body.permissions || []).length === 0);

  console.log('\n-- 5. Inicio de sesion');
  const malo = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: MAIL_ADMIN, password: 'no-es-la-contrasena' }) });
  check('contrasena incorrecta -> 401', malo.status === 401);
  check('el mensaje no revela si el correo existe', malo.body.error === 'Correo o contraseña incorrectos.', malo.body.error);
  const inexistente = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'noexiste@unicesmag.edu.co', password: 'x' }) });
  check('correo inexistente devuelve el MISMO mensaje', inexistente.body.error === malo.body.error);

  const sesion = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: MAIL_ADMIN, password: CLAVE_ADMIN }) });
  check('inicia sesion con la contrasena correcta (hash bcrypt)', sesion.status === 200, JSON.stringify(sesion.body).slice(0, 140));
  check('el login devuelve un token con tres segmentos', typeof sesion.body.token === 'string' && sesion.body.token.split('.').length === 3);
  check('el login NO devuelve la contrasena', !JSON.stringify(sesion.body).includes(CLAVE_ADMIN));
  const tokenAdmin = sesion.body.token;

  console.log('\n-- 6. La puerta trasera 123456 / 12345678 esta cerrada');
  const p1 = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: MAIL_ADMIN, password: '123456' }) });
  const p2 = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: MAIL_ADMIN, password: '12345678' }) });
  check('123456 no entra', p1.status === 401);
  check('12345678 no entra', p2.status === 401);

  console.log('\n-- 7. Con sesion de administrador');
  const proyectos = await call('/projects', { token: tokenAdmin });
  check('GET /projects -> 200', proyectos.status === 200, `(devolvio ${proyectos.status})`);
  const lista = Array.isArray(proyectos.body) ? proyectos.body : (proyectos.body.projects || []);
  check('GET /projects devuelve datos', lista.length > 0, `(${lista.length} proyectos)`);
  const catAuth = await call('/catalogs', { token: tokenAdmin });
  check('/catalogs con sesion SI trae roles', (catAuth.body.roles || []).length > 0);
  for (const [nombre, ruta] of [
    ['/admin/general/users', '/admin/general/users'],
    ['/analytics', '/analytics'],
    ['/reports/detailed', '/reports/detailed'],
    ['/teachers', '/teachers'],
    ['/degree-options', '/degree-options'],
    ['/project-bank', '/project-bank'],
    ['/admin/general/db/tables', '/admin/general/db/tables'],
  ]) {
    const r = await call(ruta, { token: tokenAdmin });
    check(`GET ${nombre} -> 200`, r.status === 200, `(devolvio ${r.status}) ${JSON.stringify(r.body).slice(0, 90)}`);
  }
  const chat = await call('/chatbook/query', { token: tokenAdmin, method: 'POST', body: JSON.stringify({ message: 'cuantos proyectos hay' }) });
  check('POST /chatbook/query sin userId en el cuerpo -> 200', chat.status === 200,
    `(devolvio ${chat.status}) ${JSON.stringify(chat.body).slice(0, 90)}`);
  check('el Chatbook responde con contenido', String(chat.body.reply || chat.body.message || '').length > 10,
    JSON.stringify(chat.body).slice(0, 120));

  const filasUsuarios = await call('/admin/general/db/users', { token: tokenAdmin });
  const filaEjemplo = (filasUsuarios.body.rows || [])[0];
  check('la tabla de usuarios NO devuelve contrasenas', filaEjemplo ? filaEjemplo.password === '' : false,
    filaEjemplo ? `(password="${String(filaEjemplo.password).slice(0, 12)}")` : '(sin filas)');

  console.log('\n-- 8. Token manipulado');
  const partes = tokenAdmin.split('.');
  const cargaFalsa = Buffer.from(JSON.stringify({ sub: 'usr_falso', role: 'administrador general', iss: 'gradohub' })).toString('base64url');
  const conFalso = await call('/projects', { token: `${partes[0]}.${cargaFalsa}.${partes[2]}` });
  check('token con la carga alterada -> 401', conFalso.status === 401, `(devolvio ${conFalso.status})`);
  const conBasura = await call('/projects', { token: 'esto-no-es-un-token' });
  check('token inventado -> 401', conBasura.status === 401, `(devolvio ${conBasura.status})`);

  console.log('\n-- 9. Escalada de privilegios con sesion de estudiante');
  const ses2 = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: MAIL_EST, password: CLAVE_EST }) });
  check('el estudiante inicia sesion', ses2.status === 200, JSON.stringify(ses2.body).slice(0, 140));
  const tokenEst = ses2.body.token;
  if (tokenEst) {
    const intento = await call('/admin/general/users', { token: tokenEst });
    check('un estudiante NO entra al panel de administracion', intento.status === 403, `(devolvio ${intento.status})`);
    const intento2 = await call('/admin/general/users', {
      token: tokenEst, method: 'POST',
      body: JSON.stringify({ adminUserId: 'admgeneral@unicesmag.edu.co', full_name: 'Intruso', email: 'intruso@test.co' }),
    });
    check('declararse admin en el cuerpo ya no sirve', intento2.status === 403, `(devolvio ${intento2.status})`);
    const intento3 = await call('/admin/general/db/users', { token: tokenEst, headers: { 'x-user-id': 'admgeneral@unicesmag.edu.co' } });
    check('la cabecera x-user-id falsificada ya no sirve', intento3.status === 403, `(devolvio ${intento3.status})`);
    const banco = await call('/project-bank/1/status', {
      token: tokenEst, method: 'PATCH',
      body: JSON.stringify({ status: 'inactivo', userRole: 'administrador' }),
    });
    check('declarar userRole en el cuerpo ya no escala a admin', banco.status === 403, `(devolvio ${banco.status})`);
    const { rows: sigue } = await pool.query("SELECT COUNT(*)::int AS n FROM public.users WHERE email = 'intruso@test.co'");
    check('el usuario que intento crear el intruso NO existe', sigue[0].n === 0);
  }

  console.log('\n-- 10. Freno a la fuerza bruta');
  let bloqueado = false;
  for (let i = 0; i < 14; i++) {
    const r = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: MAIL_ADMIN, password: `intento-${i}` }) });
    if (r.status === 429) { bloqueado = true; console.log(`  (bloqueado tras ${i + 1} intentos fallidos)`); break; }
  }
  check('tras varios intentos fallidos responde 429', bloqueado);
}

// El limitador de fuerza bruta vive en la memoria del proceso y la ultima
// comprobacion de esta misma bateria lo deja agotado. Si se ejecuta dos veces
// en menos de 15 minutos, TODOS los inicios de sesion devuelven 429 y el
// resultado parece una regresion enorme cuando solo es el limitador haciendo
// su trabajo. Mejor detectarlo y decirlo.
const sonda = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'sonda@test.local', password: 'x' }) });
if (sonda.status === 429) {
  console.error('\nEl limitador de intentos esta activo (429).');
  console.error('Reinicia el backend para vaciarlo y vuelve a ejecutar:\n');
  console.error('    npm run backend\n');
  await pool.end();
  process.exit(2);
}

await crearUsuariosDePrueba();
try {
  await pruebas();
} finally {
  await borrarUsuariosDePrueba();
  console.log(`\n=== ${ok} correctas, ${fail} fallidas ===`);
  await pool.end();
}
process.exit(fail ? 1 : 0);
