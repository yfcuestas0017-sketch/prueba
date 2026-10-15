import { Router } from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead
} from '../controllers/notifications.controller.js';

const router = Router();

router.get('/notifications', getNotifications);
router.patch('/notifications/:id/read', markAsRead);
router.patch('/notifications/read-all', markAllAsRead);

export default router;
