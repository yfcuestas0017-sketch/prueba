import pool from '../config/db.js';

export const getAnalytics = async (req, res) => {
  const { adminProgramId, programId } = req.query;
  const targetProgramId = (adminProgramId || programId) ? parseInt(adminProgramId || programId, 10) : null;

  try {
    const [projectsRes, statusesRes, linesRes, sublinesRes, programsRes, facultiesRes, userProjectsRes, studentsRes] = await Promise.all([
      pool.query('SELECT project_id, title, code, created_at, status_id, research_line_id, research_subline_id, modality_id FROM public.projects ORDER BY created_at DESC'),
      pool.query('SELECT status_id, name FROM public.statuses ORDER BY name'),
      pool.query('SELECT research_line_id, name, program_id FROM public.research_lines ORDER BY name'),
      pool.query('SELECT research_subline_id, name, research_line_id FROM public.research_sublines ORDER BY name'),
      pool.query('SELECT program_id, name, faculty_id FROM public.programs ORDER BY name'),
      pool.query('SELECT faculty_id, name FROM public.faculties ORDER BY name'),
      pool.query(`
        SELECT up.user_project_id, up.user_id, up.project_id, COALESCE(up.project_role, 'autor') as project_role,
               u.full_name, u.email, u.program_id, pr.name as program_name
        FROM public.user_projects up
        JOIN public.users u ON up.user_id = u.user_id
        LEFT JOIN public.programs pr ON u.program_id = pr.program_id
      `),
      pool.query(`
        SELECT s.student_id, s.user_id, u.program_id
        FROM public.students s
        JOIN public.users u ON s.user_id::text = u.user_id::text
      `),
    ]);

    let userProjects = userProjectsRes.rows.map(up => ({
      ...up,
      user_id: String(up.user_id),
    }));
    let projects = projectsRes.rows;
    let students = studentsRes.rows.map(s => ({ ...s, user_id: String(s.user_id) }));
    let lines = linesRes.rows;
    let sublines = sublinesRes.rows;

    if (targetProgramId) {
      const authorProjectIds = new Set(
        userProjectsRes.rows
          .filter(up => String(up.program_id) === String(targetProgramId) && (up.project_role === 'autor' || up.project_role === 'coautor' || !up.project_role))
          .map(up => up.project_id)
      );
      projects = projects.filter(p => authorProjectIds.has(p.project_id));
      userProjects = userProjects.filter(up => String(up.program_id) === String(targetProgramId) && authorProjectIds.has(up.project_id));
      students = students.filter(s => String(s.program_id) === String(targetProgramId));
      lines = lines.filter(l => !l.program_id || String(l.program_id) === String(targetProgramId));
      sublines = sublines.filter(sl => lines.some(l => l.research_line_id === sl.research_line_id));
    }

    res.json({
      projects,
      statuses: statusesRes.rows,
      lines,
      sublines,
      programs: targetProgramId ? programsRes.rows.filter(p => String(p.program_id) === String(targetProgramId)) : programsRes.rows,
      faculties: facultiesRes.rows,
      userProjects,
      students,
    });
  } catch (err) {
    console.error('Analytics endpoint error:', err);
    res.status(500).json({ error: 'Error al obtener datos analíticos.' });
  }
};
