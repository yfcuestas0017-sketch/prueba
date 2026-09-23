import { Router } from 'express';
import { getCatalogs, getDegreeOptions } from '../controllers/catalogs.controller.js';
import { requireAuth, optionalAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// `/catalogs` es el único endpoint al que se llega sin sesión: el formulario de
// registro necesita la lista de semestres. Con `optionalAuth` el controlador
// sabe si quien pregunta tiene sesión y recorta el catálogo si no la tiene.
router.get('/catalogs', optionalAuth, getCatalogs);
router.get('/degree-options', requireAuth, getDegreeOptions);

export default router;
