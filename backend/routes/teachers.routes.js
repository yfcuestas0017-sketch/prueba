import { Router } from 'express';
import { getTeachers } from '../controllers/teachers.controller.js';

const router = Router();

router.get('/teachers', getTeachers);

export default router;
