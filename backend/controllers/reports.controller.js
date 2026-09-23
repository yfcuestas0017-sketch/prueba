import pool from '../config/db.js';
import { sendError } from '../utils/httpError.js';
import {
  findProjectsWithParticipants,
  findProjectActivityCounts,
  findProjectRow,
  findParticipantRowsForProject,
} from '../repositories/projects.repository.js';
import { buildProjectBase, REPORT_DEFAULTS } from '../services/projects.mapper.js';

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
    const [{ projectRows, participantsByProject }, counts] = await Promise.all([
      findProjectsWithParticipants(pool),
      findProjectActivityCounts(pool),
    ]);

    let detailedProjects = projectRows.map((p) => ({
      ...buildProjectBase(p, participantsByProject[p.project_id] || [], REPORT_DEFAULTS),
      historyCount: counts.histories[p.project_id] || 0,
      progressCount: counts.progress[p.project_id] || 0,
      documentsCount: counts.documents[p.project_id] || 0,
    }));

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
    return sendError(res, err, 'Reports detailed error:', 'Error al generar datos de reporte.');
  }
};

export const getProjectReportDetail = async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'ID de proyecto inválido.' });

  try {
    const p = await findProjectRow(pool, projectId);

    if (!p) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }

    const [participants, historyRes, progressRes, documentsRes] = await Promise.all([
      findParticipantRowsForProject(pool, projectId),
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

    res.json({
      ...buildProjectBase(p, participants, REPORT_DEFAULTS),
      history: historyRes.rows,
      progress: progressRes.rows,
      documents: documentsRes.rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return sendError(res, err, 'Single project report error:', 'Error al obtener ficha de reporte del proyecto.');
  }
};
