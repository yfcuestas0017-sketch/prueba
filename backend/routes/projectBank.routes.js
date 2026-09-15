import { Router } from 'express';
import {
  getProjectBank,
  getProjectBankDetail,
  getProjectBankHistory,
  createProjectBankIdea,
  updateProjectBankIdea,
  toggleProjectBankStatus,
  selectProjectBankIdea,
  getStudentAssignedProject
} from '../controllers/projectBank.controller.js';

const router = Router();

router.get('/project-bank', getProjectBank);
router.get('/project-bank/student/:studentId', getStudentAssignedProject);
router.get('/project-bank/:id', getProjectBankDetail);
router.get('/project-bank/:id/history', getProjectBankHistory);

router.post('/project-bank', createProjectBankIdea);
router.put('/project-bank/:id', updateProjectBankIdea);
router.patch('/project-bank/:id/status', toggleProjectBankStatus);
router.post('/project-bank/:id/select', selectProjectBankIdea);

export default router;
