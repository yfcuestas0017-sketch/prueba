import pool from '../config/db.js';

export const getCatalogs = async (req, res) => {
  const { program_id, programId } = req.query;
  const targetProgramId = (program_id || programId) ? parseInt(program_id || programId, 10) : null;
  try {
    const lineQuery = targetProgramId
      ? { text: 'SELECT research_line_id, name, description, program_id FROM public.research_lines WHERE program_id = $1 ORDER BY name', values: [targetProgramId] }
      : { text: 'SELECT research_line_id, name, description, program_id FROM public.research_lines ORDER BY name' };

    const sublineQuery = targetProgramId
      ? { text: `SELECT rsl.research_subline_id, rsl.name, rsl.description, rsl.research_line_id
                 FROM public.research_sublines rsl
                 JOIN public.research_lines rl ON rl.research_line_id = rsl.research_line_id
                 WHERE rl.program_id = $1
                 ORDER BY rsl.name`, values: [targetProgramId] }
      : { text: 'SELECT research_subline_id, name, description, research_line_id FROM public.research_sublines ORDER BY name' };

    const [statuses, modalities, lines, sublines, programs, faculties, semesters, curricula, roles, permissions, degreeOptions] = await Promise.all([
      pool.query('SELECT status_id, name, description FROM public.statuses ORDER BY name'),
      pool.query('SELECT modality_id, name, description FROM public.modalities ORDER BY name'),
      pool.query(lineQuery),
      pool.query(sublineQuery),
      pool.query('SELECT program_id, name, faculty_id FROM public.programs ORDER BY name'),
      pool.query('SELECT faculty_id, name FROM public.faculties ORDER BY name'),
      pool.query('SELECT semester_id, semester_number FROM public.semesters ORDER BY semester_number'),
      pool.query('SELECT curriculum_id, program_id, version FROM public.academic_curricula ORDER BY version'),
      pool.query('SELECT role_id, name, description FROM public.roles ORDER BY role_id'),
      pool.query('SELECT permission_id, name, description FROM public.permissions ORDER BY permission_id'),
      pool.query('SELECT degree_option_id, name, description FROM public.degree_options ORDER BY degree_option_id'),
    ]);

    res.json({
      statuses: statuses.rows,
      modalities: modalities.rows,
      lines: lines.rows,
      sublines: sublines.rows,
      programs: programs.rows,
      faculties: faculties.rows,
      semesters: semesters.rows,
      curricula: curricula.rows,
      roles: roles.rows,
      permissions: permissions.rows,
      degreeOptions: degreeOptions.rows,
    });
  } catch (err) {
    console.error('Catalogs error:', err);
    res.status(500).json({ error: 'Error al cargar catálogos.' });
  }
};

export const getDegreeOptions = async (req, res) => {
  try {
    const result = await pool.query('SELECT degree_option_id, name, description FROM public.degree_options ORDER BY degree_option_id');
    res.json(result.rows);
  } catch (err) {
    console.error('Degree options error:', err);
    res.status(500).json({ error: 'Error al cargar opciones de grado.' });
  }
};
