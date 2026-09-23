import pool from '../config/db.js';
import { getUserContext } from '../services/project_bank_helpers.js';

export const getTeachers = async (req, res) => {
  const { programId } = req.query;
  const requestingUserId = req.query.userId || req.headers['x-user-id'] || null;

  try {
    const userCtx = await getUserContext(pool, requestingUserId);
    
    let targetProgramId = null;
    if (programId && programId !== 'all') {
      targetProgramId = parseInt(programId, 10);
    } else if (!programId && userCtx && userCtx.program_id) {
      targetProgramId = parseInt(userCtx.program_id, 10);
    }

    let query = `
      SELECT DISTINCT
        u.user_id,
        u.full_name,
        u.email,
        u.program_id,
        pr.name as program_name,
        COALESCE(r.name, 'Docente') as role_name
      FROM public.users u
      LEFT JOIN public.user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN public.roles r ON ur.role_id = r.role_id
      LEFT JOIN public.programs pr ON u.program_id = pr.program_id
      WHERE (
        LOWER(COALESCE(r.name, '')) IN ('docente', 'profesor')
        OR u.user_id ILIKE 'doc%'
        OR u.email ILIKE '%docente%'
      )
    `;
    const params = [];
    if (targetProgramId) {
      query += ` AND u.program_id = $1`;
      params.push(targetProgramId);
    }
    query += ` ORDER BY u.full_name ASC;`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get teachers error:', err);
    res.status(500).json({ error: 'Error al consultar docentes: ' + err.message });
  }
};
