import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import apiRouter from './routes/index.js';
import { setupProjectBankTable } from './migrations/create_project_bank.js';
import { setupProjectBankHistoriesTable } from './migrations/create_project_bank_histories.js';
import { registerAdminDbCrudRoutes } from './admin_db_crud.js';
import { pool } from './config/db.js';
import { getJwtSecret } from './utils/token.js';
import { asignarIdPeticion, rutaNoEncontrada, manejadorDeErrores } from './middlewares/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ─── Cabeceras de seguridad ───────────────────────────────────────────────
 * helmet fija X-Frame-Options, Content-Security-Policy, HSTS y compañía. Sin
 * esto, la aplicación se puede incrustar en un iframe ajeno y usarse para
 * clickjacking. `crossOriginResourcePolicy` se relaja porque el frontend se
 * sirve desde otro origen en desarrollo.
 */
/* Cada peticion recibe un identificador corto antes que nada, para que
   cualquier error posterior pueda citarlo. */
app.use(asignarIdPeticion);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

/* ─── CORS restringido ─────────────────────────────────────────────────────
 * Antes era `cors()` sin argumentos: cualquier página de internet podía llamar
 * a esta API. Ahora solo responde a los orígenes declarados en FRONTEND_URL
 * (admite varios separados por coma). Las peticiones sin origen —curl, los
 * scripts de prueba, el propio servidor— se siguen permitiendo.
 */
const origenesPermitidos = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || origenesPermitidos.includes(origin)) return callback(null, true);
    return callback(new Error(`Origen no autorizado por CORS: ${origin}`));
  },
  credentials: true,
}));

/* El límite anterior era de 50 MB, suficiente para agotar la memoria del
 * proceso con unas pocas peticiones. 2 MB sobra para cualquier formulario de
 * esta aplicación, que no sube archivos por el cuerpo JSON. */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ─── Freno a la fuerza bruta en el inicio de sesión ───────────────────────
 * Sin esto, probar contraseñas contra /api/auth/login no tiene ningún coste.
 * El límite es por IP y solo cuenta los intentos fallidos, para no castigar a
 * quien entra bien varias veces desde la misma red de la universidad.
 */
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.' },
});
app.use('/api/auth/login', limiteLogin);
app.use('/api/auth/register', rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados registros desde esta conexión. Inténtalo más tarde.' },
}));

// Registrar todas las rutas de la API bajo /api (una sola vez)
app.use('/api', apiRouter);

// Inicializar tablas, migraciones y rutas de administración de BD.
// Se ejecuta y se espera ANTES de levantar el servidor, para evitar
// que lleguen peticiones antes de que todo esté listo.
/**
 * Verifica que el entorno esté completo ANTES de escuchar peticiones.
 *
 * Arrancar sin JWT_SECRET dejaría un servidor que acepta conexiones y falla en
 * cada inicio de sesión; es preferible no arrancar y decir por qué.
 */
function verificarConfiguracion() {
  getJwtSecret();
  if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
    throw new Error(
      'Falta la configuración de base de datos. Define DATABASE_URL (Neon, producción) ' +
      'o PGPASSWORD (.env.local, desarrollo).',
    );
  }
}

async function initMigrations() {
  await setupProjectBankTable();
  await setupProjectBankHistoriesTable();
  await registerAdminDbCrudRoutes(app, pool);
  await pool.query('SELECT 1'); // Verificar la conexión a la base de datos
  console.log('[Backend BaseDatosGrado] Migraciones e índices verificados.');
}

/**
 * Registra el 404 y el manejador de errores.
 *
 * El ORDEN importa y es la razon de que esto no esté junto al resto de
 * `app.use` de arriba: Express prueba las rutas en el orden en que se
 * registraron, y `registerAdminDbCrudRoutes` monta las suyas durante el
 * arranque, después del router principal. Si el 404 se registrara antes,
 * atraparía esas rutas y la gestión de base de datos dejaría de existir.
 */
function registrarManejadoresFinales() {
  app.use('/api', rutaNoEncontrada);
  app.use(manejadorDeErrores);
}

async function startServer() {
  try {
    verificarConfiguracion();
  } catch (err) {
    console.error('[Backend BaseDatosGrado] Configuración incompleta:', err.message);
    process.exit(1);
  }

  try {
    await initMigrations();
  } catch (err) {
    console.error('[Backend BaseDatosGrado] Error al ejecutar migraciones:', err);
    // Decide aquí si quieres detener el arranque en caso de error crítico:
    // process.exit(1);
  }

  // Se registran aqui, ya montadas todas las rutas reales.
  registrarManejadoresFinales();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Express Backend] Servidor ejecutándose en http://localhost:${PORT} y http://127.0.0.1:${PORT}`);
    console.log('[PostgreSQL DB] Conectado a la base de datos BaseDatosGrado');
  });
}

startServer();

export default app;