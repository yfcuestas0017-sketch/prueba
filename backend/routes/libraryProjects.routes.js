import { Router } from 'express';
import {
  getLibraryProjects,
  recommendLibraryProjects,
  getLibraryProjectById,
  createLibraryProject,
  updateLibraryProject,
  deleteLibraryProject,
  importLibraryProjectFromLink,
  syncLibraryProjects,
} from '../controllers/libraryProjects.controller.js';
import { requireAuth, requireAdminGeneral } from '../middlewares/auth.middleware.js';

const router = Router();

// Consultas para cualquier usuario autenticado (con alcance controlado según rol)
router.use(requireAuth);

router.get('/library-projects', getLibraryProjects);
router.post('/library-projects/recommend', recommendLibraryProjects);
router.get('/library-projects/:id', getLibraryProjectById);

// Operaciones de gestión exclusivas para Administradores Generales
router.post('/library-projects', requireAdminGeneral, createLibraryProject);
router.post('/library-projects/import-link', requireAdminGeneral, importLibraryProjectFromLink);
router.post('/library-projects/sync', requireAdminGeneral, syncLibraryProjects);
router.put('/library-projects/:id', requireAdminGeneral, updateLibraryProject);
router.delete('/library-projects/:id', requireAdminGeneral, deleteLibraryProject);

export default router;
