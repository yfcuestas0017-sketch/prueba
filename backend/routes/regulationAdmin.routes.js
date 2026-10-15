import { Router } from 'express';
import {
  getRegulationArticles,
  getRegulationArticle,
  updateRegulationArticle,
  createRegulationArticle,
  resetRegulationDefaults,
  testRegulationSearch,
  uploadRegulationFile,
} from '../controllers/regulationAdmin.controller.js';
import { requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

// Middleware exclusivo para administradores aplicado puntualmente a las rutas del reglamento
const adminOnly = requireRole('admin', 'administrador');

router.get('/regulation', adminOnly, getRegulationArticles);
router.get('/regulation/:articleNumber', adminOnly, getRegulationArticle);
router.put('/regulation/:articleNumber', adminOnly, updateRegulationArticle);
router.post('/regulation', adminOnly, createRegulationArticle);
router.post('/regulation/reset-defaults', adminOnly, resetRegulationDefaults);
router.post('/regulation/test-search', adminOnly, testRegulationSearch);
router.post('/regulation/upload', adminOnly, uploadRegulationFile);

export default router;
