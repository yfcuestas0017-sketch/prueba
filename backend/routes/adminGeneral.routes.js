import { Router } from 'express';
import {
  getUsers,
  createUser,
  updateUser,
  toggleUserStatus,
  assignUserRoles,
  getRoles,
  createRole,
  updateRole,
  toggleRoleStatus,
  getPermissions,
  createPermission,
  updatePermission,
  assignRolePermissions,
  assignUserPermissions,
  getPrograms,
  createProgram,
  updateProgram,
  getAuditHistory
} from '../controllers/adminGeneral.controller.js';

const router = Router();

// Usuarios
router.get('/users', getUsers);
router.post('/users', createUser);
router.put('/users/:userId', updateUser);
router.patch('/users/:userId/status', toggleUserStatus);
router.post('/users/:userId/roles', assignUserRoles);
router.post('/users/:userId/permissions', assignUserPermissions);

// Roles
router.get('/roles', getRoles);
router.post('/roles', createRole);
router.put('/roles/:roleId', updateRole);
router.patch('/roles/:roleId/status', toggleRoleStatus);
router.post('/roles/:roleId/permissions', assignRolePermissions);

// Permisos
router.get('/permissions', getPermissions);
router.post('/permissions', createPermission);
router.put('/permissions/:permissionId', updatePermission);

// Programas Académicos
router.get('/programs', getPrograms);
router.post('/programs', createProgram);
router.put('/programs/:programId', updateProgram);

// Historial de Auditoría
router.get('/audit-history', getAuditHistory);

export default router;
