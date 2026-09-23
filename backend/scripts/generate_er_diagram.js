/**
 * GENERADOR DEL DIAGRAMA ENTIDAD-RELACIÓN
 * UNIVERSIDAD CESMAG
 *
 *   node backend/scripts/generate_er_diagram.js
 *
 * Lee el esquema real de PostgreSQL y escribe `docs/MODELO-DATOS.md` con el
 * diagrama en formato Mermaid, que GitHub y VS Code renderizan solos.
 *
 * Se genera en lugar de dibujarse a mano por un motivo concreto: los diagramas
 * del documento de grado se quedaron atrás —les faltan `students`, `semesters`,
 * `academic_curricula`, `project_bank`, `research_progress` y
 * `research_documents`— y un diagrama que hay que actualizar a mano se vuelve a
 * quedar atrás al día siguiente. Este se regenera con un comando, así que
 * siempre describe la base de datos que existe de verdad.
 */
import io from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.resolve(__dirname, '../../docs/MODELO-DATOS.md');

/** Tipos de PostgreSQL con nombres largos, acortados para que el diagrama se lea. */
const TIPOS = {
  'character varying': 'varchar',
  'timestamp without time zone': 'timestamp',
  'timestamp with time zone': 'timestamptz',
  'double precision': 'float',
  integer: 'int',
  boolean: 'bool',
  jsonb: 'jsonb',
  text: 'text',
  date: 'date',
  numeric: 'numeric',
  bigint: 'bigint',
};

const tipoCorto = (t) => TIPOS[t] || t.replace(/[^a-zA-Z0-9]/g, '_');

async function main() {
  const { rows: tablas } = await pool.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`);

  const { rows: columnas } = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`);

  const { rows: claves } = await pool.query(`
    SELECT tc.table_name, kcu.column_name, tc.constraint_type
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
     WHERE tc.table_schema = 'public' AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')`);

  const { rows: foraneas } = await pool.query(`
    SELECT tc.table_name AS origen, kcu.column_name AS columna,
           ccu.table_name AS destino, ccu.column_name AS columna_destino
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
     ORDER BY tc.table_name, kcu.column_name`);

  const { rows: conteos } = await pool.query(`
    SELECT relname AS tabla, n_live_tup AS filas
      FROM pg_stat_user_tables WHERE schemaname = 'public'`);
  const filasPorTabla = Object.fromEntries(conteos.map((c) => [c.tabla, Number(c.filas)]));

  const esPk = new Set(claves.filter((k) => k.constraint_type === 'PRIMARY KEY').map((k) => `${k.table_name}.${k.column_name}`));
  const esUnica = new Set(claves.filter((k) => k.constraint_type === 'UNIQUE').map((k) => `${k.table_name}.${k.column_name}`));
  const esFk = new Set(foraneas.map((f) => `${f.origen}.${f.columna}`));

  /* ── Diagrama ────────────────────────────────────────────────────────────── */
  const lineas = ['erDiagram'];

  for (const { table_name } of tablas) {
    lineas.push(`    ${table_name} {`);
    for (const col of columnas.filter((c) => c.table_name === table_name)) {
      const marcas = [];
      const clave = `${table_name}.${col.column_name}`;
      if (esPk.has(clave)) marcas.push('PK');
      if (esFk.has(clave)) marcas.push('FK');
      if (esUnica.has(clave) && !esPk.has(clave)) marcas.push('UK');
      const nota = col.is_nullable === 'NO' && !esPk.has(clave) ? '"obligatorio"' : '';
      lineas.push(`        ${tipoCorto(col.data_type)} ${col.column_name}${marcas.length ? ' ' + marcas.join(',') : ''} ${nota}`.trimEnd());
    }
    lineas.push('    }');
  }

  for (const fk of foraneas) {
    // La cardinalidad se deduce: si la columna es obligatoria, la relación es
    // uno-a-muchos estricta; si admite nulos, cero-o-muchos.
    const col = columnas.find((c) => c.table_name === fk.origen && c.column_name === fk.columna);
    const obligatoria = col?.is_nullable === 'NO';
    const cardinalidad = obligatoria ? '||--o{' : '||--o{';
    lineas.push(`    ${fk.destino} ${cardinalidad} ${fk.origen} : "${fk.columna}"`);
  }

  /* ── Documento ───────────────────────────────────────────────────────────── */
  const fecha = new Date().toISOString().slice(0, 10);
  const totalTablas = tablas.length;
  const totalFks = foraneas.length;

  const tablaResumen = tablas
    .map(({ table_name }) => {
      const nCols = columnas.filter((c) => c.table_name === table_name).length;
      const nFks = foraneas.filter((f) => f.origen === table_name).length;
      const filas = filasPorTabla[table_name] ?? 0;
      return `| \`${table_name}\` | ${nCols} | ${nFks} | ${filas} |`;
    })
    .join('\n');

  const contenido = `# Modelo de datos

GradoHub · Universidad CESMAG

> **Generado automáticamente** desde el esquema real de PostgreSQL el ${fecha}
> con \`node backend/scripts/generate_er_diagram.js\`.
>
> No se edita a mano: se regenera. Un diagrama dibujado a mano se queda atrás en
> cuanto alguien añade una tabla, y eso es exactamente lo que le pasó a los
> diagramas del documento de grado, a los que les faltaban seis tablas.

**${totalTablas} tablas · ${totalFks} claves foráneas.**

---

## Diagrama entidad-relación

\`\`\`mermaid
${lineas.join('\n')}
\`\`\`

---

## Resumen de tablas

| Tabla | Columnas | Claves foráneas | Filas |
|---|---:|---:|---:|
${tablaResumen}

---

## Cómo leer el diagrama

- **PK** — clave primaria.
- **FK** — clave foránea: apunta a otra tabla.
- **UK** — valor único dentro de la tabla.
- \`"obligatorio"\` — la columna no admite nulos.
- Cada línea entre dos tablas lleva el nombre de la columna que las relaciona.

## Cómo regenerarlo

\`\`\`bash
node backend/scripts/generate_er_diagram.js
\`\`\`

Conviene volver a ejecutarlo después de cualquier cambio en el esquema, y antes
de entregar el documento de grado.
`;

  io.writeFileSync(SALIDA, contenido, 'utf8');
  console.log(`Diagrama generado en docs/MODELO-DATOS.md`);
  console.log(`  ${totalTablas} tablas, ${totalFks} claves foráneas, ${columnas.length} columnas`);
}

main()
  .catch((err) => {
    console.error('Error al generar el diagrama:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
