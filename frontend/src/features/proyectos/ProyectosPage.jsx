import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  FilePlus2,
  Filter,
  History,
  Pencil,
  User,
  X,
  Award,
  FileCheck,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useProgramFilter } from '../../context/ProgramFilterContext';
import Button from '../../components/ui/Button';
import EditProjectModal from './EditProjectModal';
import CrearProyecto from './CrearProyecto';
import {
  getStudentProjectMessage,
  isFinalProjectStatus,
  isRejectedProjectStatus,
} from './projectStatus';
import api from '../../lib/api';
import { generatePrefix } from './generatePrefix';
import './ProyectosPage.css';

export function ProyectosPage() {
  const { user } = useAuth();
  const { selectedProgram, setSelectedProgram, programs, isAdminGeneral } = useProgramFilter();

  const isStudent = user?.role?.toLowerCase() === 'estudiante';
  const isDocente = user?.role?.toLowerCase() === 'docente';
  const isLimitedUser = isStudent || isDocente;

  const userProgramId = user?.programId ?? null;
  const userProgramName = user?.programName || '';

  const effectiveProgramId = isAdminGeneral ? (selectedProgram === 'all' ? null : selectedProgram) : userProgramId;

  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    modality: 'all',
    year: 'all',
    semester: 'all',
    docenteRole: 'all',
  });
  const [selectedId, setSelectedId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [modalities, setModalities] = useState([]);
  const [lines, setLines] = useState([]);
  const [sublines, setSublines] = useState([]);
  const [degreeOptions, setDegreeOptions] = useState([]);
  const [academicSemesters, setAcademicSemesters] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showCrearModal, setShowCrearModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    code: '',
    statusId: '',
    modalityId: '',
    lineId: '',
    sublineId: '',
    letterLink: '',
    coauthors: [],
  });

  const [adminProgramName, setAdminProgramName] = useState('');
  const [verifyingCoauthor, setVerifyingCoauthor] = useState(false);
  const [newCoauthorEmail, setNewCoauthorEmail] = useState('');
  const [editProjectId, setEditProjectId] = useState(null);

  const [detailModal, setDetailModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewData, setReviewData] = useState({ statusId: '', score: '', observations: '' });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');
  const [studentProcess, setStudentProcess] = useState(null);
  const [studentProcessLoading, setStudentProcessLoading] = useState(false);
  const [studentRecords, setStudentRecords] = useState({ progress: [], documents: [] });
  const [studentAction, setStudentAction] = useState('');
  const [studentActionData, setStudentActionData] = useState({ description: '', fileUrl: '', observations: '' });
  const [studentActionError, setStudentActionError] = useState('');
  const [studentActionSaving, setStudentActionSaving] = useState(false);

  const openEditForm = (project) => {
    setFormData({
      title: project.title || '',
      code: project.code || '',
      statusId: project.statusId || '',
      modalityId: project.modalityId || '',
      lineId: project.lineId || '',
      sublineId: project.sublineId || '',
      letterLink: project.letterLink || '',
      coauthors: project.coauthors || [],
    });
    setEditProjectId(project.id);
    setShowForm(true);
    setFormError('');
    setFormSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditProjectId(null);
    setFormData({
      title: '', code: '', statusId: '', modalityId: '', lineId: '', sublineId: '', letterLink: '', coauthors: [],
    });
    setNewCoauthorEmail('');
  };

  const handleOpenReview = (project) => {
    setReviewModal(project);
    setReviewData({
      statusId: project.statusId || '',
      score: project.latestScore !== null && project.latestScore !== undefined ? String(project.latestScore) : '',
      observations: '',
    });
    setReviewError('');
    setReviewSuccess('');
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!reviewModal) return;

    if (!reviewData.statusId) {
      setReviewError('Debes seleccionar un estado para el proyecto.');
      return;
    }

    if (reviewData.score !== '' && reviewData.score !== null) {
      const num = parseFloat(reviewData.score);
      if (isNaN(num) || num < 0.0 || num > 5.0) {
        setReviewError('La calificación debe estar entre 0.0 y 5.0.');
        return;
      }
    }

    setReviewSaving(true);
    setReviewError('');
    try {
      await api.reviewProject(reviewModal.id, {
        statusId: Number(reviewData.statusId),
        score: reviewData.score !== '' ? parseFloat(reviewData.score) : null,
        observations: reviewData.observations.trim() || null,
      });

      setReviewSuccess('¡Revisión y calificación registradas exitosamente!');
      setTimeout(() => {
        setReviewModal(null);
        loadData();
      }, 1200);
    } catch (err) {
      setReviewError(err.message || 'No fue posible registrar la revisión.');
    } finally {
      setReviewSaving(false);
    }
  };

  const fetchHistory = async (projectId) => {
    if (!projectId) return;

    setHistoryLoading(true);
    try {
      const data = await api.getProjectHistory(projectId, user?.id);
      const mappedHistory = (data ?? []).map((history) => {
        const field = (history.modified_field || '').toLowerCase();
        let title = history.description || 'Actualización registrada';
        if (history.change_type === 'REVISION' || field === 'revision_evaluacion') title = 'Revisión y Calificación Docente';
        else if (field === 'title') title = 'Modificación de Título';
        else if (field === 'status_id') title = 'Actualización de Estado';
        else if (field === 'modality_id') title = 'Actualización de Modalidad';
        else if (field === 'research_line_id') title = 'Actualización de Línea de Investigación';
        else if (field === 'research_subline_id') title = 'Actualización de Sublínea de Investigación';
        else if (field === 'letter_link') title = 'Actualización de Enlace / Carta de Aprobación';
        else if (field === 'code') title = 'Modificación de Código del Proyecto';
        else if (history.description && history.description.includes(': "')) {
          title = history.description.split(': "')[0];
        }

        const date = history.changed_at
          ? new Date(history.changed_at).toLocaleString('es-CO', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Sin fecha';

        return {
          id: history.history_id,
          title,
          description: history.description || '',
          modifiedField: history.modified_field || null,
          oldValue: history.old_value || null,
          newValue: history.new_value || null,
          changeType: history.change_type || 'UPDATE',
          userName: history.user_name || 'Sistema / Registro',
          userEmail: history.user_email || '',
          userRole: history.user_role || 'Usuario',
          userProgram: history.program_name || history.user_program || '',
          date,
        };
      });
      setHistoryItems(mappedHistory);
    } catch (_) {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const requests = [
        api.getProjects(effectiveProgramId),
        api.getCatalogs(effectiveProgramId),
      ];
      if (isStudent && user?.id) requests.push(api.getStudentResearchProcess(user.id));
      const [allProjects, catalogs, academicProcess] = await Promise.all(requests);

      if (isStudent) {
        setStudentProcess(academicProcess || null);
        setStudentProcessLoading(false);
        if (academicProcess?.project?.id && user?.id) {
          const [progress, documents] = await Promise.all([
            api.getResearchProgress(academicProcess.project.id, user.id),
            api.getResearchDocuments(academicProcess.project.id, user.id),
          ]);
          setStudentRecords({ progress: progress || [], documents: documents || [] });
        } else {
          setStudentRecords({ progress: [], documents: [] });
        }
      }

      const activeProgramId = (effectiveProgramId && effectiveProgramId !== 'all') ? String(effectiveProgramId) : null;
      const isPsicologia = activeProgramId === '2' || String(userProgramName).toLowerCase().includes('psicolog');
      const isSistemas = activeProgramId === '1' || String(userProgramName).toLowerCase().includes('sistema');

      const allCatLines = catalogs.lines || [];
      const progLines = allCatLines.filter(l => {
        if (activeProgramId && l.program_id !== undefined && l.program_id !== null) {
          return String(l.program_id) === activeProgramId;
        }
        const name = (l.name || '').toLowerCase();
        if (isPsicologia) {
          return [5, 6, 7].includes(l.research_line_id) || name.includes('psicolog');
        }
        return true;
      });

      const allCatSublines = catalogs.sublines || [];
      const progSublines = allCatSublines.filter(sl => progLines.some(l => l.research_line_id === sl.research_line_id));

      setStatuses(catalogs.statuses || []);
      setModalities(catalogs.modalities || []);
      setLines(progLines);
      setSublines(progSublines);
      setDegreeOptions(catalogs.degreeOptions || []);
      setAcademicSemesters(catalogs.semesters || []);

      let userProjects = allProjects || [];

      if (isLimitedUser && user?.id) {
        userProjects = userProjects.filter(p =>
          (p.user_projects || []).some(up => String(up.user_id) === String(user.id))
        );
      }

      if (userProgramId !== null) {
        userProjects = userProjects.filter(p => String(p.programId) === String(userProgramId));
      }

      const mappedProjects = userProjects.map((row) => {
        const year = row.created_at
          ? new Date(row.created_at).getFullYear().toString()
          : 'Sin fecha';
        const authorsArray = (row.authors || []).map(a => a.name).filter(Boolean);
        const asesores = (row.advisors || []).map(a => a.name).filter(Boolean);
        const juradosArray = (row.jurors || []).map(a => a.name).filter(Boolean);

        return {
          id: row.project_id,
          code: row.code || `PR-${row.project_id}`,
          title: row.title,
          status: row.status || 'Sin estado',
          statusId: row.statusId || '',
          modality: row.modality || 'Sin modalidad',
          modalityId: row.modalityId || '',
          line: row.line || 'Sin línea',
          lineId: row.lineId || '',
          subline: row.subline || 'Sin sublínea',
          sublineId: row.sublineId || '',
          degreeOptionId: row.degreeOptionId ?? row.degree_option_id ?? null,
          degreeOptionName: row.degreeOptionName ?? row.degree_option_name ?? null,
          year,
          semesterNumber: row.semesterNumber ?? null,
          authorsArray: authorsArray.length > 0 ? authorsArray : ['Sin autores'],
          advisor: asesores.length > 0 ? asesores.join(', ') : 'Sin asignar',
          jurados: juradosArray.length > 0 ? juradosArray.join(', ') : 'Sin jurados',
          updatedAt: row.created_at,
          description: row.letterLink
            ? `Carta: ${row.letterLink}`
            : 'Sin descripción registrada.',
          letterLink: row.letterLink || '',
          generalObjective: row.generalObjective || row.general_objective || null,
          specificObjectives: row.specificObjectives || row.specific_objectives || null,
          latestScore: row.latestScore ?? row.latest_score ?? null,
          latestObservations: row.latestObservations || row.latest_observations || null,
          latestGradeDate: row.latestGradeDate || row.latest_grade_date || null,
          latestEvaluatorName: row.latestEvaluatorName || row.latest_evaluator_name || null,
          isOwned: (row.user_projects || []).some(up => String(up.user_id) === String(user?.id)),
          coauthors: row.authors || [],
          authorsList: row.authors || [],
          advisorsList: row.advisors || [],
          jurorsList: row.jurors || [],
          myRole: (row.user_projects || []).find(p => String(p.user_id) === String(user?.id))?.project_role || null,
        };
      });

      setProjects(mappedProjects);
      setSelectedId(mappedProjects[0]?.id ?? null);
    } catch (err) {
      console.error('Error cargando datos:', err);
      if (isStudent) setStudentProcessLoading(false);
      setError('No fue posible cargar los proyectos desde la base de datos.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role, isLimitedUser, effectiveProgramId]);

  useEffect(() => {
    if (!isStudent) {
      setStudentProcess(null);
      setStudentProcessLoading(false);
    } else {
      setStudentProcessLoading(true);
    }
  }, [isStudent, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedId) return;
    fetchHistory(selectedId);
  }, [selectedId]);

  const years = useMemo(() => {
    const values = new Set(['all']);

    projects.forEach((project) => {
      if (project.year) values.add(project.year);
    });

    return Array.from(values);
  }, [projects]);
  const semesterOptions = useMemo(() => {
  const values = new Set();

  projects.forEach((project) => {
    if (project.semesterNumber !== null && project.semesterNumber !== undefined) {
      values.add(String(project.semesterNumber));
    }
  });

  return Array.from(values).sort((a, b) => Number(a) - Number(b));
}, [projects]);

  const filteredProjects = useMemo(() => {
  const term = filters.search.trim().toLowerCase();

  return projects.filter((project) => {
    const matchesText =
      !term ||
      project.title.toLowerCase().includes(term) ||
      project.code.toLowerCase().includes(term) ||
      project.authorsArray.some(a => a.toLowerCase().includes(term));

    const matchesStatus =
      filters.status === 'all' || project.status === filters.status;

    const matchesModality =
      filters.modality === 'all' || project.modality === filters.modality;

    const matchesYear =
      filters.year === 'all' ||
      project.year === filters.year;

    const matchesSemester =
      !isDocente ||
      filters.semester === 'all' ||
      String(project.semesterNumber ?? '') === String(filters.semester);

    const matchesDocenteRole =
      !isDocente ||
      filters.docenteRole === 'all' ||
      project.myRole === filters.docenteRole;

    return matchesText && matchesStatus && matchesModality && matchesYear && matchesSemester && matchesDocenteRole;
  });
}, [filters, projects, isDocente]);

  const selectedProject =
    projects.find((project) => project.id === selectedId) || projects[0];

  const metaCounts = useMemo(() => ({
    total: projects.length,
    estados: statuses.length,
    modalidades: modalities.length,
  }), [projects.length, statuses.length, modalities.length]);

  const studentCanCreate = isStudent && studentProcess?.canCreate === true;
  const studentPhase = studentProcess?.phase;
  const studentSemester = studentProcess?.semesterNumber;
  const studentStageTitle = studentProcess?.project?.processStage === 'propuesta'
    ? 'Propuesta de investigación'
    : studentPhase === 'I'
      ? 'Investigación I'
      : studentPhase === 'II'
        ? 'Investigación II'
        : studentPhase === 'III'
          ? 'Investigación III'
          : 'Proceso de investigación';
  const studentStageDescription = studentProcess?.project?.processStage === 'propuesta'
    ? 'Pendiente de evaluación y aprobación'
    : studentPhase === 'I'
      ? 'Propuesta de investigación'
      : studentPhase === 'II'
        ? 'Continuación del proyecto de investigación'
        : studentPhase === 'III'
          ? 'Finalización del proyecto de investigación'
          : 'Consulta tu proceso académico';
  const studentProcessDefaultMessage = studentProcess?.project?.processStage === 'propuesta'
    ? 'Tu propuesta está registrada y pendiente de evaluación. Investigación I iniciará cuando sea aprobada.'
    : studentProcess?.project
      ? 'Ya tienes un proyecto de investigación registrado.'
      : studentPhase === 'I'
        ? 'Aún no tienes un proyecto de investigación registrado.'
        : studentPhase === 'II'
          ? 'No tienes un proyecto de Investigación I registrado. Debes tener una propuesta previa para continuar con Investigación II.'
          : studentPhase === 'III'
            ? 'No tienes un proyecto de investigación asociado. No es posible iniciar un nuevo proyecto desde Investigación III.'
            : 'No encontramos el semestre académico de tu perfil.';
  const studentProcessMessage = getStudentProjectMessage(
    studentProcess?.project,
    studentProcessDefaultMessage,
  );

  const processStepState = (step) => {
    if (!studentPhase) return 'pending';
    const current = { I: 1, II: 2, III: 3 }[studentPhase] || 0;
    if (step < current) return 'complete';
    if (step === current) return 'current';
    return 'pending';
  };

  const openStudentAction = (action) => {
    setStudentAction(action);
    setStudentActionError('');
    setStudentActionData({ description: '', fileUrl: '', observations: '' });
  };

  const submitStudentAction = async (event) => {
    event.preventDefault();
    if (!studentProcess?.project?.id || !user?.id) return;
    setStudentActionSaving(true);
    setStudentActionError('');
    try {
      if (studentAction === 'progress') {
        if (!studentActionData.description.trim()) throw new Error('Describe el avance antes de guardarlo.');
        await api.createResearchProgress(studentProcess.project.id, user.id, studentActionData.description);
      } else {
        if (!studentActionData.fileUrl.trim()) throw new Error('Ingresa el enlace del documento.');
        await api.createResearchDocument(studentProcess.project.id, {
          userId: user.id,
          documentType: studentAction || 'enlace_biblioteca',
          fileUrl: studentActionData.fileUrl,
          observations: studentActionData.observations,
        });
      }
      const [progress, documents] = await Promise.all([
        api.getResearchProgress(studentProcess.project.id, user.id),
        api.getResearchDocuments(studentProcess.project.id, user.id),
      ]);
      setStudentRecords({ progress: progress || [], documents: documents || [] });
      setStudentAction('');
      setStudentActionData({ description: '', fileUrl: '', observations: '' });
    } catch (err) {
      setStudentActionError(err.message || 'No fue posible registrar la información.');
    } finally {
      setStudentActionSaving(false);
    }
  };

  const completeAcademicProfile = async () => {
    if (!user?.id || !studentActionData.semesterId) {
      setStudentActionError('Selecciona tu semestre académico.');
      return;
    }
    setStudentActionSaving(true);
    setStudentActionError('');
    try {
      await api.updateStudentAcademicProfile(user.id, studentActionData.semesterId);
      setStudentAction('');
      setStudentActionData({ description: '', fileUrl: '', observations: '', semesterId: '' });
      await loadData();
    } catch (err) {
      setStudentActionError(err.message || 'No fue posible guardar el semestre académico.');
    } finally {
      setStudentActionSaving(false);
    }
  };

  const handleFilterChange = (key) => (event) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const filteredSublines = useMemo(() => {
    if (!formData.lineId) return sublines;
    return sublines.filter(
      (item) => String(item.research_line_id) === String(formData.lineId),
    );
  }, [formData.lineId, sublines]);

  const handleFormChange = (key) => (event) => {
    setFormData((prev) => ({ ...prev, [key]: event.target.value }));
    setFormError('');
    setFormSuccess('');
  };

  const verifyAndAddAuthor = async () => {
    const email = newCoauthorEmail.trim().toLowerCase();
    if (!email) return;

    if (email === user?.email?.toLowerCase()) {
      setFormError('No puedes agregarte a ti mismo como co-autor (ya estás incluido).');
      return;
    }

    if (formData.coauthors.some(c => c.email.toLowerCase() === email)) {
      setFormError('Este co-autor ya está agregado.');
      return;
    }

    setVerifyingCoauthor(true);
    setFormError('');

    try {
      const res = await api.checkCoauthor(email);
      const data = res.user;
      if (!data) {
        setFormError('Usuario no encontrado. Asegúrate de que el compañero ya se haya registrado en el sistema.');
      } else {
        setFormData(prev => ({
          ...prev,
          coauthors: [...prev.coauthors, { id: data.user_id, name: data.full_name, email: data.email }]
        }));
        setNewCoauthorEmail('');
      }
    } catch (err) {
      setFormError('Error al verificar el correo: ' + (err.message || ''));
    } finally {
      setVerifyingCoauthor(false);
    }
  };

  const removeCoauthor = (idToRemove) => {
    setFormData(prev => ({
      ...prev,
      coauthors: prev.coauthors.filter(c => c.id !== idToRemove)
    }));
  };

  useEffect(() => {
    if (editProjectId || !formData.lineId) return;
    let isMounted = true;

    const generateCode = async () => {
      setIsGeneratingCode(true);
      try {
        const line = lines.find((l) => String(l.research_line_id) === String(formData.lineId));
        const prefix = generatePrefix(line?.name);

        const existingProjects = await api.getProjects();
        let maxNum = 0;
        (existingProjects || []).forEach(row => {
          if (!row.code) return;
          const parts = row.code.split('-');
          if (parts.length > 1) {
            const num = parseInt(parts[1], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        });
        
        if (isMounted) {
          setFormData(prev => ({ ...prev, code: `${prefix}-${maxNum + 1}` }));
        }
      } catch (err) {
        console.error('Error generando codigo:', err);
      } finally {
        if (isMounted) setIsGeneratingCode(false);
      }
    };

    generateCode();
    return () => { isMounted = false; };
  }, [formData.lineId, editProjectId, lines]);

  const handleSaveProject = async (event) => {
    event.preventDefault();

    if (!formData.title.trim()) {
      setFormError('El título es obligatorio.');
      return;
    }

    if (!formData.statusId || !formData.modalityId) {
      setFormError('Selecciona estado y modalidad.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    const payload = {
      title: formData.title.trim(),
      code: formData.code.trim() || null,
      statusId: Number(formData.statusId) || null,
      modalityId: Number(formData.modalityId) || null,
      lineId: formData.lineId ? Number(formData.lineId) : null,
      sublineId: formData.sublineId ? Number(formData.sublineId) : null,
      letterLink: formData.letterLink.trim() || null,
      creatorUserId: user?.id,
      coauthors: formData.coauthors,
    };

    try {
      if (editProjectId) {
        await api.updateProject(editProjectId, payload, user?.id);
        setFormSuccess('Proyecto actualizado correctamente.');
      } else {
        await api.createProject(payload);
        setFormSuccess('Proyecto creado correctamente.');
      }
      setTimeout(() => {
        handleCloseForm();
        loadData();
      }, 1000);
    } catch (err) {
      setFormError(`No fue posible guardar el proyecto: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout title="Gestion de Proyectos" subtitle="">
      <div className="projects-page">
        <div className="projects-hero">
          <div className="projects-header">
            <div>
              <span className="section-eyebrow">Gestion de datos</span>
              <h2 className="section-title">Gestion operativa</h2>
              <p className="section-subtitle">
                Administra proyectos, consulta historial y exporta informacion.
              </p>
              {userProgramId !== null && (
                  <div className="prog-filter-badge">
                    <span className="prog-filter-dot" />
                    Mostrando solo: <strong>{userProgramName || 'tu programa'}</strong>
                  </div>
                )}
            </div>
            <div className="projects-actions">
              {(!isStudent || studentCanCreate) && !isDocente && (
                <Button
                  variant="primary"
                  icon={FilePlus2}
                  onClick={() => {
                    if (isStudent && !studentCanCreate) return;
                    setShowCrearModal(true);
                  }}
                >
                  {isStudent ? 'Registrar propuesta de investigación' : 'Agregar proyecto'}
                </Button>
              )}
            </div>
          </div>

          <div className="projects-meta">
            <div className="meta-card">
              <span className="meta-label">Proyectos</span>
              <span className="meta-value">{loading ? '--' : metaCounts.total}</span>
            </div>
            <div className="meta-card">
              <span className="meta-label">Estados</span>
              <span className="meta-value">{loading ? '--' : metaCounts.estados}</span>
            </div>
            <div className="meta-card">
              <span className="meta-label">Modalidades</span>
              <span className="meta-value">{loading ? '--' : metaCounts.modalidades}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="page-error">
            <span>{error}</span>
          </div>
        )}

        {isStudent && (
          <section className="student-research-process" aria-label="Mi proceso de investigación">
            <div className="student-process-heading">
              <div>
                <span className="section-eyebrow">Mi proceso de investigación</span>
                <h2 className="section-title">{studentStageTitle}</h2>
                <p className="section-subtitle">Semestre actual: {studentSemester ? `${studentSemester}°` : 'No registrado'} · {studentStageDescription}</p>
              </div>
              {studentProcessLoading && <span className="student-process-status">Consultando semestre...</span>}
            </div>

            <div className="student-process-steps">
              {[
                { number: 1, label: 'Investigación I', detail: 'Propuesta' },
                { number: 2, label: 'Investigación II', detail: 'Avances' },
                { number: 3, label: 'Investigación III', detail: 'Producto final' },
              ].map((step, index) => (
                <div className="student-process-step-wrap" key={step.number}>
                  <div className={`student-process-step student-process-step--${processStepState(step.number)}`}>
                    <span className="student-process-step-mark">{processStepState(step.number) === 'complete' ? '✓' : processStepState(step.number) === 'current' ? '●' : '○'}</span>
                    <span><strong>{step.label}</strong><small>{step.detail}</small></span>
                  </div>
                  {index < 2 && <span className="student-process-arrow">→</span>}
                </div>
              ))}
            </div>

            <div className="student-process-content">
              <p className={isRejectedProjectStatus(studentProcess?.project?.status) ? 'student-process-message--rejected' : undefined}>
                {studentProcessMessage}
              </p>
              {studentProcess?.reason === 'semester_missing' && <div className="student-process-form">
                <strong>Completa tu semestre académico</strong>
                <select value={studentActionData.semesterId || ''} onChange={(event) => setStudentActionData((current) => ({ ...current, semesterId: event.target.value }))}>
                  <option value="">Selecciona tu semestre</option>
                  {academicSemesters.map((semester) => <option key={semester.semester_id} value={semester.semester_id}>{semester.semester_number}° semestre</option>)}
                </select>
                {studentActionError && <span className="student-process-error">{studentActionError}</span>}
                <div className="student-process-form-actions"><button type="button" onClick={() => setStudentActionError('')}>Cancelar</button><button type="button" onClick={completeAcademicProfile} disabled={studentActionSaving}>{studentActionSaving ? 'Guardando...' : 'Guardar semestre'}</button></div>
              </div>}
              {studentProcess?.project && (
                <div className="student-process-project">
                  <strong>{studentProcess.project.title}</strong>
                  <span>{studentProcess.project.code || 'Sin código'} · {studentProcess.project.status || 'Sin estado'}</span>
                  {studentProcess.project.processPhase && (
                    <span>Fase actual: Investigación {['', 'I', 'II', 'III'][studentProcess.project.processPhase]}</span>
                  )}
                  <span>Línea: {studentProcess.project.line || 'No registrada'}</span>
                  <span>Opción de grado: <strong>{studentProcess.project.degreeOptionName || 'Opción de grado pendiente'}</strong></span>
                  <span>Integrantes: {studentProcess.project.participants?.map((person) => person.name).join(', ') || 'No registrados'}</span>
                  {studentProcess.project.phaseGrades?.length > 0 && (
                    <div className="student-process-grades" aria-label="Calificaciones por fase">
                      <strong>Calificaciones registradas</strong>
                      {studentProcess.project.phaseGrades.map((grade) => (
                        <span key={grade.id}>
                          {grade.phase ? `Investigación ${['', 'I', 'II', 'III'][grade.phase]}` : 'Propuesta'}
                          {' · '}
                          {grade.score === null ? 'Sin nota' : `${Number(grade.score).toFixed(1)} / 5.0`}
                          {grade.observations ? ` · ${grade.observations}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {studentPhase === 'III' && studentProcess?.project && (() => {
                const isRejected = isRejectedProjectStatus(studentProcess.project.status);
                const isFinalized = isFinalProjectStatus(studentProcess.project.status);
                const bibliotecaDoc = studentRecords.documents.find(d => d.document_type === 'enlace_biblioteca') || (studentRecords.documents.length > 0 ? studentRecords.documents[0] : null);

                if (!isRejected && (isFinalized || Boolean(bibliotecaDoc))) {
                  return (
                    <div className="student-process-finalizado">
                      <div className="student-process-finalizado-header">
                        <span className="student-process-finalizado-icon">🎓</span>
                        <div>
                          <strong>¡Proyecto Aprobado y Culminado!</strong>
                          <p>
                            {isFinalized
                              ? `Tu proyecto de grado ha superado satisfactoriamente todas las etapas investigativas (Investigación I, II e III) y cuenta con estado "${studentProcess.project.status}". El proceso ha culminado exitosamente.`
                              : 'Has registrado exitosamente el documento final de Investigación III en el repositorio institucional. El proyecto se encuentra registrado y cerrado para nuevas modificaciones.'}
                          </p>
                        </div>
                      </div>

                      {bibliotecaDoc && (
                        <div className="student-process-doc-box">
                          <div className="student-process-doc-info">
                            <span className="student-process-doc-title">📄 Documento Institucional (Biblioteca CESMAG)</span>
                            <small className="student-process-doc-date">
                              Registrado el: {new Date(bibliotecaDoc.delivered_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </small>
                            {bibliotecaDoc.observations && (
                              <p className="student-process-doc-obs">{bibliotecaDoc.observations}</p>
                            )}
                          </div>
                          <a
                            href={bibliotecaDoc.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="student-process-doc-btn"
                          >
                            Ver proyecto en Biblioteca CESMAG ↗
                          </a>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <form className="student-process-form student-process-form--biblioteca" onSubmit={submitStudentAction}>
                    <strong>Enlace del proyecto en Biblioteca Universidad CESMAG</strong>
                    <p className="student-process-form-hint">Ingresa el enlace permanente de tu proyecto final publicado en el repositorio de la Biblioteca de la Universidad CESMAG para culminar tu proceso.</p>
                    <input
                      type="url"
                      value={studentActionData.fileUrl}
                      onChange={(event) => setStudentActionData((current) => ({ ...current, fileUrl: event.target.value }))}
                      placeholder="https://biblioteca.cesmag.edu.co/..."
                      required
                    />
                    {studentActionError && <span className="student-process-error">{studentActionError}</span>}
                    <div className="student-process-form-actions">
                      <button type="submit" disabled={studentActionSaving}>{studentActionSaving ? 'Guardando...' : 'Guardar enlace'}</button>
                    </div>
                  </form>
                );
              })()}
              {studentRecords.documents.length > 0 && studentPhase === 'III' && (() => {
                const isRejected = isRejectedProjectStatus(studentProcess?.project?.status);
                const isFinalized = isFinalProjectStatus(studentProcess?.project?.status);
                const bibliotecaDoc = studentRecords.documents.find(d => d.document_type === 'enlace_biblioteca') || studentRecords.documents[0];
                if ((!isRejected && isFinalized) || Boolean(bibliotecaDoc)) return null;
                return <div className="student-process-records"><strong>Documentos registrados</strong>{studentRecords.documents.map((item) => <a key={item.document_id} href={item.file_url} target="_blank" rel="noreferrer">{item.document_type} · {new Date(item.delivered_at).toLocaleDateString('es-CO')}</a>)}</div>;
              })()}
            </div>
          </section>
        )}

        {showForm && (
          <div className="form-card">
            <div className="form-header">
              <div className="form-header-icon">
                <FilePlus2 size={18} />
              </div>
              <div>
                <h3>{editProjectId ? 'Editar proyecto' : 'Registrar proyecto'}</h3>
                <p>{editProjectId ? 'Actualiza los datos del proyecto.' : 'Completa los datos para registrar el nuevo proyecto de grado.'}</p>
              </div>
            </div>

            {(formError || formSuccess) && (
              <div className={`form-alert${formError ? ' form-alert--error' : ''}`}>
                <span>{formError || formSuccess}</span>
              </div>
            )}

            <form className="form-grid" onSubmit={handleSaveProject}>
              <div className="field">
                <label className="field-label" htmlFor="proyectos-page-campo-1">Título del proyecto *</label>
                <input id="proyectos-page-campo-1"
                  type="text"
                  value={formData.title}
                  onChange={handleFormChange('title')}
                  className="field-input"
                  placeholder="Ej: Sistema de gestión académica..."
                  required
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="proyectos-page-campo-2">Código (Autogenerado)</label>
                <input id="proyectos-page-campo-2"
                  type="text"
                  value={isGeneratingCode ? 'Generando...' : formData.code}
                  readOnly
                  className="field-input"
                  placeholder="Selecciona una línea de investigación"
                  style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed', color: 'var(--text-secondary)' }}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="proyectos-page-campo-3">Estado *</label>
                <div className="select-wrap">
                  <select id="proyectos-page-campo-3"
                    className="field-input field-select"
                    value={formData.statusId}
                    onChange={handleFormChange('statusId')}
                    required
                  >
                    <option value="">— Selecciona un estado —</option>
                    {statuses.map((status) => (
                      <option key={status.status_id} value={status.status_id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-chevron" />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="proyectos-page-campo-4">Modalidad *</label>
                <div className="select-wrap">
                  <select id="proyectos-page-campo-4"
                    className="field-input field-select"
                    value={formData.modalityId}
                    onChange={handleFormChange('modalityId')}
                    required
                  >
                    <option value="">— Selecciona una modalidad —</option>
                    {modalities.map((modality) => (
                      <option key={modality.modality_id} value={modality.modality_id}>
                        {modality.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-chevron" />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="proyectos-page-campo-5">Línea de investigación</label>
                <div className="select-wrap">
                  <select id="proyectos-page-campo-5"
                    className="field-input field-select"
                    value={formData.lineId}
                    onChange={handleFormChange('lineId')}
                  >
                    <option value="">— Selecciona una línea —</option>
                    {lines.map((line) => (
                      <option key={line.research_line_id} value={line.research_line_id}>
                        {line.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-chevron" />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="proyectos-page-campo-6">Sublínea</label>
                <div className="select-wrap">
                  <select id="proyectos-page-campo-6"
                    className="field-input field-select"
                    value={formData.sublineId}
                    onChange={handleFormChange('sublineId')}
                    disabled={!formData.lineId}
                  >
                    <option value="">— Selecciona una sublínea —</option>
                    {filteredSublines.map((subline) => (
                      <option
                        key={subline.research_subline_id}
                        value={subline.research_subline_id}
                      >
                        {subline.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-chevron" />
                </div>
              </div>
              <div className="field form-span">
                <label className="field-label" htmlFor="proyectos-page-campo-7">Enlace de carta de presentación</label>
                <input id="proyectos-page-campo-7"
                  type="url"
                  value={formData.letterLink}
                  onChange={handleFormChange('letterLink')}
                  className="field-input"
                  placeholder="https://drive.google.com/..."
                />
              </div>

              <div className="field form-span">
                <label className="field-label" htmlFor="proyectos-page-campo-8">Co-autores del proyecto (opcional)</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input id="proyectos-page-campo-8"
                    type="email"
                    value={newCoauthorEmail}
                    onChange={(e) => { setNewCoauthorEmail(e.target.value); setFormError(''); }}
                    className="field-input"
                    placeholder="Correo del compañero (ej: juan@cesmag.edu.co)"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        verifyAndAddAuthor();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    loading={verifyingCoauthor}
                    onClick={verifyAndAddAuthor}
                  >
                    Verificar y Agregar
                  </Button>
                </div>
                {formData.coauthors.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    {formData.coauthors.map(c => (
                      <div key={c.id} style={{ 
                        display: 'flex', alignItems: 'center', gap: '6px', 
                        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                        padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem' 
                      }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>({c.email})</span>
                        <button 
                          type="button" 
                          onClick={() => removeCoauthor(c.id)} 
                          style={{ 
                            background: 'transparent', border: 'none', color: 'var(--text-muted)', 
                            cursor: 'pointer', padding: '0 4px', fontSize: '1.2rem', lineHeight: 1 
                          }}
                          title="Remover co-autor"
                        >&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-actions">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={handleCloseForm}
                >
                  Cancelar
                </Button>
                <Button variant="primary" type="submit" loading={submitting}>
                  {submitting ? 'Guardando...' : 'Guardar proyecto'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {isDocente && (
          <div className="docente-role-tabs">
            {[
              { key: 'all',    label: 'Todos mis proyectos' },
              { key: 'asesor', label: 'Como asesor' },
              { key: 'jurado', label: 'Como jurado' },
            ].map(tab => (
              <button
                key={tab.key}
                className={`docente-role-tab${filters.docenteRole === tab.key ? ' active' : ''}`}
                onClick={() => setFilters(f => ({ ...f, docenteRole: tab.key }))}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="filters-card">
          <div className="filters-header">
            <div className="filters-title">
              <Filter size={16} />
              <span>Filtros de busqueda</span>
            </div>
            <span className="filters-count">
              {filteredProjects.length} resultados
            </span>
          </div>
          <div className="filters-grid">
            <div className="field">
              <label className="field-label" htmlFor="proyectos-page-campo-9">Buscar</label>
              <input id="proyectos-page-campo-9"
                type="text"
                value={filters.search}
                onChange={handleFilterChange('search')}
                placeholder="Codigo o titulo"
                className="field-input"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="proyectos-page-campo-10">Estado</label>
              <div className="select-wrap">
                <select id="proyectos-page-campo-10"
                  className="field-input field-select"
                  value={filters.status}
                  onChange={handleFilterChange('status')}
                >
                  <option value="all">Todos los estados</option>
                  {statuses.map((status) => (
                    <option key={status.status_id} value={status.name}>
                      {status.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="select-chevron" />
              </div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="proyectos-page-campo-11">Modalidad</label>
              <div className="select-wrap">
                <select id="proyectos-page-campo-11"
                  className="field-input field-select"
                  value={filters.modality}
                  onChange={handleFilterChange('modality')}
                >
                  <option value="all">Todas las modalidades</option>
                  {modalities.map((modality) => (
                    <option key={modality.modality_id} value={modality.name}>
                      {modality.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="select-chevron" />
              </div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="proyectos-page-campo-12">Año</label>
              <div className="select-wrap">
                <select id="proyectos-page-campo-12"
                  className="field-input field-select"
                  value={filters.year}
                  onChange={handleFilterChange('year')}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year === 'all' ? 'Todos los años' : year}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="select-chevron" />
              </div>
            </div>
          </div>
        </div>

        {/* ── TABLA COMPLETA ──────────────────────────────────── */}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Título / Línea</th>
                <th>Estado</th>
                <th>Calificación</th>
                <th>Modalidad</th>
                <th>Autores</th>
                <th>Año</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="table-empty">Cargando proyectos...</td></tr>
              ) : filteredProjects.length > 0 ? (
                filteredProjects.map((project) => (
                  <tr key={project.id} className="table-row">
                    <td className="table-title" data-label="Código">{project.code}</td>
                    <td data-label="Título / Línea">
                      <div className="project-title">{project.title}</div>
                      <span className="project-meta">{project.line}</span>
                    </td>
                    <td data-label="Estado"><span className="badge">{project.status}</span></td>
                    <td data-label="Calificación">
                      {project.latestScore !== null && project.latestScore !== undefined ? (
                        <span className="badge" style={{
                          background: project.latestScore >= 3.0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: project.latestScore >= 3.0 ? '#16a34a' : '#dc2626',
                          fontWeight: 700,
                          border: `1px solid ${project.latestScore >= 3.0 ? '#22c55e' : '#ef4444'}`
                        }}>
                          ★ {Number(project.latestScore).toFixed(1)}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin calificar</span>
                      )}
                    </td>
                    <td data-label="Modalidad">{project.modality}</td>
                    <td className="project-meta" data-label="Autores">
                      {project.authorsArray.map((author, i) => (
                        <div key={i} style={{ marginBottom: '2px', whiteSpace: 'nowrap' }}>{author}</div>
                      ))}
                    </td>
                    <td data-label="Año">{project.year}</td>
                    <td data-label="Acciones">
                      <div className="row-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailModal(project)}
                        >
                          Ver
                        </Button>
                        {(!isStudent) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={FileCheck}
                            onClick={() => handleOpenReview(project)}
                            title="Revisar y calificar proyecto"
                            style={{ color: 'var(--accent-primary)', fontWeight: 600 }}
                          >
                            Revisar
                          </Button>
                        )}
                        {(!isStudent && (!isLimitedUser || project.isOwned || project.myRole === 'autor')) && (
                          <Button variant="ghost" size="sm" onClick={() => setEditModal(project)}>
                            {isLimitedUser ? 'Gestionar' : 'Editar'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={History}
                          onClick={() => { setHistoryModal(project); fetchHistory(project.id); }}
                          title="Ver historial del proyecto"
                        >
                          Historial
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="8" className="table-empty">No hay proyectos que coincidan con los filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── MODAL DETALLE ───────────────────────────────────── */}
        {detailModal && (
          <div className="modal-backdrop" onClick={() => setDetailModal(null)}>
            <div className="modal-box modal-box--lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-header-text">
                  <span className="modal-eyebrow">Ficha del proyecto</span>
                  <h2 className="modal-title">{detailModal.title}</h2>
                  <span className="modal-code">{detailModal.code}</span>
                </div>
                <button className="modal-close" type="button" onClick={() => setDetailModal(null)}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body">
                <div className="modal-badges">
                  <span className="badge">{detailModal.status}</span>
                  <span className="badge badge--muted">{detailModal.modality}</span>
                  {detailModal.latestScore !== null && detailModal.latestScore !== undefined && (
                    <span className="badge" style={{
                      background: detailModal.latestScore >= 3.0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: detailModal.latestScore >= 3.0 ? '#16a34a' : '#dc2626',
                      fontWeight: 700,
                      border: `1px solid ${detailModal.latestScore >= 3.0 ? '#22c55e' : '#ef4444'}`
                    }}>
                      Calificación: {Number(detailModal.latestScore).toFixed(1)} / 5.0
                    </span>
                  )}
                  {detailModal.isOwned && <span className="badge badge--owned">Mi proyecto</span>}
                </div>

                <div className="modal-info-grid">
                  <div className="modal-info-item">
                    <span className="modal-info-key">Línea de investigación</span>
                    <span className="modal-info-val">{detailModal.line || '—'}</span>
                  </div>
                  <div className="modal-info-item">
                    <span className="modal-info-key">Sublínea</span>
                    <span className="modal-info-val">{detailModal.subline || '—'}</span>
                  </div>
                  <div className="modal-info-item">
                    <span className="modal-info-key">Opción de grado</span>
                    <span className="modal-info-val">{detailModal.degreeOptionName || 'Opción de grado pendiente'}</span>
                  </div>
                  <div className="modal-info-item">
                    <span className="modal-info-key">Autores</span>
                    <span className="modal-info-val">
                      {detailModal.authorsArray?.map((author, i) => (
                        <div key={i} style={{ marginBottom: '4px' }}>{author}</div>
                      )) || '—'}
                    </span>
                  </div>
                  <div className="modal-info-item">
                    <span className="modal-info-key">Docente asesor</span>
                    <span className="modal-info-val">{detailModal.advisor}</span>
                  </div>
                  {!isStudent && (
                    <div className="modal-info-item">
                      <span className="modal-info-key">Jurados</span>
                      <span className="modal-info-val">{detailModal.jurados}</span>
                    </div>
                  )}
                  <div className="modal-info-item">
                    <span className="modal-info-key">Año de registro</span>
                    <span className="modal-info-val">{detailModal.year}</span>
                  </div>
                  <div className="modal-info-item">
                    <span className="modal-info-key">Última actualización</span>
                    <span className="modal-info-val">
                      {detailModal.updatedAt
                        ? new Date(detailModal.updatedAt).toLocaleDateString('es-CO')
                        : '—'}
                    </span>
                  </div>
                </div>

                {(detailModal.generalObjective || detailModal.specificObjectives) && (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {detailModal.generalObjective && (
                      <div style={{ background: 'var(--bg-secondary)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary)', display: 'block', marginBottom: 4 }}>
                          Objetivo general
                        </span>
                        <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                          {detailModal.generalObjective}
                        </p>
                      </div>
                    )}
                    {detailModal.specificObjectives && (
                      <div style={{ background: 'var(--bg-secondary)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary)', display: 'block', marginBottom: 4 }}>
                          Objetivos específicos
                        </span>
                        <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                          {detailModal.specificObjectives}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {detailModal.latestObservations && (
                  <div style={{ marginTop: 16, background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#16a34a' }}>
                        Última revisión docente {detailModal.latestEvaluatorName ? `(${detailModal.latestEvaluatorName})` : ''}
                      </span>
                      {detailModal.latestScore !== null && detailModal.latestScore !== undefined && (
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#16a34a' }}>
                          Nota: {Number(detailModal.latestScore).toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                      {detailModal.latestObservations}
                    </p>
                  </div>
                )}

                {detailModal.description?.startsWith('Carta:') && (
                  <div className="modal-link-row">
                    <span className="modal-info-key">Carta de presentación</span>
                    <a
                      href={detailModal.description.replace('Carta: ', '')}
                      target="_blank"
                      rel="noreferrer"
                      className="modal-link"
                    >
                      <ExternalLink size={13} /> Ver carta
                    </a>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                {!isStudent && (
                  <Button variant="primary" icon={Download} onClick={() => window.print()}>
                    Exportar a PDF
                  </Button>
                )}
                {(!isStudent && (!isLimitedUser || detailModal.isOwned || detailModal.myRole === 'autor')) && (
                  <Button variant="ghost" icon={Pencil} onClick={() => { setDetailModal(null); setEditModal(detailModal); }}>
                    {isLimitedUser ? 'Gestionar integrantes' : 'Editar'}
                  </Button>
                )}
                <Button variant="ghost" icon={History} onClick={() => {
                  const p = detailModal;
                  setDetailModal(null);
                  setHistoryModal(p);
                  fetchHistory(p.id);
                }}>
                  Historial
                </Button>
                <button className="modal-close-btn" type="button" onClick={() => setDetailModal(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL HISTORIAL ─────────────────────────────────── */}
        {historyModal && (
          <div className="modal-backdrop" onClick={() => setHistoryModal(null)}>
            <div className="modal-box modal-box--lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-header-text">
                  <span className="modal-eyebrow">
                    {isLimitedUser 
                      ? 'Auditoría y trazabilidad (Cambios propios y de administración)' 
                      : 'Auditoría y trazabilidad completa'}
                  </span>
                  <h2 className="modal-title">Historial de Cambios: {historyModal.title}</h2>
                  <span className="modal-code">{historyModal.code}</span>
                </div>
                <button className="modal-close" type="button" onClick={() => setHistoryModal(null)}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body">
                {historyLoading ? (
                  <div className="history-empty">Cargando historial de auditoría...</div>
                ) : historyItems.length > 0 ? (
                  <div className="history-timeline">
                    {historyItems.map((item, idx) => (
                      <div key={item.id ? `timeline-${item.id}-${idx}` : `timeline-idx-${idx}`} className="timeline-item" style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px dashed var(--border-color)' }}>
                        <div className="timeline-dot" />
                        <div className="timeline-content" style={{ width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                            <div className="timeline-title" style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.96rem' }}>
                              {item.title}
                            </div>
                            <span className="timeline-date" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={14} /> {item.date}
                            </span>
                          </div>

                          {/* USUARIO QUE REALIZÓ EL CAMBIO */}
                          <div style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', background: 'rgba(31, 91, 163, 0.08)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.84rem', marginBottom: '10px' }}>
                            <User size={15} style={{ color: '#1F5BA3' }} />
                            <span>Modificado por: <strong style={{ color: '#1F5BA3' }}>{item.userName}</strong></span>
                            <span style={{ background: '#2C3967', color: '#ffffff', padding: '1px 7px', borderRadius: '12px', fontSize: '0.74rem', textTransform: 'capitalize' }}>{item.userRole}</span>
                            {item.userProgram && <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>· {item.userProgram}</span>}
                            {item.userEmail && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>({item.userEmail})</span>}
                          </div>

                          {/* DESCRIPCIÓN U OBSERVACIONES DE LA REVISIÓN */}
                          {item.description && (
                            <div style={{ marginTop: '4px', marginBottom: '8px', fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5, background: item.changeType === 'REVISION' ? 'rgba(34, 197, 94, 0.08)' : 'transparent', padding: item.changeType === 'REVISION' ? '8px 12px' : 0, borderRadius: 6, borderLeft: item.changeType === 'REVISION' ? '3px solid #22c55e' : 'none' }}>
                              {item.description}
                            </div>
                          )}

                          {/* VALOR ANTERIOR vs VALOR NUEVO */}
                          {item.modifiedField && item.modifiedField !== 'revision_evaluacion' && (item.oldValue || item.newValue) && (
                            <div style={{ marginTop: '8px', background: 'var(--bg-secondary)', padding: '12px 14px', borderRadius: '8px', fontSize: '0.86rem' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={{ background: 'rgba(224, 15, 56, 0.06)', borderLeft: '3px solid #E00F38', padding: '8px 10px', borderRadius: '4px' }}>
                                  <small style={{ color: '#E00F38', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Valor anterior:</small>
                                  <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>{item.oldValue || '—'}</span>
                                </div>
                                <div style={{ background: 'rgba(34, 197, 94, 0.06)', borderLeft: '3px solid #22c55e', padding: '8px 10px', borderRadius: '4px' }}>
                                  <small style={{ color: '#22c55e', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Valor nuevo:</small>
                                  <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>{item.newValue || '—'}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="history-empty">
                    <History size={38} style={{ opacity: 0.25, marginBottom: 10 }} />
                    <p>
                      {isLimitedUser
                        ? 'No hay registros de cambios realizados por ti o por el administrador para este proyecto.'
                        : 'No hay registros de cambios almacenados para este proyecto.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button className="modal-close-btn" type="button" onClick={() => setHistoryModal(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL REVISIÓN Y CALIFICACIÓN DOCENTE ──────────── */}
        {reviewModal && (
          <div className="modal-backdrop" onClick={() => setReviewModal(null)}>
            <div className="modal-box modal-box--md" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-header-text">
                  <span className="modal-eyebrow">Evaluación y Seguimiento</span>
                  <h2 className="modal-title">Revisar Proyecto: {reviewModal.title}</h2>
                  <span className="modal-code">{reviewModal.code}</span>
                </div>
                <button className="modal-close" type="button" onClick={() => setReviewModal(null)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitReview}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {reviewError && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', border: '1px solid #ef4444', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem' }}>
                      {reviewError}
                    </div>
                  )}

                  {reviewSuccess && (
                    <div style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', border: '1px solid #22c55e', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem' }}>
                      {reviewSuccess}
                    </div>
                  )}

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Al actualizar el estado del proyecto, puedes registrar simultáneamente la calificación y las observaciones de la revisión. Quedarán registradas en la bitácora e historial de auditoría.
                  </p>

                  {/* ESTADO Y CALIFICACIÓN LADO A LADO */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '14px', alignItems: 'flex-start' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: 6 }}>
                        Estado del proyecto *
                      </label>
                      <div className="filter-select-wrapper" style={{ width: '100%' }}>
                        <select
                          value={reviewData.statusId}
                          onChange={(e) => setReviewData(p => ({ ...p, statusId: e.target.value }))}
                          required
                          style={{ width: '100%', height: '40px', borderRadius: 8, padding: '0 12px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                        >
                          <option value="">— Selecciona un estado —</option>
                          {statuses.map(s => (
                            <option key={s.status_id} value={s.status_id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: 6 }}>
                        Calificación (0 - 5.0)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.0"
                        max="5.0"
                        placeholder="Ej. 4.5"
                        value={reviewData.score}
                        onChange={(e) => setReviewData(p => ({ ...p, score: e.target.value }))}
                        style={{ width: '100%', height: '40px', borderRadius: 8, padding: '0 12px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.92rem', fontWeight: 600 }}
                      />
                    </div>
                  </div>

                  {/* OBSERVACIONES */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Observaciones y retroalimentación docente
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Escribe aquí las observaciones, recomendaciones, ajustes requeridos o retroalimentación general..."
                      value={reviewData.observations}
                      onChange={(e) => setReviewData(p => ({ ...p, observations: e.target.value }))}
                      style={{ width: '100%', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.88rem', resize: 'vertical' }}
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <Button variant="ghost" type="button" onClick={() => setReviewModal(null)}>
                    Cancelar
                  </Button>
                  <Button variant="primary" type="submit" disabled={reviewSaving} icon={reviewSaving ? Loader2 : CheckCircle2}>
                    {reviewSaving ? 'Guardando revisión...' : 'Guardar Revisión y Nota'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {editModal && (
        <EditProjectModal
          project={editModal}
          statuses={statuses}
          modalities={modalities}
          lines={lines}
          sublines={sublines}
          degreeOptions={degreeOptions}
          user={user}
          onClose={() => setEditModal(null)}
          onOpenHistory={() => {
            const project = editModal;
            setEditModal(null);
            setHistoryModal(project);
            fetchHistory(project.id);
          }}
          onSaved={() => { setEditModal(null); loadData(); }}
        />
        )}
      </div>

      {showCrearModal && (
        <CrearProyecto
          statuses={statuses}
          modalities={modalities}
          lines={lines}
          sublines={sublines}
          degreeOptions={degreeOptions}
          user={user}
          onClose={() => setShowCrearModal(false)}
          onSaved={() => { setShowCrearModal(false); loadData(); }}
        />
      )}
    </DashboardLayout>
  );
}
