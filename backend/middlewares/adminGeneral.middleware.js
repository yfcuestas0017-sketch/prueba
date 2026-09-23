export async function assertAdminGeneral(client, userId) {
  if (!userId) return false;
  const result = await client.query(
    `SELECT 1 FROM public.users u
     LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
     LEFT JOIN public.roles r ON r.role_id = ur.role_id
     WHERE (u.user_id::text = $1 OR LOWER(u.email) = LOWER($1))
       AND (LOWER(r.name) LIKE '%administrador general%' OR LOWER(r.name) LIKE '%admin general%')
     LIMIT 1`,
    [String(userId)],
  );
  return result.rows.length > 0;
}
