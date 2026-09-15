export async function logAdminTrace(client, adminUserId, action, field = null, oldValue = null, newValue = null) {
  try {
    const res = await client.query(`
      INSERT INTO public.histories (description, modified_field, old_value, new_value, change_type, user_id, changed_at)
      VALUES ($1, $2, $3, $4, 'ADMIN_ACTION', $5, CURRENT_TIMESTAMP)
      RETURNING history_id;
    `, [action, field, oldValue, newValue, String(adminUserId || 'admgeneral')]);
    return res.rows[0]?.history_id;
  } catch (err) {
    console.error('Error logging admin trace:', err);
    return null;
  }
}
