import { Router } from 'express';
import {
  login,
  forgotPassword,
  validateResetToken,
  resetPassword,
} from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/validate-reset-token', validateResetToken);
router.post('/reset-password', resetPassword);

router.post('/register', (_req, res) => {
  return res.status(403).json({
    error: 'El auto-registro público está deshabilitado por políticas de seguridad institucional. Los usuarios son gestionados administrativamente.',
  });
});

export default router;
