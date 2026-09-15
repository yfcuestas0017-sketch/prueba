import { Router } from 'express';
import {
  checkCoauthor,
  getStudentResearchProcess,
  updateStudentAcademicProfile,
  getAcademicSettings,
  updateSemesterDates,
  applyAcademicPromotion
} from '../controllers/users.controller.js';

const router = Router();

router.get('/users/check-coauthor', checkCoauthor);
router.get('/students/:userId/research-process', getStudentResearchProcess);
router.put('/students/:userId/academic-profile', updateStudentAcademicProfile);

router.get('/admin/academic-settings', getAcademicSettings);
router.put('/admin/semesters/:id/dates', updateSemesterDates);
router.post('/admin/academic-promotion', applyAcademicPromotion);

export default router;
