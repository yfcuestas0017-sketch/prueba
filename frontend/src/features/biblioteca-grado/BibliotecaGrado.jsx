import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BookOpen,
  Search,
  Filter,
  Sparkles,
  Award,
  ExternalLink,
  GraduationCap,
  Users,
  Calendar,
  Tag,
  Copy,
  Check,
  Plus,
  BookMarked,
  HelpCircle,
  FileText,
  Lightbulb,
  ShieldCheck,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProgramFilter } from '../../context/ProgramFilterContext';
import api from '../../lib/api';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { Modal, Button, Alert, FormField } from '../../components/ui';
import { userIsGeneralAdmin } from '../../lib/roles';
import './BibliotecaGrado.css';

const PROGRAM_FACULTY_MAP = {
  'Ingeniería de Sistemas': 'Facultad de Ingeniería',
  'Ingeniería Electrónica': 'Facultad de Ingeniería',
  'Psicología': 'Facultad de Ciencias Sociales y Humanas',
  'Derecho': 'Facultad de Ciencias Sociales y Humanas',
  'Arquitectura': 'Facultad de Arquitectura y Bellas Artes',
  'Diseño Gráfico': 'Facultad de Arquitectura y Bellas Artes',
  'Contaduría Pública': 'Facultad de Ciencias Administrativas y Contables',
  'Administración de Empresas': 'Facultad de Ciencias Administrativas y Contables',
  'Tecnología en Contabilidad y Finanzas': 'Facultad de Ciencias Administrativas y Contables',
  'Tecnología en Gestión Financiera': 'Facultad de Ciencias Administrativas y Contables',
  'Licenciatura en Educación Infantil': 'Facultad de Educación',
  'Licenciatura en Educación Física': 'Facultad de Educación',
  'Licenciatura en Educación Preescolar': 'Facultad de Educación',
  'Licenciatura en Química': 'Facultad de Educación',
};

const ALL_FACULTIES = [
  'Facultad de Ingeniería',
  'Facultad de Ciencias Sociales y Humanas',
  'Facultad de Arquitectura y Bellas Artes',
  'Facultad de Ciencias Administrativas y Contables',
  'Facultad de Educación',
];

/**
 * Normaliza y sanea las URLs del repositorio institucional CRAI UNICESMAG.
 * Si la URL no tiene protocolo, o falta el puerto 8080, o contiene un handle dummy,
 * la transforma en un enlace directo y 100% navegable.
 */
export const formatRepositoryUrl = (rawUrl) => {
  const DEFAULT_REPO = 'http://repositorio.unicesmag.edu.co:8080/xmlui/handle/123456789/660';
  if (!rawUrl || typeof rawUrl !== 'string') return DEFAULT_REPO;
  let url = rawUrl.trim();
  if (!url) return DEFAULT_REPO;

  // Si tiene el dominio institucional repositorio.unicesmag.edu.co
  if (url.includes('repositorio.unicesmag.edu.co')) {
    // Si era una URL dummy antigua de semilla /handle/cesmag/...
    if (url.includes('/handle/cesmag/')) {
      return DEFAULT_REPO;
    }
    // Asegurar puerto 8080 que es donde escucha el servidor DSpace
    if (!url.includes(':8080')) {
      url = url.replace(/^https?:\/\/repositorio\.unicesmag\.edu\.co/i, 'http://repositorio.unicesmag.edu.co:8080');
    }
    // DSpace de UNICESMAG escucha en HTTP, no HTTPS
    if (url.startsWith('https://repositorio.unicesmag.edu.co')) {
      url = url.replace('https://', 'http://');
    }
  }

  // Asegurar protocolo para que el navegador no lo interprete como ruta relativa
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url;
};

export default function BibliotecaGrado() {
  const { user } = useAuth();
  const { selectedProgram: globalProgram } = useProgramFilter();
  const isGenAdmin = userIsGeneralAdmin(user);

  const userProgram = user?.programName || '';
  const userFaculty = user?.facultyName || PROGRAM_FACULTY_MAP[userProgram] || '';
  const initialFaculty = isGenAdmin ? 'all' : (userFaculty || 'all');
  const initialProgram = isGenAdmin ? 'all' : (userProgram || 'all');

  // Navegación interna entre catálogo y recomendador
  const [activeTab, setActiveTab] = useState('catalogo'); // 'catalogo' | 'recomendador'

  // Estados del Catálogo
  const [projects, setProjects] = useState([]);
  const [facets, setFacets] = useState({ faculties: [], programs: [], years: [], distinctions: [], modalities: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filtros de búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFaculty, setFilterFaculty] = useState(initialFaculty);
  const [filterProgram, setFilterProgram] = useState(initialProgram);

  useEffect(() => {
    if (user) {
      if (!isGenAdmin) {
        const uFac = user.facultyName || PROGRAM_FACULTY_MAP[user.programName] || '';
        const uProg = user.programName || '';
        if (uFac) setFilterFaculty(uFac);
        if (uProg) setFilterProgram(uProg);
      }
    }
  }, [user, isGenAdmin]);
  const [filterYear, setFilterYear] = useState('all');
  const [filterDistinction, setFilterDistinction] = useState('all');
  const [filterModality, setFilterModality] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProjects, setTotalProjects] = useState(0);

  // Modal Detalle de Proyecto
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  // Modal Crear/Editar (Admin)
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [isEditingAdmin, setIsEditingAdmin] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminFormData, setAdminFormData] = useState({
    title: '',
    authors: '',
    advisor: '',
    jurors: '',
    program_name: '',
    faculty_name: '',
    academic_year: new Date().getFullYear(),
    modality: 'Trabajo de investigación',
    distinction: 'Aprobado',
    abstract: '',
    general_objective: '',
    specific_objectives: '',
    methodology: '',
    keywords: '',
    call_number: '',
    repository_url: '',
  });

  // Estados del Asistente de Antecedentes ("Ayúdame con mi trabajo de grado")
  const [ideaText, setIdeaText] = useState('');
  const [recommending, setRecommending] = useState(false);
  const [recommendResults, setRecommendResults] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [syncingRepo, setSyncingRepo] = useState(false);

  const showFeedback = (msg, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(null), 5000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 5000);
    }
  };

  // Carga del catálogo
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const effectiveFaculty = isGenAdmin
        ? (filterFaculty !== 'all' ? filterFaculty : '')
        : (user?.facultyName || PROGRAM_FACULTY_MAP[user?.programName] || '');

      const effectiveProgram = isGenAdmin
        ? (filterProgram !== 'all' ? filterProgram : (globalProgram !== 'all' ? globalProgram : ''))
        : (user?.programName || '');

      const filters = {
        q: searchQuery,
        faculty: effectiveFaculty,
        program: effectiveProgram,
        year: filterYear,
        distinction: filterDistinction,
        modality: filterModality,
        page,
        limit: 9,
      };

      const res = await api.libraryProjects.getProjects(filters);
      setProjects(res.projects || []);
      setFacets(res.facets || { faculties: [], programs: [], years: [], distinctions: [], modalities: [] });
      setTotalPages(res.totalPages || Math.ceil((res.total || 0) / 9) || 1);
      setTotalProjects(res.total || 0);
    } catch (err) {
      showFeedback(err.message || 'Error al cargar los trabajos de grado de la biblioteca.', true);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterFaculty, filterProgram, globalProgram, filterYear, filterDistinction, filterModality, page, isGenAdmin, user]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Manejador del Asistente de Antecedentes
  const handleRecommendAntecedents = async (e) => {
    e.preventDefault();
    if (!ideaText.trim()) return;

    setRecommending(true);
    try {
      const programScope = isGenAdmin ? '' : (user?.programName || '');
      const facultyScope = isGenAdmin ? '' : (user?.facultyName || PROGRAM_FACULTY_MAP[programScope] || '');
      const res = await api.libraryProjects.recommend(ideaText.trim(), programScope, facultyScope);
      setRecommendResults(res);
    } catch (err) {
      showFeedback(err.message || 'Error al buscar recomendaciones de antecedentes.', true);
    } finally {
      setRecommending(false);
    }
  };

  const handleDeleteAdminProject = async () => {
    if (!selectedProject || !window.confirm(`¿Estás seguro de eliminar este trabajo de grado del catálogo CRAI?\n\nTítulo: ${selectedProject.title}`)) {
      return;
    }
    setSavingAdmin(true);
    try {
      await api.libraryProjects.deleteProject(selectedProject.project_id);
      showFeedback('Proyecto de biblioteca eliminado correctamente.');
      setAdminModalOpen(false);
      loadCatalog();
    } catch (err) {
      showFeedback(err.message || 'Error al eliminar el proyecto.', true);
    } finally {
      setSavingAdmin(false);
    }
  };

  // Generador de Citación APA 7
  const generateApaCitation = (p) => {
    const authorsArr = (p.authors || '').split(',').map((a) => a.trim());
    const authorStr = authorsArr.length > 0 ? authorsArr.join(' & ') : 'Autor institucional';
    const year = p.academic_year || new Date().getFullYear();
    const title = p.title || '';
    const program = p.program_name || 'Universidad CESMAG';
    const repoLink = formatRepositoryUrl(p.repository_url);
    const url = repoLink ? ` ${repoLink}` : '';

    return `${authorStr} (${year}). ${title} [Trabajo de grado, Universidad CESMAG - ${program}]. Repositorio Institucional CRAI CESMAG.${url}`;
  };

  const handleCopyCitation = (project) => {
    const citation = generateApaCitation(project);
    navigator.clipboard.writeText(citation);
    setCopiedId(project.project_id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  // Acciones de Administración
  const handleOpenCreateAdmin = () => {
    setIsEditingAdmin(false);
    setAdminFormData({
      title: '',
      authors: '',
      advisor: '',
      jurors: '',
      program_name: user?.programName || 'Ingeniería de Sistemas',
      faculty_name: 'Facultad de Ingeniería',
      academic_year: new Date().getFullYear(),
      modality: 'Trabajo de investigación',
      distinction: 'Aprobado',
      abstract: '',
      general_objective: '',
      specific_objectives: '',
      methodology: '',
      keywords: '',
      call_number: `TG-CESMAG-${new Date().getFullYear()}-001`,
      repository_url: 'http://repositorio.unicesmag.edu.co:8080/xmlui/handle/123456789/660',
    });
    setAdminModalOpen(true);
  };

  const handleOpenEditAdmin = (p) => {
    setIsEditingAdmin(true);
    setSelectedProject(p);
    setAdminFormData({
      title: p.title || '',
      authors: p.authors || '',
      advisor: p.advisor || '',
      jurors: p.jurors || '',
      program_name: p.program_name || '',
      faculty_name: p.faculty_name || '',
      academic_year: p.academic_year || new Date().getFullYear(),
      modality: p.modality || 'Trabajo de investigación',
      distinction: p.distinction || 'Aprobado',
      abstract: p.abstract || '',
      general_objective: p.general_objective || '',
      specific_objectives: p.specific_objectives || '',
      methodology: p.methodology || '',
      keywords: Array.isArray(p.keywords) ? p.keywords.join(', ') : '',
      call_number: p.call_number || '',
      repository_url: p.repository_url || '',
    });
    setAdminModalOpen(true);
  };

  const handleSaveAdminProject = async (e) => {
    e.preventDefault();
    setSavingAdmin(true);
    try {
      const keywordsArr = adminFormData.keywords
        ? adminFormData.keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : [];

      const payload = {
        ...adminFormData,
        academic_year: parseInt(adminFormData.academic_year, 10),
        keywords: keywordsArr,
      };

      if (isEditingAdmin && selectedProject) {
        await api.libraryProjects.updateProject(selectedProject.project_id, payload);
        showFeedback('Proyecto de biblioteca actualizado exitosamente.');
      } else {
        await api.libraryProjects.createProject(payload);
        showFeedback('Nuevo proyecto de grado registrado en la biblioteca.');
      }

      setAdminModalOpen(false);
      loadCatalog();
    } catch (err) {
      showFeedback(err.message || 'Error al guardar el proyecto en biblioteca.', true);
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleSyncRepository = async () => {
    try {
      setSyncingRepo(true);
      setError(null);
      const res = await api.libraryProjects.sync();
      showFeedback(res.message || 'Sincronización completada con éxito.');
      loadCatalog();
    } catch (err) {
      showFeedback(err.message || 'Error al sincronizar con el repositorio institucional.', true);
    } finally {
      setSyncingRepo(false);
    }
  };

  return (
    <DashboardLayout
      title="Biblioteca CESMAG — Repositorio de Trabajos de Grado"
      subtitle="Explora proyectos de grado finalizados, consulta antecedentes y recibe sugerencias metodológicas"
    >
      <div className="bg-container">
        {/* Banner Institucional CRAI */}
        <div className="bg-hero">
          <div className="bg-hero-content">
            <div className="bg-hero-badge">
              <BookOpen size={16} /> Centro de Recursos para el Aprendizaje y la Investigación (CRAI)
            </div>
            <h1>Repositorio de Trabajos de Grado — Universidad CESMAG</h1>
            <p>
              Accede a la producción académica de pregrado y posgrado aprobada en la institución.
              Utiliza nuestro buscador inteligente para formular tu estado del arte y encontrar referencias confiables.
            </p>
          </div>

          {isGenAdmin ? (
            <div className="bg-hero-admin">
              <span className="bg-badge-admin-total" title="Control total institucional sobre todas las facultades">
                <ShieldCheck size={15} /> Control Total — Administrador General
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button
                  variant="outline"
                  icon={RefreshCw}
                  onClick={handleSyncRepository}
                  disabled={syncingRepo}
                  title="Consulta el repositorio DSpace de la universidad para incorporar nuevos proyectos"
                >
                  {syncingRepo ? 'Sincronizando...' : 'Sincronizar Repositorio'}
                </Button>
                <Button icon={Plus} onClick={handleOpenCreateAdmin}>
                  Agregar Trabajo de Grado
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-hero-scope">
              <span className="bg-badge-user-scope" title="Acceso acotado a tu facultad y programa académico">
                🎓 <b>{user?.programName || 'Mi Programa'}</b> &bull; 🏛️ {user?.facultyName || PROGRAM_FACULTY_MAP[user?.programName] || 'Mi Facultad'}
              </span>
            </div>
          )}
        </div>

        {error && <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {successMsg && <Alert type="success" onDismiss={() => setSuccessMsg(null)}>{successMsg}</Alert>}

        {/* Selector de Modo / Pestañas */}
        <div className="bg-tabs">
          <button
            type="button"
            className={`bg-tab-btn ${activeTab === 'catalogo' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalogo')}
          >
            <BookMarked size={18} />
            Catálogo de Trabajos de Grado ({totalProjects})
          </button>
          <button
            type="button"
            className={`bg-tab-btn ${activeTab === 'recomendador' ? 'active' : ''}`}
            onClick={() => setActiveTab('recomendador')}
          >
            <Sparkles size={18} />
            Ayúdame con mi Trabajo de Grado (Recomendador de Antecedentes)
          </button>
        </div>

        {/* ─── MODO 1: CATÁLOGO DE TRABAJOS DE GRADO ───────────────────────────── */}
        {activeTab === 'catalogo' && (
          <div className="bg-catalogo-view">
            {/* Selector Rápido de Facultades para Admin General / Banner de Alcance para Docentes y Estudiantes */}
            {isGenAdmin ? (
              <>
                <div className="bg-faculty-nav" role="tablist" aria-label="Filtrar por Facultad">
                  <button
                    type="button"
                    className={`bg-faculty-btn ${filterFaculty === 'all' ? 'active' : ''}`}
                    onClick={() => {
                      setFilterFaculty('all');
                      setFilterProgram('all');
                      setPage(1);
                    }}
                  >
                    🌐 Todas las Facultades
                  </button>
                  {(facets.faculties && facets.faculties.length > 0 ? facets.faculties : ALL_FACULTIES).map((fac) => (
                    <button
                      key={fac}
                      type="button"
                      className={`bg-faculty-btn ${filterFaculty === fac ? 'active' : ''}`}
                      onClick={() => {
                        setFilterFaculty(fac === filterFaculty ? 'all' : fac);
                        setFilterProgram('all');
                        setPage(1);
                      }}
                    >
                      🏛️ {fac.replace('Facultad de ', '')}
                    </button>
                  ))}
                </div>

                {filterFaculty !== 'all' && (
                  <div className="bg-faculty-active-banner">
                    <span>
                      Visualizando trabajos de: <b>{filterFaculty}</b>
                    </span>
                    <button
                      type="button"
                      className="bg-banner-reset-btn"
                      onClick={() => {
                        setFilterFaculty('all');
                        setFilterProgram('all');
                        setPage(1);
                      }}
                    >
                      Ver toda la universidad
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-faculty-restricted-banner">
                <div className="bg-restricted-left">
                  <span className="bg-restricted-pill">
                    <Lock size={12} /> Ámbito Acotado
                  </span>
                  <span className="bg-restricted-text">
                    Estás visualizando únicamente los trabajos de grado de <b>{user?.programName || 'tu carrera'}</b> (<b>{user?.facultyName || PROGRAM_FACULTY_MAP[user?.programName] || 'tu facultad'}</b>). Los docentes y estudiantes tienen acceso exclusivo a su propia facultad y programa.
                  </span>
                </div>
                <span className="bg-restricted-count">
                  {totalProjects} trabajos disponibles
                </span>
              </div>
            )}

            {/* Barra de Filtros Facetados */}
            <div className="bg-filter-panel">
              <div className="bg-search-box">
                <Search size={18} className="bg-search-icon" />
                <input
                  type="text"
                  className="bg-search-input"
                  placeholder="Buscar por tema, palabra clave, autor, asesor o signatura..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <div className="bg-filters-grid">
                {isGenAdmin ? (
                  <>
                    <div className="bg-filter-group">
                      <label htmlFor="filter-fac">Facultad:</label>
                      <select
                        id="filter-fac"
                        className="bg-select"
                        value={filterFaculty}
                        onChange={(e) => {
                          setFilterFaculty(e.target.value);
                          setFilterProgram('all');
                          setPage(1);
                        }}
                      >
                        <option value="all">🏛️ Todas las facultades</option>
                        {(facets.faculties && facets.faculties.length > 0 ? facets.faculties : ALL_FACULTIES).map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="bg-filter-group">
                      <label htmlFor="filter-prog">Programa:</label>
                      <select
                        id="filter-prog"
                        className="bg-select"
                        value={filterProgram}
                        onChange={(e) => {
                          setFilterProgram(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="all">🌐 Todos los programas</option>
                        {facets.programs
                          .filter((p) => filterFaculty === 'all' || !PROGRAM_FACULTY_MAP[p] || PROGRAM_FACULTY_MAP[p] === filterFaculty)
                          .map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-filter-group bg-filter-group--locked" title="Tu consulta está acotada a tu facultad de pertenencia">
                      <label htmlFor="filter-fac">Facultad (Fija):</label>
                      <div className="bg-locked-field" id="filter-fac">
                        <Lock size={13} className="bg-locked-icon" />
                        <span>{user?.facultyName || PROGRAM_FACULTY_MAP[user?.programName] || 'Tu Facultad'}</span>
                      </div>
                    </div>

                    <div className="bg-filter-group bg-filter-group--locked" title="Tu consulta está acotada a tu programa de formación">
                      <label htmlFor="filter-prog">Programa (Fijo):</label>
                      <div className="bg-locked-field" id="filter-prog">
                        <Lock size={13} className="bg-locked-icon" />
                        <span>{user?.programName || 'Tu Programa'}</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="bg-filter-group">
                  <label htmlFor="filter-yr">Año:</label>
                  <select
                    id="filter-yr"
                    className="bg-select"
                    value={filterYear}
                    onChange={(e) => {
                      setFilterYear(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">📅 Todos los años</option>
                    {facets.years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-filter-group">
                  <label htmlFor="filter-dist">Distinción:</label>
                  <select
                    id="filter-dist"
                    className="bg-select"
                    value={filterDistinction}
                    onChange={(e) => {
                      setFilterDistinction(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">⭐ Todas las distinciones</option>
                    {facets.distinctions.map((d) => (
                      <option key={d} value={d}>
                        {d === 'Laureado' ? '🏆 Laureado' : d === 'Meritorio' ? '⭐ Meritorio' : d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-filter-group">
                  <label htmlFor="filter-mod">Modalidad:</label>
                  <select
                    id="filter-mod"
                    className="bg-select"
                    value={filterModality}
                    onChange={(e) => {
                      setFilterModality(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">🎓 Todas las modalidades</option>
                    {facets.modalities.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Listado de Tarjetas */}
            {loading ? (
              <div className="bg-loading">
                <BookOpen size={32} className="bg-spin-icon" />
                <span>Consultando colección de la Biblioteca CESMAG...</span>
              </div>
            ) : projects.length === 0 ? (
              <div className="bg-empty">
                <HelpCircle size={44} />
                <h3>No se encontraron trabajos de grado</h3>
                <p>Intenta con otros términos de búsqueda o restablece los filtros aplicados.</p>
              </div>
            ) : (
              <>
                <div className="bg-projects-grid">
                  {projects.map((proj) => {
                    const isLaureado = proj.distinction === 'Laureado';
                    const isMeritorio = proj.distinction === 'Meritorio';

                    return (
                      <article key={proj.project_id} className="bg-card">
                        <div className="bg-card-header">
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span
                              className={`bg-badge-distinction ${
                                isLaureado
                                  ? 'bg-badge--laureado'
                                  : isMeritorio
                                  ? 'bg-badge--meritorio'
                                  : ''
                              }`}
                            >
                              {isLaureado ? '🏆 Laureado' : isMeritorio ? '⭐ Meritorio' : '📄 Aprobado'}
                            </span>
                            {proj.faculty_name && (
                              <span className="bg-badge-faculty" title={proj.faculty_name}>
                                🏛️ {proj.faculty_name.replace('Facultad de ', '')}
                              </span>
                            )}
                          </div>
                          <span className="bg-year">
                            <Calendar size={13} /> {proj.academic_year}
                          </span>
                        </div>

                        <h3 className="bg-card-title">{proj.title}</h3>

                        <div className="bg-meta-list">
                          <div className="bg-meta-item">
                            <Users size={14} />
                            <span><b>Autores:</b> {proj.authors}</span>
                          </div>
                          <div className="bg-meta-item">
                            <GraduationCap size={14} />
                            <span><b>Director:</b> {proj.advisor}</span>
                          </div>
                          <div className="bg-meta-item">
                            <Tag size={14} />
                            <span><b>Programa:</b> {proj.program_name}</span>
                          </div>
                        </div>

                        <p className="bg-abstract-snippet">
                          {proj.abstract?.slice(0, 180)}...
                        </p>

                        <div className="bg-card-footer">
                          {proj.call_number && (
                            <span className="bg-call-number">
                              CRAI: {proj.call_number}
                            </span>
                          )}

                          <div className="bg-card-buttons">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedProject(proj);
                                setDetailModalOpen(true);
                              }}
                            >
                              Ver Ficha
                            </Button>

                            <a
                              href={formatRepositoryUrl(proj.repository_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-btn-repo"
                              title="Abrir trabajo en Repositorio Institucional CRAI UNICESMAG"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={13} />
                              <span>Repositorio</span>
                            </a>

                            {isGenAdmin && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenEditAdmin(proj)}
                              >
                                Editar
                              </Button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Paginación */}
                {totalPages > 1 && (
                  <div className="bg-pagination">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <span className="bg-page-info">
                      Página {page} de {totalPages} ({totalProjects} trabajos en total)
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Siguiente
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── MODO 2: ASISTENTE DE ANTECEDENTES Y RECOMENDADOR ───────────────── */}
        {activeTab === 'recomendador' && (
          <div className="bg-recomendador-view">
            <div className="bg-recom-prompt-card">
              <div className="bg-recom-prompt-head">
                <Lightbulb size={24} className="bg-prompt-icon" />
                <div>
                  <h2>Motor de Antecedentes y Recomendación Académica</h2>
                  <p>
                    {isGenAdmin ? (
                      <>Escribe el tema o los objetivos de investigación. Como <b>Administrador General</b>, el análisis se realiza sobre la totalidad de la producción de todas las facultades de la Universidad CESMAG.</>
                    ) : (
                      <>Escribe el tema, idea tentativa o los objetivos de tu trabajo de grado. El sistema analizará el repositorio de <b>{user?.programName || 'tu carrera'}</b> (<b>{user?.facultyName || PROGRAM_FACULTY_MAP[user?.programName] || 'tu facultad'}</b>) para recomendarte antecedentes afines y docentes directores.</>
                    )}
                  </p>
                </div>
              </div>

              <form onSubmit={handleRecommendAntecedents} className="bg-recom-form">
                <textarea
                  required
                  rows={4}
                  className="bg-recom-textarea"
                  placeholder="Ej: Quiero desarrollar una aplicación móvil con visión artificial para detectar plagas en cultivos agrícolas en Nariño, optimizando la productividad de los pequeños agricultores..."
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                />

                <div className="bg-recom-submit-row">
                  <span className="bg-hint">
                    💡 Tip: Entre más detalles incluyas sobre el problema o tecnologías, más precisos serán los antecedentes.
                  </span>
                  <Button type="submit" loading={recommending} icon={Sparkles}>
                    Buscar Antecedentes y Recomendaciones
                  </Button>
                </div>
              </form>
            </div>

            {/* Resultados del Recomendador */}
            {recommendResults && (
              <div className="bg-recom-results-section">
                <div className="bg-recom-overview-bar">
                  <span>
                    🎯 <b>Análisis completado:</b> Se encontraron {recommendResults.totalMatches} trabajos con afinidad temática en la Biblioteca CESMAG.
                  </span>
                </div>

                {/* Fila de Directores Sugeridos */}
                {recommendResults.recommendedAdvisors?.length > 0 && (
                  <div className="bg-recom-block">
                    <h3 className="bg-block-title">
                      <Users size={18} /> Docentes con Trayectoria en tu Línea Temática
                    </h3>
                    <p className="bg-block-sub">
                      Estos profesores han asesorado trabajos de grado aprobados en la universidad sobre temas similares al tuyo:
                    </p>
                    <div className="bg-advisors-grid">
                      {recommendResults.recommendedAdvisors.map((adv, i) => (
                        <div key={i} className="bg-advisor-card">
                          <div className="bg-adv-avatar">
                            {adv.name.charAt(0)}
                          </div>
                          <div className="bg-adv-info">
                            <strong>{adv.name}</strong>
                            <span>{adv.projectsCount} proyecto(s) dirigidos en este tema</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trabajos de Grado Afines para Marco de Antecedentes */}
                <div className="bg-recom-block">
                  <h3 className="bg-block-title">
                    <BookMarked size={18} /> Trabajos de Grado Afines (Para tu Estado del Arte)
                  </h3>
                  <div className="bg-projects-grid">
                    {recommendResults.recommendedProjects?.map((proj) => {
                      const isLaureado = proj.distinction === 'Laureado';
                      const isMeritorio = proj.distinction === 'Meritorio';
                      const isCopied = copiedId === proj.project_id;

                      return (
                        <article key={proj.project_id} className="bg-card bg-card--highlight">
                          <div className="bg-card-header">
                            <span
                              className={`bg-badge-distinction ${
                                isLaureado
                                  ? 'bg-badge--laureado'
                                  : isMeritorio
                                  ? 'bg-badge--meritorio'
                                  : ''
                              }`}
                            >
                              {isLaureado ? '🏆 Laureado' : isMeritorio ? '⭐ Meritorio' : '📄 Aprobado'}
                            </span>
                            <span className="bg-match-score">
                              Afinidad: {proj.relevance_score} pts
                            </span>
                          </div>

                          <h3 className="bg-card-title">{proj.title}</h3>

                          <div className="bg-meta-list">
                            <div className="bg-meta-item">
                              <Users size={14} />
                              <span><b>Autores:</b> {proj.authors}</span>
                            </div>
                            <div className="bg-meta-item">
                              <GraduationCap size={14} />
                              <span><b>Asesor:</b> {proj.advisor}</span>
                            </div>
                          </div>

                          {proj.general_objective && (
                            <div className="bg-recom-obj-snippet">
                              <b>Objetivo formulado:</b> {proj.general_objective}
                            </div>
                          )}

                          <div className="bg-card-footer">
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={isCopied ? Check : Copy}
                              onClick={() => handleCopyCitation(proj)}
                            >
                              {isCopied ? '¡Cita Copiada!' : 'Copiar Cita APA 7'}
                            </Button>

                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedProject(proj);
                                setDetailModalOpen(true);
                              }}
                            >
                              Ver Ficha
                            </Button>

                            <a
                              href={formatRepositoryUrl(proj.repository_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-btn-repo"
                              title="Abrir trabajo en Repositorio Institucional CRAI UNICESMAG"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={13} />
                              <span>Repositorio</span>
                            </a>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                {/* Objetivos de Referencia */}
                {recommendResults.referenceObjectives?.length > 0 && (
                  <div className="bg-recom-block">
                    <h3 className="bg-block-title">
                      <FileText size={18} /> Objetivos de Referencia Formulados en Trabajos Aprobados
                    </h3>
                    <p className="bg-block-sub">
                      Úsalos como inspiración para redactar tus propios objetivos con rigor metodológico:
                    </p>
                    <div className="bg-objectives-list">
                      {recommendResults.referenceObjectives.map((item, idx) => (
                        <div key={idx} className="bg-obj-ref-card">
                          <strong className="bg-obj-proj-title">{item.projectTitle} ({item.year})</strong>
                          <div className="bg-obj-text">
                            <b>Objetivo General:</b> {item.general_objective}
                          </div>
                          {item.specific_objectives && (
                            <div className="bg-obj-text bg-obj-spec">
                              <b>Objetivos Específicos:</b>
                              <pre className="bg-pre-obj">{item.specific_objectives}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── MODAL DETALLE DE PROYECTO ────────────────────────────────────────── */}
        <Modal
          open={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={selectedProject?.title || 'Detalle del Trabajo de Grado'}
          description={`Biblioteca CESMAG · ${selectedProject?.program_name || ''} · ${selectedProject?.academic_year || ''}`}
          footer={
            <>
              {selectedProject && (
                <Button
                  variant="secondary"
                  icon={copiedId === selectedProject.project_id ? Check : Copy}
                  onClick={() => handleCopyCitation(selectedProject)}
                >
                  {copiedId === selectedProject.project_id ? '¡Cita Copiada!' : 'Copiar Cita APA 7'}
                </Button>
              )}
              {selectedProject && (
                <a
                  href={formatRepositoryUrl(selectedProject.repository_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-modal-repo-btn"
                  title="Abrir en Repositorio CRAI UNICESMAG en nueva pestaña"
                >
                  <ExternalLink size={16} /> Abrir en Repositorio CRAI
                </a>
              )}
              <Button onClick={() => setDetailModalOpen(false)}>Cerrar</Button>
            </>
          }
        >
          {selectedProject && (
            <div className="bg-detail-content">
              <div className="bg-detail-grid">
                <div><b>Autores:</b> {selectedProject.authors}</div>
                <div><b>Director / Asesor:</b> {selectedProject.advisor}</div>
                {selectedProject.jurors && <div><b>Jurados:</b> {selectedProject.jurors}</div>}
                <div><b>Modalidad:</b> {selectedProject.modality}</div>
                <div><b>Distinción:</b> {selectedProject.distinction}</div>
                {selectedProject.call_number && <div><b>Signatura CRAI:</b> {selectedProject.call_number}</div>}
              </div>

              <div className="bg-detail-repo-card">
                <div className="bg-detail-repo-header">
                  <div className="bg-detail-repo-title">
                    <ExternalLink size={15} />
                    <span>Repositorio Institucional CRAI UNICESMAG (DSpace)</span>
                  </div>
                  <a
                    href={formatRepositoryUrl(selectedProject.repository_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-detail-repo-direct-btn"
                  >
                    Abrir enlace oficial ↗
                  </a>
                </div>
                <div className="bg-detail-repo-url">
                  <code>{formatRepositoryUrl(selectedProject.repository_url)}</code>
                </div>
              </div>

              <div className="bg-detail-section">
                <h4>Resumen Analítico (Abstract)</h4>
                <p>{selectedProject.abstract}</p>
              </div>

              {selectedProject.general_objective && (
                <div className="bg-detail-section">
                  <h4>Objetivo General</h4>
                  <p>{selectedProject.general_objective}</p>
                </div>
              )}

              {selectedProject.specific_objectives && (
                <div className="bg-detail-section">
                  <h4>Objetivos Específicos</h4>
                  <pre className="bg-pre-obj">{selectedProject.specific_objectives}</pre>
                </div>
              )}

              {selectedProject.methodology && (
                <div className="bg-detail-section">
                  <h4>Metodología Empleada</h4>
                  <p>{selectedProject.methodology}</p>
                </div>
              )}

              {selectedProject.keywords?.length > 0 && (
                <div className="bg-detail-section">
                  <h4>Palabras Clave</h4>
                  <div className="bg-detail-keywords">
                    {selectedProject.keywords.map((k, i) => (
                      <span key={i} className="bg-kw-badge">#{k}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>

        {/* ─── MODAL CREAR/EDITAR PROYECTO (ADMIN GENERAL) ───────────────────── */}
        {isGenAdmin && (
          <Modal
            open={adminModalOpen}
            onClose={() => setAdminModalOpen(false)}
            title={isEditingAdmin ? 'Editar Trabajo de Grado' : 'Registrar Trabajo de Grado en Biblioteca'}
            description="Ingresa los datos oficiales del trabajo de grado aprobado para incluirlo en el catálogo CRAI."
            footer={
              <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {isEditingAdmin && (
                    <Button
                      variant="danger"
                      type="button"
                      disabled={savingAdmin}
                      onClick={handleDeleteAdminProject}
                    >
                      Eliminar
                    </Button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="secondary" onClick={() => setAdminModalOpen(false)}>Cancelar</Button>
                  <Button type="submit" form="bg-admin-form" loading={savingAdmin}>
                    {isEditingAdmin ? 'Guardar Cambios' : 'Registrar en Catálogo'}
                  </Button>
                </div>
              </div>
            }
          >
            <form id="bg-admin-form" onSubmit={handleSaveAdminProject} className="bg-admin-form">
              <FormField label="Título del Trabajo de Grado" required>
                <input
                  type="text"
                  required
                  className="bg-input"
                  value={adminFormData.title}
                  onChange={(e) => setAdminFormData({ ...adminFormData, title: e.target.value })}
                />
              </FormField>

              <div className="bg-form-row">
                <FormField label="Autores (Estudiantes graduados)" required>
                  <input
                    type="text"
                    required
                    className="bg-input"
                    placeholder="Ej: Carlos Andrés Muñoz, Dayana Enríquez"
                    value={adminFormData.authors}
                    onChange={(e) => setAdminFormData({ ...adminFormData, authors: e.target.value })}
                  />
                </FormField>

                <FormField label="Docente Director / Asesor" required>
                  <input
                    type="text"
                    required
                    className="bg-input"
                    placeholder="Ej: Ing. Jairo Fernando Ortega, M.Sc."
                    value={adminFormData.advisor}
                    onChange={(e) => setAdminFormData({ ...adminFormData, advisor: e.target.value })}
                  />
                </FormField>
              </div>

              <div className="bg-form-row">
                <FormField label="Programa Académico" required>
                  <input
                    type="text"
                    required
                    className="bg-input"
                    value={adminFormData.program_name}
                    onChange={(e) => setAdminFormData({ ...adminFormData, program_name: e.target.value })}
                  />
                </FormField>

                <FormField label="Año Académico" required>
                  <input
                    type="number"
                    required
                    className="bg-input"
                    value={adminFormData.academic_year}
                    onChange={(e) => setAdminFormData({ ...adminFormData, academic_year: e.target.value })}
                  />
                </FormField>
              </div>

              <div className="bg-form-row">
                <FormField label="Distinción Académica" required>
                  <select
                    className="bg-input"
                    value={adminFormData.distinction}
                    onChange={(e) => setAdminFormData({ ...adminFormData, distinction: e.target.value })}
                  >
                    <option value="Aprobado">Aprobado</option>
                    <option value="Meritorio">Meritorio</option>
                    <option value="Laureado">Laureado</option>
                  </select>
                </FormField>

                <FormField label="Modalidad de Grado" required>
                  <input
                    type="text"
                    required
                    className="bg-input"
                    value={adminFormData.modality}
                    onChange={(e) => setAdminFormData({ ...adminFormData, modality: e.target.value })}
                  />
                </FormField>
              </div>

              <FormField label="Resumen Analítico (Abstract)" required>
                <textarea
                  required
                  rows={4}
                  className="bg-textarea"
                  value={adminFormData.abstract}
                  onChange={(e) => setAdminFormData({ ...adminFormData, abstract: e.target.value })}
                />
              </FormField>

              <FormField label="Objetivo General">
                <textarea
                  rows={2}
                  className="bg-textarea"
                  value={adminFormData.general_objective}
                  onChange={(e) => setAdminFormData({ ...adminFormData, general_objective: e.target.value })}
                />
              </FormField>

              <FormField label="Objetivos Específicos">
                <textarea
                  rows={3}
                  className="bg-textarea"
                  value={adminFormData.specific_objectives}
                  onChange={(e) => setAdminFormData({ ...adminFormData, specific_objectives: e.target.value })}
                />
              </FormField>

              <div className="bg-form-row">
                <FormField label="Signatura CRAI (Código de Biblioteca)">
                  <input
                    type="text"
                    className="bg-input"
                    placeholder="Ej: TG-CESMAG-SIS-2024-001"
                    value={adminFormData.call_number}
                    onChange={(e) => setAdminFormData({ ...adminFormData, call_number: e.target.value })}
                  />
                </FormField>

                <FormField label="Enlace al Repositorio CRAI / Documento DSpace">
                  <input
                    type="url"
                    className="bg-input"
                    placeholder="http://repositorio.unicesmag.edu.co:8080/xmlui/handle/123456789/..."
                    value={adminFormData.repository_url}
                    onChange={(e) => setAdminFormData({ ...adminFormData, repository_url: e.target.value })}
                  />
                </FormField>
              </div>

              <FormField label="Palabras Clave (Separadas por coma)">
                <input
                  type="text"
                  className="bg-input"
                  placeholder="Ej: Visión por Computador, YOLOv8, Agricultura, Nariño"
                  value={adminFormData.keywords}
                  onChange={(e) => setAdminFormData({ ...adminFormData, keywords: e.target.value })}
                />
              </FormField>
            </form>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
