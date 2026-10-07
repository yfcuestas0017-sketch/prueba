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
 * La contraseña NO tiene valor por defecto a propósito.
 *
 * Antes era `process.env.PGPASSWORD || '123456'`: el secreto vivía también en
 * el código fuente, de modo que un despliegue con el .env mal cargado intentaba
 * conectarse con una credencial que cualquiera podía leer en el repositorio.
 * Ahora, si falta la variable, la aplicación no arranca y dice por qué.
 */
const isProductionOrCloud = Boolean(process.env.DATABASE_URL || process.env.RENDER || process.env.NODE_ENV === 'production');

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: isProductionOrCloud ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.PGPOOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      host: process.env.PGHOST || 'localhost',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'BaseDatosGrado',
      port: parseInt(process.env.PGPORT || '5432', 10),
      ssl: Boolean(process.env.PGSSL === 'true') ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.PGPOOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
  throw new Error(
    'Ni DATABASE_URL ni PGPASSWORD están definidas. Configura las credenciales de PostgreSQL.',
  );
}

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]', err);
});

export default pool;