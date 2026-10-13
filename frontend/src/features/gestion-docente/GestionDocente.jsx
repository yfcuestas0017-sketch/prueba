import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowDownToLine,
  BadgeInfo,
  BookOpen,
  Briefcase,
  Check,
  FileSpreadsheet,
  Gavel,
  Mail,
  Search,
  Upload,
  Users,
  X,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import Button from '../../components/ui/Button';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useProgramFilter } from '../../context/ProgramFilterContext';
import { normalizeImportHeader, parseCsv, readFirstWorksheet } from '../../lib/xlsxImport';
import './GestionDocente.css';

const TEACHER_IMPORT_COLUMNS = ['full_name', 'email', 'program_name'];

function downloadTeacherTemplate() {
  const csv = `\uFEFF${TEACHER_IMPORT_COLUMNS.join(';')}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla_importacion_docentes.csv';
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

export default function GestionDocente() {
  const { user } = useAuth();
  const { selectedProgram, isAdminGeneral } = useProgramFilter();
  const userProgramId = user?.programId ?? null;
  const currentUserId = String(user?.user_id || user?.id || '');

  const [docentes, setDocentes] = useState([]);
  const selectedProgramId = isAdminGeneral ? selectedProgram : (userProgramId ? String(userProgramId) : 'all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [detailDocente, setDetailDocente] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);
  const fileInputRef = useRef(null);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [importError, setImportError] = useState('');
  const [importMessage, setImportMessage] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Consultar todos los docentes de la BD para el programa seleccionado y los proyectos
      // Ya no se consultan los catálogos: solo alimentaban el selector de
      // programa de esta pantalla, que se retiró por duplicar el de la
      // cabecera. Esto ahorra una petición de red en cada carga.
      const [teachersData, allProjects] = await Promise.all([
        api.getTeachers(selectedProgramId, currentUserId).catch(() => []),
        api.getProjects(selectedProgramId).catch(() => []),
      ]);

      const docenteMap = {};

      // 2. Inicializar con TODOS los docentes registrados en la base de datos
      (teachersData || []).forEach((t) => {
        const uid = String(t.user_id);
        docenteMap[uid] = {
          user_id: uid,
          full_name: t.full_name || 'Sin nombre',
          email: t.email || '',
          program_name: t.program_name || 'Sin programa',
          programId: t.program_id,
          assignments: [],
        };
      });

      // 3. Contabilizar y asociar asignaciones reales de asesor y jurado desde proyectos
      (allProjects || []).forEach((p) => {
        (p.advisors || []).forEach((a) => {
          const id = String(a.id);
          if (!docenteMap[id]) {
            docenteMap[id] = {
              user_id: id,
              full_name: a.name || 'Sin nombre',
              email: a.email || '',
              program_name: a.program || null,
              programId: a.programId,
              assignments: [],
            };
          }
          docenteMap[id].assignments.push({
            project_id: p.id,
            title: p.title,
            code: p.code,
            line: p.line,
            role: 'asesor',
          });
        });

        (p.jurors || []).forEach((j) => {
          const id = String(j.id);
          if (!docenteMap[id]) {
            docenteMap[id] = {
              user_id: id,
              full_name: j.name || 'Sin nombre',
              email: j.email || '',
              program_name: j.program || null,
              programId: j.programId,
              assignments: [],
            };
          }
          docenteMap[id].assignments.push({
            project_id: p.id,
            title: p.title,
            code: p.code,
            line: p.line,
            role: 'jurado',
          });
        });
      });

      let docentesList = Object.values(docenteMap);
      if (selectedProgramId && selectedProgramId !== 'all') {
        docentesList = docentesList.filter((d) => !d.programId || String(d.programId) === String(selectedProgramId));
      }
      docentesList.sort((a, b) => a.full_name.localeCompare(b.full_name));
      setDocentes(docentesList);
    } catch (err) {
      console.error('Error cargando docentes:', err);
      setError('Error al cargar información de gestión docente.');
    } finally {
      setLoading(false);
    }
  }, [selectedProgramId, currentUserId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Si el docente en detalle cambia tras recargar datos, sincronizarlo
  useEffect(() => {
    if (!detailDocente) return;
    const updated = docentes.find((d) => String(d.user_id) === String(detailDocente.user_id));
    if (updated) setDetailDocente(updated);
  }, [docentes]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredDocentes = docentes.filter((d) => {
    const text = search.toLowerCase();
    return d.full_name.toLowerCase().includes(text) || d.email.toLowerCase().includes(text);
  });

  const openDetail = (docente) => {
    setDetailDocente(docente);
    setActiveFilter(null);
  };

  const closeDetail = () => {
    setDetailDocente(null);
    setActiveFilter(null);
  };

  const handleTeacherFileChange = async (event) => {
    const file = event.target.files?.[0];
    setImportError('');
    setImportMessage('');
    setPreviewRows([]);
    setFileName('');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setImportError('El archivo supera el límite de 10 MB.');
      event.target.value = '';
      return;
    }
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setImportError('Selecciona un archivo Excel .xlsx o CSV.');
      event.target.value = '';
      return;
    }
    try {
      const rows = /\.csv$/i.test(file.name)
        ? parseCsv(await file.text())
        : await readFirstWorksheet(await file.arrayBuffer());
      const [headerRow, ...dataRows] = rows;
      const headers = (headerRow || []).map(normalizeImportHeader);
      const missing = TEACHER_IMPORT_COLUMNS.filter((column) => !headers.includes(column));
      if (missing.length) {
        throw new Error(`Faltan estas columnas obligatorias: ${missing.join(', ')}.`);
      }
      const parsedRows = dataRows.map((row) => Object.fromEntries(
        TEACHER_IMPORT_COLUMNS.map((column) => [column, row[headers.indexOf(column)] ?? '']),
      )).filter((row) => Object.values(row).some((value) => String(value).trim()));
      if (!parsedRows.length) throw new Error('El archivo no contiene docentes para importar.');
      if (parsedRows.length > 2000) throw new Error('La importación permite un máximo de 2000 docentes por archivo.');
      setPreviewRows(parsedRows);
      setFileName(file.name);
    } catch (err) {
      setImportError(err.message || 'No fue posible leer el archivo.');
      event.target.value = '';
    }
  };

  const importTeachers = async () => {
    if (!previewRows.length) return;
    setImporting(true);
    setImportError('');
    setImportMessage('');
    try {
      const result = await api.importAdminTeachers(previewRows);
      setImportMessage(`Importación completada: ${result.created} cuentas nuevas y ${result.updated} docentes actualizados.`);
      setPreviewRows([]);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadData();
    } catch (err) {
      setImportError(err.message || 'No fue posible importar los docentes.');
    } finally {
      setImporting(false);
    }
  };

  const asesorCount = detailDocente ? detailDocente.assignments.filter((a) => a.role === 'asesor').length : 0;
  const juradoCount = detailDocente ? detailDocente.assignments.filter((a) => a.role === 'jurado').length : 0;

  const visibleAssignments = useMemo(() => {
    if (!detailDocente) return [];
    if (!activeFilter) return detailDocente.assignments;
    return detailDocente.assignments.filter((a) => a.role === activeFilter);
  }, [detailDocente, activeFilter]);

  return (
    <DashboardLayout title="Gestión Docente" subtitle="Asignación y seguimiento de docentes, asesores y jurados">
      <div className="gd-page">
        {!detailDocente ? (
          <>
            <div className="gd-header">
              <div className="gd-search-bar">
                <Search size={16} className="gd-search-icon" />
                <input
                  type="text"
                  placeholder="Buscar docente por nombre o correo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="gd-search-input"
                />
              </div>
              <Button
                variant={showImport ? 'secondary' : 'primary'}
                icon={Upload}
                onClick={() => {
                  setShowImport((visible) => !visible);
                  setImportError('');
                }}
              >
                {showImport ? 'Cerrar importación' : 'Importar docentes'}
              </Button>
            </div>

            {showImport && (
              <section className="gd-import-panel" aria-labelledby="gd-import-title">
                <div className="gd-import-intro">
                  <div className="gd-import-icon"><Upload size={18} /></div>
                  <div>
                    <span className="gd-import-kicker">Carga por programa</span>
                    <h2 id="gd-import-title">Importar docentes</h2>
                    <p>Las cuentas nuevas se crean activas con clave temporal <code>12345678</code>. Si el correo ya pertenece a un docente, se actualizan su nombre y programa sin cambiar su contraseña.</p>
                  </div>
                </div>
                <div className="gd-import-controls">
                  <Button variant="outline" icon={ArrowDownToLine} onClick={downloadTeacherTemplate}>
                    Descargar plantilla CSV
                  </Button>
                  <input
                    ref={fileInputRef}
                    className="gd-file-input"
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={handleTeacherFileChange}
                    aria-label="Seleccionar archivo de docentes"
                  />
                  <Button variant="primary" icon={FileSpreadsheet} onClick={() => fileInputRef.current?.click()}>
                    Elegir archivo
                  </Button>
                </div>
                <div className="gd-import-schema">
                  <div className="gd-import-schema-heading"><BadgeInfo size={16} /><strong>Formato requerido</strong><span>3 columnas</span></div>
                  <div className="gd-import-schema-columns">
                    {[
                      { key: 'full_name', description: 'Nombres y apellidos' },
                      { key: 'email', description: 'Correo institucional' },
                      { key: 'program_name', description: 'Nombre del programa' },
                    ].map((column) => (
                      <div className="gd-import-schema-column" key={column.key}>
                        <code>{column.key}</code>
                        <small>{column.description}</small>
                        <Check size={14} aria-hidden="true" />
                      </div>
                    ))}
                  </div>
                  <small className="gd-import-note">Todas las filas deben pertenecer al mismo programa. Solo se aceptan archivos con hasta 2000 registros.</small>
                </div>
                {importError && <div className="gd-import-alert gd-import-alert--error" role="alert">{importError}</div>}
                {importMessage && <div className="gd-import-alert gd-import-alert--success" role="status">{importMessage}</div>}
                {fileName && (
                  <div className="gd-import-preview">
                    <div className="gd-import-preview-heading">
                      <div><strong>{fileName}</strong><span>{previewRows.length} docentes listos para validar e importar</span></div>
                      <Button variant="primary" loading={importing} disabled={importing} onClick={importTeachers}>
                        Importar {previewRows.length}
                      </Button>
                    </div>
                    <div className="gd-import-preview-list">
                      {previewRows.slice(0, 4).map((row, index) => (
                        <div key={`${row.email}-${index}`}>
                          <span>{row.full_name || 'Nombre pendiente'}</span>
                          <small>{row.email || 'Correo pendiente'}</small>
                          <small>{row.program_name || 'Programa pendiente'}</small>
                        </div>
                      ))}
                      {previewRows.length > 4 && <span className="gd-import-preview-more">y {previewRows.length - 4} docentes más…</span>}
                    </div>
                  </div>
                )}
              </section>
            )}

            <div className="gd-meta">
              <div className="gd-meta-card">
                <span className="gd-meta-label">Docentes activos</span>
                <span className="gd-meta-value">{docentes.length}</span>
              </div>
              <div className="gd-meta-card">
                <span className="gd-meta-label">Asignaciones como asesor</span>
                <span className="gd-meta-value">
                  {docentes.reduce((acc, d) => acc + d.assignments.filter(a => a.role === 'asesor').length, 0)}
                </span>
              </div>
              <div className="gd-meta-card">
                <span className="gd-meta-label">Asignaciones como jurado</span>
                <span className="gd-meta-value">
                  {docentes.reduce((acc, d) => acc + d.assignments.filter(a => a.role === 'jurado').length, 0)}
                </span>
              </div>
            </div>

            {loading ? (
              <div className="gd-empty">Cargando docentes...</div>
            ) : error ? (
              <div className="gd-error">{error}</div>
            ) : filteredDocentes.length === 0 ? (
              <div className="gd-empty">
                <Users size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
                <h3>No se encontraron docentes</h3>
                <p>Los docentes aparecen aquí en cuanto se les asigna un proyecto como asesor o jurado.</p>
              </div>
            ) : (
              <div className="gd-grid">
                {filteredDocentes.map(d => {
                  const asesorN = d.assignments.filter(a => a.role === 'asesor').length;
                  const juradoN = d.assignments.filter(a => a.role === 'jurado').length;
                  return (
                    <div key={d.user_id} className="gd-card" onClick={() => openDetail(d)}>
                      <div className="gd-card-avatar">{d.full_name.charAt(0).toUpperCase()}</div>
                      <div className="gd-card-body">
                        <h3 className="gd-card-name">{d.full_name}</h3>
                        <p className="gd-card-email"><Mail size={12} /> {d.email || 'Sin correo'}</p>
                        {d.program_name && <p className="gd-card-program">{d.program_name}</p>}
                        <div className="gd-card-stats">
                          <span className="gd-stat"><strong>{asesorN}</strong> como asesor</span>
                          <span className="gd-stat"><strong>{juradoN}</strong> como jurado</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="dp-layout">
            <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={closeDetail}>
              Volver a docentes
            </Button>

            <div className="dp-stats">
              <div
                className={`dp-stat-card dp-stat-card--btn${activeFilter === null ? ' dp-stat-card--active-amber' : ''}`}
                onClick={() => setActiveFilter(null)}
              >
                <div className="dp-stat-icon dp-stat-icon--blue"><Users size={18} /></div>
                <div>
                  <span className="dp-stat-label">Total de proyectos</span>
                  <span className="dp-stat-value">{detailDocente.assignments.length}</span>
                </div>
              </div>
              <div
                className={`dp-stat-card dp-stat-card--btn${activeFilter === 'asesor' ? ' dp-stat-card--active-amber' : ''}`}
                onClick={() => setActiveFilter('asesor')}
              >
                <div className="dp-stat-icon dp-stat-icon--amber"><Briefcase size={18} /></div>
                <div>
                  <span className="dp-stat-label">Como asesor</span>
                  <span className="dp-stat-value">{asesorCount}</span>
                </div>
              </div>
              <div
                className={`dp-stat-card dp-stat-card--btn${activeFilter === 'jurado' ? ' dp-stat-card--active-pink' : ''}`}
                onClick={() => setActiveFilter('jurado')}
              >
                <div className="dp-stat-icon dp-stat-icon--pink"><Gavel size={18} /></div>
                <div>
                  <span className="dp-stat-label">Como jurado</span>
                  <span className="dp-stat-value">{juradoCount}</span>
                </div>
              </div>
            </div>

            <div className="dp-body">
              <div className="dp-profile">
                <div className="dp-avatar">{detailDocente.full_name.charAt(0).toUpperCase()}</div>
                <h2 className="dp-name">{detailDocente.full_name}</h2>
              </div>
              <hr className="dp-divider" />
              <div className="dp-fields">
                <div className="dp-field">
                  <span className="dp-field-label">Correo electrónico</span>
                  <span className="dp-field-value">{detailDocente.email || 'Sin correo'}</span>
                </div>
                <div className="dp-field">
                  <span className="dp-field-label">Programa</span>
                  <span className="dp-field-value">{detailDocente.program_name || 'No especificado'}</span>
                </div>
              </div>
            </div>

            <div className="dp-projects-section">
              <div className="dp-projects-header">
                <h3 className="dp-projects-title">
                  {activeFilter === 'asesor' && 'Proyectos como asesor'}
                  {activeFilter === 'jurado' && 'Proyectos como jurado'}
                  {!activeFilter && 'Todos los proyectos asignados'}
                </h3>
                {activeFilter && (
                  <button className="dp-clear-filter" onClick={() => setActiveFilter(null)}>
                    <X size={12} /> Quitar filtro
                  </button>
                )}
              </div>

              {visibleAssignments.length === 0 ? (
                <div className="dp-no-projects">
                  <BookOpen size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p>No hay proyectos asignados en esta categoría.</p>
                </div>
              ) : (
                <div className="dp-project-list">
                  {visibleAssignments.map((a, i) => (
                    <div key={`${a.project_id}-${a.role}-${i}`} className="dp-project-pill">
                      <span className={`dp-role-badge${a.role === 'jurado' ? ' dp-role-badge--jurado' : ''}`}>
                        {a.role === 'jurado' ? 'Jurado' : 'Asesor'}
                      </span>
                      <div className="dp-project-info">
                        <span className="dp-project-code">{a.code || `PR-${a.project_id}`}</span>
                        <span className="dp-project-title">{a.title}</span>
                        {a.line && <span className="dp-project-line">{a.line}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
