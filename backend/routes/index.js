import { Router } from 'express';
import authRoutes from './auth.routes.js';
import catalogsRoutes from './catalogs.routes.js';
import usersRoutes from './users.routes.js';
import teachersRoutes from './teachers.routes.js';
import projectsRoutes from './projects.routes.js';
import projectBankRoutes from './projectBank.routes.js';
import reportsRoutes from './reports.routes.js';
import analyticsRoutes from './analytics.routes.js';
import chatbookRoutes from './chatbook.routes.js';
import adminGeneralRoutes from './adminGeneral.routes.js';
import { requireAuth, requireAdminGeneral } from '../middlewares/auth.middleware.js';
import pool from '../config/db.js';

const router = Router();

/* ─── Rutas públicas ──────────────────────────────────────────────────────
 * Solo tres cosas se pueden hacer sin sesión: comprobar que el servidor está
 * vivo, iniciar sesión y registrarse. El catálogo es un caso intermedio: el
 * formulario de registro necesita la lista de semestres antes de que exista
 * sesión, así que usa `optionalAuth` y el controlador decide qué parte del
 * catálogo entrega a un visitante anónimo.
 */

// Endpoint de salud: comprueba de verdad la base de datos, no solo que el
// proceso de Node responda. Un servidor que contesta "ok" con la base caída
// no sirve para vigilar nada.
router.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'ok', message: 'Servidor Backend BaseDatosGrado ejecutándose correctamente.' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'error', message: 'El servidor responde pero no hay conexión con la base de datos.' });
  }
});

router.use(authRoutes); // auth.routes.js ya declara '/auth/login' y '/auth/register'
router.use(catalogsRoutes);

/* ─── A partir de aquí, todo exige sesión ─────────────────────────────────
 * La protección se aplica en el router y no dentro de cada handler: así un
 * endpoint nuevo queda protegido por omisión y no por acordarse de hacerlo.
 * `requireAuth` además sustituye por la identidad del token cualquier
 * `userId`, `adminUserId`, `userRole` o `x-user-id` que venga en la petición.
 */
router.use(requireAuth);

router.use(usersRoutes);
router.use(teachersRoutes);
router.use(projectsRoutes);
router.use(projectBankRoutes);
router.use(reportsRoutes);
router.use(analyticsRoutes);
router.use(chatbookRoutes);
router.use('/admin/general', requireAdminGeneral, adminGeneralRoutes);

export default router;