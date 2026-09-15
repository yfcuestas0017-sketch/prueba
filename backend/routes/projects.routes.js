import { Router } from 'express';
import {
  getProjects,
  createProject,
  updateProject,
  updateProjectParticipants,
  deleteProject,
  getProjectHistory,
  getResearchProgress,
  createResearchProgress,
  getResearchDocuments,
  createResearchDocument
} from '../controllers/projects.controller.js';

const router = Router();

router.get('/projects', getProjects);
router.post('/projects', createProject);
router.put('/projects/:id', updateProject);
router.put('/projects/:id/participants', updateProjectParticipants);
router.delete('/projects/:id', deleteProject);
router.get('/projects/:id/history', getProjectHistory);

router.get('/projects/:id/research-progress', getResearchProgress);
router.post('/projects/:id/research-progress', createResearchProgress);
router.get('/projects/:id/research-documents', getResearchDocuments);
router.post('/projects/:id/research-documents', createResearchDocument);

export default router;
