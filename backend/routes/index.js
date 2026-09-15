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

const router = Router();

// Endpoint de salud
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor Backend BaseDatosGrado ejecutándose correctamente.' });
});

router.use(authRoutes);
router.use(catalogsRoutes);
router.use(usersRoutes);
router.use(teachersRoutes);
router.use(projectsRoutes);
router.use(projectBankRoutes);
router.use(reportsRoutes);
router.use(analyticsRoutes);
router.use(chatbookRoutes);
router.use('/admin/general', adminGeneralRoutes);

export default router;
