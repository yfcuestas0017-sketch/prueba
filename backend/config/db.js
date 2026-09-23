import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config();

const { Pool } = pg;

/**
 * Cadena de conexión de producción (Neon).
 *
 * Si DATABASE_URL está definida (como la que entrega Neon en su dashboard,
 * "Pooled connection"), se usa esa cadena completa y se activa SSL, que Neon
 * exige. Si no existe, se cae en las variables PG* individuales, pensadas
 * para desarrollo local con PostgreSQL/pgAdmin.
 */
const connectionString = process.env.DATABASE_URL;

/**
 * La contraseña NO tiene valor por defecto a propósito.
 *
 * Antes era `process.env.PGPASSWORD || '123456'`: el secreto vivía también en
 * el código fuente, de modo que un despliegue con el .env mal cargado intentaba
 * conectarse con una credencial que cualquiera podía leer en el repositorio.
 * Ahora, si falta la variable (y no hay DATABASE_URL de Neon), la aplicación
 * no arranca y dice por qué.
 */
if (!connectionString && !process.env.PGPASSWORD) {
  throw new Error(
    'Falta la configuración de base de datos. Define DATABASE_URL (Neon, producción) ' +
    'o copia .env.example como .env.local y rellena las credenciales de PostgreSQL local.',
  );
}

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: parseInt(process.env.PGPOOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'BaseDatosGrado',
      port: parseInt(process.env.PGPORT || '5432', 10),
      // Un pool sin límites declarados acepta tantas conexiones como peticiones
      // lleguen y acaba agotando las de PostgreSQL. Estos valores son los de la
      // configuración recomendada para una aplicación de este tamaño.
      max: parseInt(process.env.PGPOOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]', err);
});

export default pool;
