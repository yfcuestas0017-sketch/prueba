import { Router } from 'express';
import {
  login,
  forgotPassword,
  validateResetToken,
  resetPassword,
  changePassword,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/validate-reset-token', validateResetToken);
router.post('/reset-password', resetPassword);
router.post('/change-password', requireAuth, changePassword);

router.post('/register', (_req, res) => {
  return res.status(403).json({
    error: 'El auto-registro público está deshabilitado por políticas de seguridad institucional. Los usuarios son gestionados administrativamente.',
  });
});

// Cualquier otra ruta bajo /auth no encontrada debe devolver 404 y no continuar a requireAuth
router.use((_req, res) => {
  return res.status(404).json({ error: 'Ruta de autenticación no encontrada.' });
});

export default router;