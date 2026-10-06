/**
 * BATERÍA DE PREGUNTAS DEL CHATBOOK
 * UNIVERSIDAD CESMAG
 *
 * Lanza contra el backend en marcha todas las preguntas que el Chatbook debe
 * saber responder, agrupadas por perfil, y resume cuántas contesta con datos,
 * cuántas caen en la respuesta genérica y cuántas fallan.
 *
 * Uso:
 *   1. Levantar el backend:  npm run backend
 *   2. En otra terminal:     npm run test:chatbook
 *
 * Opciones:
 *   --rol=estudiante|docente|admin   ejecuta solo ese perfil
 *   --verbose                        imprime la respuesta completa, no la primera línea
 *
 * Sustituye a `scratch/test_all_chatbook_questions.js`, que importaba de
 * `../server/db.js` — carpeta renombrada a `backend/` y que ya no existe.
 *
 * Desde que el Chatbook exige sesión, el script firma un token de prueba para
 * cada perfil en lugar de enviar el `userId` en el cuerpo. Puede hacerlo porque
 * se ejecuta en la misma máquina y lee JWT_SECRET del mismo `.env.local` que el
 * servidor; no hay ninguna puerta trasera detrás de esto.
 */

import pool from '../backend/config/db.js';
import { signSessionToken } from '../backend/utils/token.js';

const PUERTO = process.env.PORT || 5000;
const URL_BASE = `http://localhost:${PUERTO}`;

const args = process.argv.slice(2);
const soloRol = (args.find((a) => a.startsWith('--rol=')) || '').split('=')[1] || null;
const verbose = args.includes('--verbose');

/* ── Preguntas ────────────────────────────────────────────────────────────── */

const PREGUNTAS = {
  admin: [
    '¿Qué proyectos están próximos a terminar?',
    '¿Qué proyectos comenzaron recientemente?',
    '¿Cuántos proyectos terminan este mes?',
    '¿Cuáles son las fechas de los proyectos?',
    'Muéstrame proyectos por fecha de finalización.',
    '¿Cuántos proyectos existen por estado?',
    '¿Qué proyectos están en ejecución?',
    '¿Qué proyectos están terminados?',
    '¿Qué proyectos están pendientes?',
    '¿Qué proyectos están disponibles?',
    '¿Cuántos proyectos existen actualmente?',
    'Muéstrame todos los proyectos.',
    '¿Cuántos proyectos existen?',
    'Busca proyectos por línea.',
    'Busca proyectos por estado.',
    'Busca proyectos por modalidad.',
    '¿Qué líneas de investigación existen?',
    '¿Cuántos proyectos tiene cada línea?',
    '¿Qué sublíneas existen?',
    '¿Qué docentes pertenecen a cada línea?',
    '¿Qué proyectos están asociados a cada línea?',
    '¿Qué docentes existen?',
    '¿Qué proyectos tiene asignado cada docente?',
    '¿Qué docentes tienen proyectos asociados?',
  ],
  docente: [
    '¿Cuándo terminan los proyectos que asesoro?',
    '¿Qué proyectos están próximos a terminar?',
    '¿Cuál es la fecha de inicio de este proyecto?',
    '¿Cuál es la fecha de finalización?',
    'Muéstrame las fechas de los proyectos que asesoro.',
    '¿Cuál es el estado de los proyectos que asesoro?',
    '¿Qué proyectos están en ejecución?',
    '¿Qué proyectos están terminados?',
    '¿Qué proyectos están pendientes?',
    '¿Cuántos proyectos tengo en cada estado?',
    '¿Qué proyectos tengo asignados?',
    '¿Qué proyectos asesoro?',
    '¿Qué proyectos existen en esta línea?',
    'Busca proyectos relacionados con esta temática.',
    '¿A qué línea pertenece este proyecto?',
    '¿Qué proyectos existen en mi línea?',
    '¿Qué sublíneas pertenecen a esta línea?',
    '¿Qué docentes pertenecen a esta línea?',
    '¿Qué estudiantes están asociados a mis proyectos?',
  ],
  estudiante: [
    '¿Cuándo inicia mi proyecto?',
    '¿Cuándo termina mi proyecto?',
    '¿Cuánto tiempo dura mi proyecto?',
    '¿Cuánto falta para que termine mi proyecto?',
    '¿Cuáles son las fechas de mis proyectos?',
    '¿Cuál de mis proyectos termina primero?',
    '¿Cuál de mis proyectos está próximo a terminar?',
    '¿Cuál es el estado de mi proyecto?',
    '¿Cuál es el estado de mis proyectos?',
    '¿Qué significa el estado de mi proyecto?',
    '¿Qué proyectos míos están en ejecución?',
    '¿Tengo algún proyecto terminado?',
    '¿Cuáles son mis proyectos?',
    '¿Qué proyectos están disponibles?',
    'Busca proyectos relacionados con mi línea.',
    'Busca proyectos sobre inteligencia artificial.',
    'Muéstrame proyectos similares.',
    '¿Cuál es mi línea de investigación?',
    '¿Cuál es la sublínea de mi proyecto?',
    '¿Qué proyectos existen en mi línea?',
    '¿Qué otras líneas existen?',
    '¿Quién es mi docente asesor?',
    '¿Qué docente está asociado a mi proyecto?',
    '¿Qué docentes pertenecen a mi línea?',
  ],
};

/**
 * Preguntas normativas: se lanzan con los tres perfiles porque el Reglamento
 * es igual para todos. Son las que el fallo P0-2 dejaba en error 500, así que
 * aquí se exige además que la respuesta cite el Acuerdo o un artículo.
 */
const PREGUNTAS_REGLAMENTO = [
  '¿Qué dice el reglamento sobre la sustentación?',
  '¿Qué es la coterminalidad según el reglamento?',
  '¿Cuántos créditos exige el artículo 6?',
  '¿Qué requisitos pide el reglamento para sustentar?',
  '¿Qué dice el Acuerdo 105 sobre las fases del trabajo de grado?',
];

/** Intentos de consulta indebida: el sistema debe rechazarlos, no ejecutarlos. */
const PREGUNTAS_SEGURIDAD = [
  'DROP TABLE projects;',
  'UPDATE users SET password = 123456',
];

/* ── Clasificación de respuestas ──────────────────────────────────────────── */

const RESPUESTAS_GENERICAS = [
  'No encuentro esta información registrada actualmente en el sistema.',
  'No encontré proyectos que coincidan',
  'No encuentro esta información en el reglamento institucional disponible',
];

function clasificar(estado, datos) {
  if (estado !== 200) return 'ERROR';
  const mensaje = String(datos?.message || '');
  if (!mensaje.trim()) return 'VACIA';
  if (RESPUESTAS_GENERICAS.some((g) => mensaje.includes(g))) return 'GENERICA';
  return 'OK';
}

const ICONO = { OK: '[OK]      ', GENERICA: '[GENERICA]', VACIA: '[VACIA]   ', ERROR: '[ERROR]   ' };

/* ── Ejecución ────────────────────────────────────────────────────────────── */

async function preguntar(token, message) {
  const res = await fetch(`${URL_BASE}/api/chatbook/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });
  let datos = null;
  try {
    datos = await res.json();
  } catch {
    datos = null;
  }
  return { estado: res.status, datos };
}

async function buscarUsuario(patronRol) {
  const { rows } = await pool.query(
    `SELECT u.user_id, u.full_name, u.email, u.program_id, r.role_id, r.name as role_name
     FROM public.users u
     JOIN public.user_roles ur ON ur.user_id = u.user_id
     JOIN public.roles r ON r.role_id = ur.role_id
     WHERE LOWER(r.name) LIKE $1
     ORDER BY u.full_name
     LIMIT 1`,
    [patronRol],
  );
  const usuario = rows[0];
  if (!usuario) return null;

  const { rows: permisos } = await pool.query(
    `SELECT p.name FROM public.role_permissions rp
     JOIN public.permissions p ON p.permission_id = rp.permission_id
     WHERE rp.role_id = $1`,
    [usuario.role_id],
  );

  usuario.token = signSessionToken({
    id: usuario.user_id,
    email: usuario.email,
    role: String(usuario.role_name || '').toLowerCase(),
    roleId: usuario.role_id,
    programId: usuario.program_id,
    permissions: permisos.map((r) => r.name),
  });
  return usuario;
}

async function comprobarServidor() {
  try {
    const res = await fetch(`${URL_BASE}/api/health`);
    if (res.ok) return true;
    console.error(`El backend respondió ${res.status} en ${URL_BASE}/api/health`);
    return false;
  } catch {
    console.error(`\nNo hay backend escuchando en ${URL_BASE}.`);
    console.error('Levántalo primero en otra terminal:\n');
    console.error('    npm run backend\n');
    return false;
  }
}

async function main() {
  if (!(await comprobarServidor())) {
    await pool.end();
    process.exit(2);
  }

  const usuarios = {
    admin: await buscarUsuario('%admin%'),
    docente: await buscarUsuario('%docent%'),
    estudiante: await buscarUsuario('%estudiant%'),
  };

  console.log(`\nBackend: ${URL_BASE}`);
  console.log('Usuarios de prueba:');
  for (const [rol, u] of Object.entries(usuarios)) {
    console.log(`  ${rol.padEnd(11)} ${u ? `${u.full_name} (${u.role_name})` : 'NINGUNO EN LA BASE DE DATOS'}`);
  }

  const total = { OK: 0, GENERICA: 0, VACIA: 0, ERROR: 0 };
  const porRol = {};
  const fallos = [];

  for (const [rol, preguntas] of Object.entries(PREGUNTAS)) {
    if (soloRol && soloRol !== rol) continue;
    const usuario = usuarios[rol];
    if (!usuario) {
      console.log(`\n--- ${rol.toUpperCase()}: omitido, no hay ningún usuario con ese rol ---`);
      continue;
    }

    console.log(`\n=== ${rol.toUpperCase()} — ${usuario.full_name} ===`);
    porRol[rol] = { OK: 0, GENERICA: 0, VACIA: 0, ERROR: 0 };

    for (const pregunta of [...preguntas, ...PREGUNTAS_REGLAMENTO, ...PREGUNTAS_SEGURIDAD]) {
      let resultado;
      try {
        const { estado, datos } = await preguntar(usuario.token, pregunta);
        resultado = clasificar(estado, datos);
        const mensaje = String(datos?.message || datos?.error || '');
        const muestra = verbose ? `\n      ${mensaje.split('\n').join('\n      ')}` : mensaje.split('\n')[0].slice(0, 96);
        console.log(`  ${ICONO[resultado]} ${pregunta}\n      -> ${muestra}`);
        if (resultado === 'ERROR' || resultado === 'VACIA') {
          fallos.push({ rol, pregunta, estado, mensaje });
        }
      } catch (err) {
        resultado = 'ERROR';
        console.log(`  ${ICONO.ERROR} ${pregunta}\n      -> excepción: ${err.message}`);
        fallos.push({ rol, pregunta, estado: 0, mensaje: err.message });
      }
      total[resultado]++;
      porRol[rol][resultado]++;
    }
  }

  /* ── Resumen ────────────────────────────────────────────────────────────── */

  console.log('\n' + '='.repeat(72));
  console.log('RESUMEN');
  console.log('='.repeat(72));
  console.log('perfil        preguntas   con datos   genéricas   vacías   errores');
  for (const [rol, c] of Object.entries(porRol)) {
    const n = c.OK + c.GENERICA + c.VACIA + c.ERROR;
    console.log(
      `${rol.padEnd(13)} ${String(n).padStart(9)}   ${String(c.OK).padStart(9)}   ${String(c.GENERICA).padStart(9)}   ${String(c.VACIA).padStart(6)}   ${String(c.ERROR).padStart(7)}`,
    );
  }
  const n = total.OK + total.GENERICA + total.VACIA + total.ERROR;
  console.log('-'.repeat(72));
  console.log(
    `${'TOTAL'.padEnd(13)} ${String(n).padStart(9)}   ${String(total.OK).padStart(9)}   ${String(total.GENERICA).padStart(9)}   ${String(total.VACIA).padStart(6)}   ${String(total.ERROR).padStart(7)}`,
  );

  if (fallos.length > 0) {
    console.log('\nPREGUNTAS QUE FALLARON (error HTTP o respuesta vacía):');
    fallos.forEach((f) => console.log(`  [${f.rol}] "${f.pregunta}" -> ${f.estado} ${f.mensaje.slice(0, 120)}`));
  }

  console.log(
    '\nNota: "genérica" no es necesariamente un fallo — puede que simplemente no haya\n' +
    'datos que respondan esa pregunta en la base. Un número alto de genéricas en una\n' +
    'base con datos sí indica que esas ramas no están reconociendo la pregunta.',
  );

  await pool.end();
  process.exit(total.ERROR > 0 || total.VACIA > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Fallo inesperado:', err);
  await pool.end();
  process.exit(1);
});
