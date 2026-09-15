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

// Si existe DATABASE_URL (como la que entrega Neon), se usa esa cadena de
// conexión completa y se activa SSL, requerido por Neon. Si no existe,
// se cae en las variables PG* individuales para desarrollo local con
// PostgreSQL/pgAdmin, sin SSL.
const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'ferney',
      database: process.env.PGDATABASE || 'BaseDatosGrado',
      port: parseInt(process.env.PGPORT || '5432', 10),
    });

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]', err);
});

export default pool;
