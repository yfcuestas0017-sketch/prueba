import pool from '../config/db.js';
import { actorId } from '../middlewares/auth.middleware.js';
import { sendError } from '../utils/httpError.js';

/**
 * Obtener notificaciones del usuario logueado
 */
export async function getNotifications(req, res) {
  try {
    const userId = actorId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Debes iniciar sesión para consultar notificaciones.' });
    }

    const notifRes = await pool.query(`
      SELECT 
        notification_id,
        user_id,
        title,
        message,
        type,
        program_name,
        link,
        is_read,
        created_at
      FROM public.notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 40
    `, [String(userId)]);

    const unreadRes = await pool.query(`
      SELECT COUNT(*)::int as unread_count
      FROM public.notifications
      WHERE user_id = $1 AND is_read = FALSE
    `, [String(userId)]);

    const unreadCount = unreadRes.rows[0]?.unread_count || 0;

    return res.status(200).json({
      success: true,
      data: notifRes.rows,
      unreadCount,
    });
  } catch (err) {
    return sendError(res, err, 'Error al obtener notificaciones:', 'No fue posible cargar las notificaciones.');
  }
}

/**
 * Marcar una notificación individual como leída
 */
export async function markAsRead(req, res) {
  try {
    const userId = actorId(req);
    const notificationId = Number(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: 'Debes iniciar sesión.' });
    }
    if (!Number.isInteger(notificationId)) {
      return res.status(400).json({ error: 'ID de notificación no válido.' });
    }

    await pool.query(`
      UPDATE public.notifications
      SET is_read = TRUE
      WHERE notification_id = $1 AND user_id = $2
    `, [notificationId, String(userId)]);

    return res.status(200).json({ success: true, message: 'Notificación marcada como leída.' });
  } catch (err) {
    return sendError(res, err, 'Error al marcar notificación:', 'No fue posible actualizar la notificación.');
  }
}

/**
 * Marcar todas las notificaciones del usuario como leídas
 */
export async function markAllAsRead(req, res) {
  try {
    const userId = actorId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Debes iniciar sesión.' });
    }

    await pool.query(`
      UPDATE public.notifications
      SET is_read = TRUE
      WHERE user_id = $1 AND is_read = FALSE
    `, [String(userId)]);

    return res.status(200).json({ success: true, message: 'Todas las notificaciones han sido marcadas como leídas.' });
  } catch (err) {
    return sendError(res, err, 'Error al marcar todas las notificaciones:', 'No fue posible actualizar las notificaciones.');
  }
}
