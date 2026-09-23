import { Router } from 'express';
import { getCatalogs, getDegreeOptions } from '../controllers/catalogs.controller.js';

const router = Router();

router.get('/catalogs', getCatalogs);
router.get('/degree-options', getDegreeOptions);

export default router;
