import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import apiRouter from './routes/index.js';
import { setupProjectBankTable } from './migrations/create_project_bank.js';
import { setupProjectBankHistoriesTable } from './migrations/create_project_bank_histories.js';
import { registerAdminDbCrudRoutes } from './admin_db_crud.js';
import { pool } from './config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Registrar todas las rutas de la API bajo /api (una sola vez)
app.use('/api', apiRouter);

// Inicializar tablas, migraciones y rutas de administración de BD.
// Se ejecuta y se espera ANTES de levantar el servidor, para evitar
// que lleguen peticiones antes de que todo esté listo.
async function initMigrations() {
  await setupProjectBankTable();
  await setupProjectBankHistoriesTable();
  await registerAdminDbCrudRoutes(app, pool);
  await pool.query('SELECT 1'); // Verificar la conexión a la base de datos
  console.log('[Backend BaseDatosGrado] Migraciones e índices verificados.');
}

async function startServer() {
  try {
    await initMigrations();
  } catch (err) {
    console.error('[Backend BaseDatosGrado] Error al ejecutar migraciones:', err);
    // Decide aquí si quieres detener el arranque en caso de error crítico:
    // process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Express Backend] Servidor ejecutándose en http://localhost:${PORT} y http://127.0.0.1:${PORT}`);
    console.log('[PostgreSQL DB] Conectado a la base de datos BaseDatosGrado');
  });
}

startServer();

export default app;