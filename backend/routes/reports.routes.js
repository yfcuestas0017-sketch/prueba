import { Router } from 'express';
import { getDetailedReportProjects, getProjectReportDetail } from '../controllers/reports.controller.js';

const router = Router();

router.get('/reports/detailed', getDetailedReportProjects);
router.get('/reports/projects/:id', getProjectReportDetail);

export default router;
