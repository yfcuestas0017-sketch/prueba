import pool from '../config/db.js';

export const getDetailedReportProjects = async (req, res) => {
  const {
    programId,
    statusId,
    modalityId,
    lineId,
    semesterNumber,
    academicPeriod,
    advisorId,
    startDate,
    endDate,
    search,
  } = req.query;

  const parsedProgramId = programId ? parseInt(programId, 10) : null;
  const parsedStatusId = statusId && statusId !== 'all' ? parseInt(statusId, 10) : null;
  const parsedModalityId = modalityId && modalityId !== 'all' ? parseInt(modalityId, 10) : null;
  const parsedLineId = lineId && lineId !== 'all' ? parseInt(lineId, 10) : null;
  const parsedSemesterNumber = semesterNumber && semesterNumber !== 'all' ? parseInt(semesterNumber, 10) : null;

  try {
    const projectsQuery = `
      SELECT 
        p.project_id,
        p.title,
        p.code,
        p.created_at,
        p.finished_at,
        p.letter_link,
        p.status_id,
        p.modality_id,
        p.research_line_id,
        p.research_subline_id,
        s.name as status_name,
        m.name as modality_name,
        rl.name as line_name,
        rsl.name as subline_name
      FROM public.projects p
      LEFT JOIN public.statuses s ON p.status_id = s.status_id
      LEFT JOIN public.modalities m ON p.modality_id = m.modality_id
      LEFT JOIN public.research_lines rl ON p.research_line_id = rl.research_line_id
      LEFT JOIN public.research_sublines rsl ON p.research_subline_id = rsl.research_subline_id
      ORDER BY p.created_at DESC;
    `;
    const projectsRes = await pool.query(projectsQuery);

    const userProjectsQuery = `
      SELECT 
        up.user_project_id,
        up.project_id,
        up.user_id,
        COALESCE(up.project_role, 'autor') as project_role,
        u.full_name,
        u.email,
        u.program_id,
        pr.name as program_name,
        f.faculty_id,
        f.name as faculty_name,
        st.semester_id,
        sem.semester_number
      FROM public.user_projects up
      JOIN public.users u ON up.user_id = u.user_id
      LEFT JOIN public.programs pr ON u.program_id = pr.program_id
      LEFT JOIN public.faculties f ON pr.faculty_id = f.faculty_id
      LEFT JOIN public.students st ON st.user_id::text = u.user_id::text
      LEFT JOIN public.semesters sem ON sem.semester_id = st.semester_id;
    `;
    const userProjectsRes = await pool.query(userProjectsQuery);

    const userProjectsByProject = {};
    userProjectsRes.rows.forEach(up => {
      if (!userProjectsByProject[up.project_id]) {
        userProjectsByProject[up.project_id] = [];
      }
      userProjectsByProject[up.project_id].push({
        ...up,
        user_id: String(up.user_id),
      });
    });

    const [progressCountsRes, documentCountsRes, historyCountsRes] = await Promise.all([
      pool.query(`SELECT project_id, COUNT(*)::int as count FROM public.research_progress GROUP BY project_id`),
      pool.query(`SELECT project_id, COUNT(*)::int as count FROM public.research_documents GROUP BY project_id`),
      pool.query(`SELECT project_id, COUNT(*)::int as count FROM public.project_histories GROUP BY project_id`),
    ]);

    const progressMap = Object.fromEntries(progressCountsRes.rows.map(r => [r.project_id, r.count]));
    const documentMap = Object.fromEntries(documentCountsRes.rows.map(r => [r.project_id, r.count]));
    const historyMap = Object.fromEntries(historyCountsRes.rows.map(r => [r.project_id, r.count]));

    let detailedProjects = projectsRes.rows.map(p => {
      const participants = userProjectsByProject[p.project_id] || [];
      const authors = participants.filter(up => up.project_role === 'autor' || up.project_role === 'coautor');
      const advisors = participants.filter(up => up.project_role === 'asesor');
      const jurors = participants.filter(up => up.project_role === 'jurado');

      const primaryAuthor = authors[0] || participants[0];
      const authorSemesterNumber = primaryAuthor?.semester_number || null;
      const authorSemesterId = primaryAuthor?.semester_id || null;
      const programName = primaryAuthor?.program_name || 'Sin programa';
      const facultyName = primaryAuthor?.faculty_name || 'Sin facultad';
      const projectProgramId = primaryAuthor?.program_id || null;

      const createdDate = p.created_at ? new Date(p.created_at) : null;
      const year = createdDate ? createdDate.getFullYear() : null;
      const month = createdDate ? createdDate.getMonth() + 1 : null;
      const calcAcademicPeriod = year ? `${year}-${month <= 6 ? '1' : '2'}` : 'Sin periodo';

      return {
        id: p.project_id,
        project_id: p.project_id,
        title: p.title,
        code: p.code || `PR-${p.project_id}`,
        created_at: p.created_at,
        finished_at: p.finished_at,
        letterLink: p.letter_link,
        statusId: p.status_id,
        status: p.status_name || 'Sin estado',
        modalityId: p.modality_id,
        modality: p.modality_name || 'Sin modalidad',
        lineId: p.research_line_id,
        line: p.line_name || 'Sin línea',
        sublineId: p.research_subline_id,
        subline: p.subline_name || 'Sin sublínea',
        programId: projectProgramId,
        programName,
        facultyName,
        semesterNumber: authorSemesterNumber,
        semesterId: authorSemesterId,
        academicPeriod: calcAcademicPeriod,
        historyCount: historyMap[p.project_id] || 0,
        progressCount: progressMap[p.project_id] || 0,
        documentsCount: documentMap[p.project_id] || 0,
        authors: authors.map(a => ({
          id: String(a.user_id),
          name: a.full_name,
          email: a.email,
          role: a.project_role,
          program: a.program_name,
          programId: a.program_id,
          semesterNumber: a.semester_number,
        })),
        advisors: advisors.map(a => ({
          id: String(a.user_id),
          name: a.full_name,
          email: a.email,
          program: a.program_name,
          programId: a.program_id,
        })),
        jurors: jurors.map(a => ({
          id: String(a.user_id),
          name: a.full_name,
          email: a.email,
          program: a.program_name,
          programId: a.program_id,
        })),
      };
    });

    if (parsedProgramId) {
      detailedProjects = detailedProjects.filter(p => String(p.programId) === String(parsedProgramId));
    }

    if (parsedStatusId) {
      detailedProjects = detailedProjects.filter(p => p.statusId === parsedStatusId);
    }
    if (parsedModalityId) {
      detailedProjects = detailedProjects.filter(p => p.modalityId === parsedModalityId);
    }
    if (parsedLineId) {
      detailedProjects = detailedProjects.filter(p => p.lineId === parsedLineId);
    }
    if (parsedSemesterNumber) {
      detailedProjects = detailedProjects.filter(p => p.semesterNumber === parsedSemesterNumber);
    }
    if (academicPeriod && academicPeriod !== 'all') {
      detailedProjects = detailedProjects.filter(p => p.academicPeriod === academicPeriod);
    }
    if (advisorId && advisorId !== 'all') {
      detailedProjects = detailedProjects.filter(p => (p.advisors || []).some(a => a.id === String(advisorId)));
    }
    if (startDate) {
      const start = new Date(startDate);
      detailedProjects = detailedProjects.filter(p => p.created_at && new Date(p.created_at) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      detailedProjects = detailedProjects.filter(p => p.created_at && new Date(p.created_at) <= end);
    }
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      detailedProjects = detailedProjects.filter(p =>
        (p.title || '').toLowerCase().includes(term) ||
        (p.code || '').toLowerCase().includes(term) ||
        (p.authors || []).some(a => (a.name || '').toLowerCase().includes(term)) ||
        (p.advisors || []).some(adv => (adv.name || '').toLowerCase().includes(term))
      );
    }

    const byStatus = {};
    const byModality = {};
    const byLine = {};
    const bySemester = {};

    detailedProjects.forEach(p => {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
      byModality[p.modality] = (byModality[p.modality] || 0) + 1;
      byLine[p.line] = (byLine[p.line] || 0) + 1;
      const semKey = p.semesterNumber ? `${p.semesterNumber}° Semestre` : (p.academicPeriod || 'Sin semestre');
      bySemester[semKey] = (bySemester[semKey] || 0) + 1;
    });

    res.json({
      projects: detailedProjects,
      total: detailedProjects.length,
      summary: {
        total: detailedProjects.length,
        byStatus,
        byModality,
        byLine,
        bySemester,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Reports detailed error:', err);
    res.status(500).json({ error: 'Error al generar datos de reporte: ' + err.message });
  }
};

export const getProjectReportDetail = async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'ID de proyecto inválido.' });

  try {
    const projectQuery = `
      SELECT 
        p.project_id,
        p.title,
        p.code,
        p.created_at,
        p.finished_at,
        p.letter_link,
        p.status_id,
        p.modality_id,
        p.research_line_id,
        p.research_subline_id,
        s.name as status_name,
        m.name as modality_name,
        rl.name as line_name,
        rsl.name as subline_name
      FROM public.projects p
      LEFT JOIN public.statuses s ON p.status_id = s.status_id
      LEFT JOIN public.modalities m ON p.modality_id = m.modality_id
      LEFT JOIN public.research_lines rl ON p.research_line_id = rl.research_line_id
      LEFT JOIN public.research_sublines rsl ON p.research_subline_id = rsl.research_subline_id
      WHERE p.project_id = $1
      LIMIT 1;
    `;
    const projRes = await pool.query(projectQuery, [projectId]);

    if (projRes.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    const p = projRes.rows[0];

    const [participantsRes, historyRes, progressRes, documentsRes] = await Promise.all([
      pool.query(`
        SELECT 
          up.user_project_id,
          up.project_id,
          up.user_id,
          COALESCE(up.project_role, 'autor') as project_role,
          u.full_name,
          u.email,
          u.program_id,
          pr.name as program_name,
          f.name as faculty_name,
          st.semester_id,
          sem.semester_number
        FROM public.user_projects up
        JOIN public.users u ON up.user_id = u.user_id
        LEFT JOIN public.programs pr ON u.program_id = pr.program_id
        LEFT JOIN public.faculties f ON pr.faculty_id = f.faculty_id
        LEFT JOIN public.students st ON st.user_id::text = u.user_id::text
        LEFT JOIN public.semesters sem ON sem.semester_id = st.semester_id
        WHERE up.project_id = $1
      `, [projectId]),
      pool.query(`
        SELECT 
          h.history_id, 
          h.description, 
          h.modified_field, 
          h.old_value, 
          h.new_value, 
          h.change_type, 
          h.changed_at,
          h.user_id,
          u.full_name AS user_name,
          u.email AS user_email,
          u.program_id,
          p.name AS program_name,
          COALESCE(r.name, 'Usuario') AS user_role
        FROM public.project_histories ph
        JOIN public.histories h ON ph.history_id = h.history_id
        LEFT JOIN public.users u ON u.user_id::text = h.user_id::text
        LEFT JOIN public.programs p ON p.program_id = u.program_id
        LEFT JOIN public.user_roles ur ON ur.user_id::text = u.user_id::text
        LEFT JOIN public.roles r ON r.role_id = ur.role_id
        WHERE ph.project_id = $1
        ORDER BY h.changed_at DESC;
      `, [projectId]),
      pool.query(`
        SELECT rp.progress_id, rp.description, rp.created_at, u.full_name as author_name
        FROM public.research_progress rp
        JOIN public.users u ON u.user_id = rp.user_id
        WHERE rp.project_id = $1
        ORDER BY rp.created_at DESC;
      `, [projectId]),
      pool.query(`
        SELECT rd.document_id, rd.document_type, rd.file_url, rd.observations, rd.delivered_at, u.full_name as author_name
        FROM public.research_documents rd
        JOIN public.users u ON u.user_id = rd.user_id
        WHERE rd.project_id = $1
        ORDER BY rd.delivered_at DESC;
      `, [projectId]),
    ]);

    const participants = participantsRes.rows.map(up => ({
      ...up,
      user_id: String(up.user_id),
    }));

    const authors = participants.filter(up => up.project_role === 'autor' || up.project_role === 'coautor');
    const advisors = participants.filter(up => up.project_role === 'asesor');
    const jurors = participants.filter(up => up.project_role === 'jurado');

    const primaryAuthor = authors[0] || participants[0];
    const programName = primaryAuthor?.program_name || 'Sin programa';
    const facultyName = primaryAuthor?.faculty_name || 'Sin facultad';
    const authorSemesterNumber = primaryAuthor?.semester_number || null;

    const createdDate = p.created_at ? new Date(p.created_at) : null;
    const year = createdDate ? createdDate.getFullYear() : null;
    const month = createdDate ? createdDate.getMonth() + 1 : null;
    const calcAcademicPeriod = year ? `${year}-${month <= 6 ? '1' : '2'}` : 'Sin periodo';

    res.json({
      id: p.project_id,
      project_id: p.project_id,
      title: p.title,
      code: p.code || `PR-${p.project_id}`,
      created_at: p.created_at,
      finished_at: p.finished_at,
      letterLink: p.letter_link,
      statusId: p.status_id,
      status: p.status_name || 'Sin estado',
      modalityId: p.modality_id,
      modality: p.modality_name || 'Sin modalidad',
      lineId: p.research_line_id,
      line: p.line_name || 'Sin línea',
      sublineId: p.research_subline_id,
      subline: p.subline_name || 'Sin sublínea',
      programId: primaryAuthor?.program_id || null,
      programName,
      facultyName,
      semesterNumber: authorSemesterNumber,
      academicPeriod: calcAcademicPeriod,
      authors: authors.map(a => ({
        id: String(a.user_id),
        name: a.full_name,
        email: a.email,
        role: a.project_role,
        program: a.program_name,
        semesterNumber: a.semester_number,
      })),
      advisors: advisors.map(a => ({
        id: String(a.user_id),
        name: a.full_name,
        email: a.email,
        program: a.program_name,
      })),
      jurors: jurors.map(a => ({
        id: String(a.user_id),
        name: a.full_name,
        email: a.email,
        program: a.program_name,
      })),
      history: historyRes.rows,
      progress: progressRes.rows,
      documents: documentsRes.rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Single project report error:', err);
    res.status(500).json({ error: 'Error al obtener ficha de reporte del proyecto: ' + err.message });
  }
};
