/**
 * ÍNDICES QUE FALTAN Y SECUENCIAS DESINCRONIZADAS
 * UNIVERSIDAD CESMAG
 *
 *   node backend/scripts/optimize_database.js            → solo informa
 *   node backend/scripts/optimize_database.js --apply    → aplica los cambios
 *
 * Dos arreglos distintos que conviene hacer a la vez porque los dos son de
 * esquema y los dos se pueden ejecutar con la aplicación en marcha:
 *
 * 1. ÍNDICES. Se crean con CREATE INDEX CONCURRENTLY, que no bloquea las
 *    escrituras de la tabla. A cambio, no puede ejecutarse dentro de una
 *    transacción: por eso este script NO usa withTransaction.
 *
 *    El más importante es el del correo. `auth.controller.js` filtra con
 *    LOWER(TRIM(email)), y envolver la columna en funciones inutiliza el índice
 *    normal de `email`: cada inicio de sesión recorre la tabla `users` entera.
 *    Un índice sobre la EXPRESIÓN es el que el planificador sí puede usar.
 *
 * 2. SECUENCIAS. `roles`, `permissions` y `programs` tienen su secuencia, pero
 *    los datos se cargaron con identificadores explícitos sin avanzarla, así
 *    que la secuencia quedó por detrás del máximo de la tabla y un INSERT
 *    normal chocaría con una clave ya usada. Ese es el motivo real de que los
 *    controladores calcularan el identificador con MAX(id)+1, que es una
 *    condición de carrera: dos altas simultáneas leen el mismo máximo.
 *    Sincronizar la secuencia elimina la causa y permite dejar que la base de
 *    datos asigne el identificador, que es lo que sabe hacer sin carreras.
 *
 * 3. CLAVES SIN VALOR POR DEFECTO. Tres tablas tienen su secuencia creada pero
 *    la columna no la usa: la migracion las declara SERIAL, pero como usa
 *    CREATE TABLE IF NOT EXISTS y las tablas ya existian (creadas a mano o
 *    importadas), esa declaracion nunca llego a aplicarse. Es la deriva de
 *    esquema que describe la auditoria.
 *
 *    No es teorico: los INSERT de la aplicacion omiten la clave porque dan por
 *    hecho que es SERIAL, asi que **crear una idea en el Banco de Proyectos y
 *    registrar su historial fallaban con error 500**.
 */
import pool from '../config/db.js';

const APLICAR = process.argv.includes('--apply');

/**
 * Índices deducidos de los WHERE, JOIN y ORDER BY más frecuentes del código.
 * Varios de los que proponía la auditoría ya existen —los crea la migración de
 * arranque—, así que aquí solo están los que de verdad faltan.
 */
const INDICES = [
  {
    nombre: 'idx_users_email_normalized',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_normalized ON public.users (LOWER(TRIM(email)))',
    porque: 'el inicio de sesión filtra por LOWER(TRIM(email)) y hoy recorre la tabla entera',
  },
  {
    nombre: 'idx_users_program',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_program ON public.users (program_id)',
    porque: 'filtro por programa en docentes, reportes y analítica',
  },
  {
    nombre: 'idx_students_user',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_user ON public.students (user_id)',
    porque: 'cada consulta de contexto académico busca al estudiante por su usuario',
  },
  {
    nombre: 'idx_project_histories_project',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_histories_project ON public.project_histories (project_id)',
    porque: 'el historial de un proyecto se consulta por project_id',
  },
  {
    nombre: 'idx_research_progress_project',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_research_progress_project ON public.research_progress (project_id)',
    porque: 'los avances de investigación se listan por proyecto',
  },
  {
    nombre: 'idx_research_documents_project',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_research_documents_project ON public.research_documents (project_id)',
    porque: 'los documentos de investigación se listan por proyecto',
  },
  {
    nombre: 'idx_role_permissions_role',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_role_permissions_role ON public.role_permissions (role_id)',
    porque: 'los permisos del rol se leen en cada inicio de sesión',
  },
];

/**
 * Columnas de clave primaria que deberian tomar su valor de una secuencia y no
 * lo hacen. La secuencia ya existe en los tres casos; lo que falta es el enlace.
 */
const CLAVES_SIN_DEFECTO = [
  { tabla: 'public.project_bank', pk: 'project_bank_id', secuencia: 'public.project_bank_project_bank_id_seq' },
  { tabla: 'public.project_bank_histories', pk: 'project_bank_history_id', secuencia: 'public.project_bank_histories_project_bank_history_id_seq' },
  { tabla: 'public.degree_options', pk: 'degree_option_id', secuencia: 'public.degree_options_degree_option_id_seq' },
];

const SECUENCIAS = [
  { tabla: 'public.roles', pk: 'role_id' },
  { tabla: 'public.permissions', pk: 'permission_id' },
  { tabla: 'public.programs', pk: 'program_id' },
];

async function tablaExiste(nombre) {
  const { rows } = await pool.query('SELECT to_regclass($1) AS existe', [nombre]);
  return rows[0].existe !== null;
}

async function indiceExiste(nombre) {
  const { rows } = await pool.query(
    'SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2',
    ['public', nombre],
  );
  return rows.length > 0;
}

async function claveTieneDefecto({ tabla, pk }) {
  const [esquema, nombre] = tabla.split('.');
  const { rows } = await pool.query(
    `SELECT column_default FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [esquema, nombre, pk],
  );
  if (rows.length === 0) return null;          // la tabla no existe aqui
  return rows[0].column_default !== null;
}

async function revisarSecuencia({ tabla, pk }) {
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(${pk}), 0)::bigint AS maximo,
            pg_get_serial_sequence($1, $2) AS secuencia
       FROM ${tabla}`,
    [tabla, pk],
  );
  const { maximo, secuencia } = rows[0];
  if (!secuencia) return { tabla, secuencia: null, maximo: Number(maximo), proximo: null, sincronizada: true };

  const { rows: estado } = await pool.query(`SELECT last_value, is_called FROM ${secuencia}`);
  const proximo = estado[0].is_called ? Number(estado[0].last_value) + 1 : Number(estado[0].last_value);
  return {
    tabla,
    secuencia,
    maximo: Number(maximo),
    proximo,
    sincronizada: proximo > Number(maximo),
  };
}

async function main() {
  console.log('=== ÍNDICES ===\n');

  const pendientes = [];
  for (const indice of INDICES) {
    const tabla = indice.sql.match(/ON (public\.\w+)/)[1];
    if (!(await tablaExiste(tabla))) {
      console.log(`  (omitido) ${indice.nombre}: la tabla ${tabla} no existe en esta base de datos`);
      continue;
    }
    if (await indiceExiste(indice.nombre)) {
      console.log(`  ya existe  ${indice.nombre}`);
      continue;
    }
    console.log(`  FALTA      ${indice.nombre} — ${indice.porque}`);
    pendientes.push(indice);
  }

  console.log('\n=== CLAVES SIN VALOR POR DEFECTO ===\n');
  const clavesRotas = [];
  for (const objetivo of CLAVES_SIN_DEFECTO) {
    const tiene = await claveTieneDefecto(objetivo);
    if (tiene === null) {
      console.log(`  (omitido) ${objetivo.tabla} no existe en esta base de datos`);
    } else if (tiene) {
      console.log(`  correcta   ${objetivo.tabla}.${objetivo.pk}`);
    } else {
      console.log(`  ROTA       ${objetivo.tabla}.${objetivo.pk}: sin DEFAULT, los INSERT de la aplicacion fallan`);
      clavesRotas.push(objetivo);
    }
  }

  console.log('\n=== SECUENCIAS ===\n');
  const desincronizadas = [];
  for (const objetivo of SECUENCIAS) {
    const estado = await revisarSecuencia(objetivo);
    if (estado.sincronizada) {
      console.log(`  correcta   ${estado.tabla} (máximo ${estado.maximo}, siguiente ${estado.proximo})`);
    } else {
      console.log(`  DESFASADA  ${estado.tabla}: máximo ${estado.maximo} pero la secuencia daría ${estado.proximo} — el próximo INSERT chocaría`);
      desincronizadas.push(estado);
    }
  }

  if (!APLICAR) {
    console.log(`\nSimulación: no se ha cambiado nada.`);
    console.log(`Pendientes: ${pendientes.length} índice(s), ${clavesRotas.length} clave(s) sin defecto, ${desincronizadas.length} secuencia(s).`);
    console.log('Para aplicarlo:\n  node backend/scripts/optimize_database.js --apply');
    return;
  }

  console.log('\n=== APLICANDO ===\n');

  for (const indice of pendientes) {
    const inicio = Date.now();
    try {
      await pool.query(indice.sql);
      console.log(`  creado     ${indice.nombre}  (${Date.now() - inicio} ms)`);
    } catch (err) {
      console.error(`  ERROR      ${indice.nombre}: ${err.message}`);
    }
  }

  for (const objetivo of clavesRotas) {
    try {
      // La secuencia queda ademas "propiedad" de la columna, para que se borre
      // con ella y para que pg_get_serial_sequence la reconozca.
      await pool.query(`ALTER SEQUENCE ${objetivo.secuencia} OWNED BY ${objetivo.tabla}.${objetivo.pk}`);
      await pool.query(`ALTER TABLE ${objetivo.tabla} ALTER COLUMN ${objetivo.pk} SET DEFAULT nextval('${objetivo.secuencia}')`);

      // Y se coloca la secuencia por encima de lo que ya hay en la tabla.
      const { rows } = await pool.query(`SELECT COALESCE(MAX(${objetivo.pk}), 0)::bigint AS maximo FROM ${objetivo.tabla}`);
      await pool.query('SELECT setval($1, $2, true)', [objetivo.secuencia, Math.max(Number(rows[0].maximo), 1)]);

      console.log(`  reparada   ${objetivo.tabla}.${objetivo.pk} -> nextval(${objetivo.secuencia})`);
    } catch (err) {
      console.error(`  ERROR      ${objetivo.tabla}: ${err.message}`);
    }
  }

  for (const estado of desincronizadas) {
    try {
      // setval con is_called = true deja la secuencia en el máximo actual, de
      // modo que el siguiente nextval devuelve máximo + 1.
      await pool.query('SELECT setval($1, $2, true)', [estado.secuencia, estado.maximo]);
      console.log(`  ajustada   ${estado.tabla} -> el siguiente identificador será ${estado.maximo + 1}`);
    } catch (err) {
      console.error(`  ERROR      ${estado.tabla}: ${err.message}`);
    }
  }

  console.log('\n=== VERIFICACIÓN ===\n');
  const { rows: plan } = await pool.query(
    `EXPLAIN (ANALYZE) SELECT user_id FROM public.users WHERE LOWER(TRIM(email)) = LOWER(TRIM('comprobacion@test.local'))`,
  );
  console.log('  Plan de la consulta de inicio de sesión:');
  plan.forEach((p) => console.log('    ' + p['QUERY PLAN']));

  for (const objetivo of SECUENCIAS) {
    const estado = await revisarSecuencia(objetivo);
    console.log(`  ${estado.tabla}: ${estado.sincronizada ? 'secuencia correcta' : 'SIGUE DESFASADA'}`);
  }

  for (const objetivo of CLAVES_SIN_DEFECTO) {
    const tiene = await claveTieneDefecto(objetivo);
    if (tiene !== null) {
      console.log(`  ${objetivo.tabla}.${objetivo.pk}: ${tiene ? 'con valor por defecto' : 'SIGUE SIN DEFECTO'}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('Error al optimizar la base de datos:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
