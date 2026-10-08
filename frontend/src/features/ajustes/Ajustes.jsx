import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  Mail,
  Pencil,
  Save,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import './Ajustes.css';

function InfoRow({ icon: Icon, label, value, muted }) {
  return (
    <div className="info-row">
      <div className="info-icon">
        <Icon size={15} />
      </div>
      <div className="info-content">
        <span className="info-label">{label}</span>
        <span className={`info-value${muted ? ' info-value--muted' : ''}`}>
          {value || '—'}
        </span>
      </div>
    </div>
  );
}

function formatRoleName(role, userId) {
  if (!role) {
    const uid = String(userId || '').toLowerCase();
    if (uid.startsWith('doc')) return 'Docente';
    if (uid.startsWith('admin')) return 'Administrador';
    if (uid.startsWith('pla')) return 'Planeación';
    return 'Docente';
  }
  const r = String(role).toLowerCase();
  if (r.includes('admin') && r.includes('general')) return 'Administrador General';
  if (r.includes('admin')) return 'Administrador';
  if (r.includes('docente') || r.includes('profesor')) return 'Docente';
  if (r.includes('estudiante')) return 'Estudiante';
  if (r.includes('planeaci')) return 'Planeación';
  if (r.includes('coord')) return 'Coordinador';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function AjustesPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);

  // Estudiante: Mi proyecto de grado
  const [assignedProject, setAssignedProject] = useState(null);
  const [loadingProject, setLoadingProject] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // Estados para cambio de contraseña
  const [passForm, setPassForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');

  const isStudent = (user?.role?.toLowerCase() || '') === 'estudiante';
  const currentUserId = String(user?.user_id || user?.id || '');

  const handlePassChange = (key) => (e) => {
    setPassForm((p) => ({ ...p, [key]: e.target.value }));
    if (passError) setPassError('');
    if (passSuccess) setPassSuccess('');
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');

    if (!passForm.currentPassword.trim()) {
      setPassError('Debes ingresar tu contraseña actual.');
      return;
    }
    if (!passForm.newPassword.trim()) {
      setPassError('Debes ingresar la nueva contraseña.');
      return;
    }
    if (passForm.newPassword.trim().length < 8) {
      setPassError('La nueva contraseña debe tener como mínimo 8 caracteres.');
      return;
    }
    if (passForm.newPassword.trim() !== passForm.confirmPassword.trim()) {
      setPassError('La confirmación de la nueva contraseña no coincide.');
      return;
    }
    if (passForm.newPassword.trim() === passForm.currentPassword.trim()) {
      setPassError('La nueva contraseña no puede ser igual a tu contraseña actual.');
      return;
    }

    setPassLoading(true);
    try {
      const res = await api.changePassword(passForm.currentPassword.trim(), passForm.newPassword.trim());
      setPassSuccess(res.message || 'Contraseña actualizada correctamente en la base de datos.');
      setPassForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      setPassError(err.message || 'Error al cambiar la contraseña.');
    } finally {
      setPassLoading(false);
    }
  };

  useEffect(() => {
    async function load() {
      setLoadingProfile(true);
      try {
        const catalogs = await api.getCatalogs();
        setPrograms(catalogs.programs || []);
        setSemesters(catalogs.semesters || []);
      } catch (err) {
        console.error('Error cargando ajustes:', err);
      } finally {
        setLoadingProfile(false);
      }

      // Cargar proyecto asignado si es estudiante
      if (isStudent && currentUserId) {
        setLoadingProject(true);
        try {
          const res = await api.getStudentAssignedProject(currentUserId);
          if (res?.hasAssignedProject && res?.project) {
            setAssignedProject(res.project);
          } else {
            setAssignedProject(null);
          }
        } catch (err) {
          console.error('Error cargando proyecto asignado:', err);
        } finally {
          setLoadingProject(false);
        }
      }
    }
    load();
  }, [user?.id, isStudent, currentUserId]);

  useEffect(() => {
    if (window.location.hash === '#mi-proyecto-de-grado') {
      setTimeout(() => {
        const el = document.getElementById('mi-proyecto-de-grado');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 350);
    }
  }, [assignedProject]);

  const startEdit = () => {
    setForm({
      fullName: user?.name || '',
      programId: String(user?.programId || ''),
    });
    setSaveError('');
    setSaveSuccess('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSaveError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.fullName.trim()) {
      setSaveError('El nombre no puede estar vacío.');
      return;
    }

    setSaving(true);
    setSaveError('');
    setSaveSuccess('');

    try {
      updateUser({ name: form.fullName.trim(), programId: Number(form.programId) || null });
      setSaveSuccess('Perfil actualizado correctamente.');
      setEditing(false);
    } catch (err) {
      setSaveError(err.message || 'Error al guardar cambios.');
    } finally {
      setSaving(false);
    }
  };

  const displayName = user?.name || 'Usuario';
  const displayEmail = user?.email || '';
  const programName =
    user?.programName ||
    programs.find((p) => p.program_id === user?.programId)?.name ||
    'Sin programa';

  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <DashboardLayout title="Ajustes" subtitle="Administra tu información personal">
      <div className="settings-page">
        {/* HEADER PERFIL */}
        <div className="settings-hero">
          <div className="settings-hero-copy">
            <span className="settings-hero-eyebrow">Administración de cuenta</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div className="profile-avatar">{initials || <User size={28} />}</div>
              <div className="profile-meta">
                <h2 className="profile-name">{displayName}</h2>
                <p className="profile-email">{displayEmail}</p>
                <div className="profile-badges">
                  <span className="profile-badge">{formatRoleName(user?.role, user?.id)}</span>
                  {programName !== 'Sin programa' && (
                    <span className="profile-badge profile-badge--muted">{programName}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          {!editing && (
            <div className="profile-edit-btn">
              <Button variant="primary" icon={Pencil} onClick={startEdit}>
                Editar perfil
              </Button>
            </div>
          )}
        </div>

        <div className="settings-body">
          {/* PANEL IZQUIERDO */}
          <div className="settings-main">
            <div className="settings-card">
              <div className="card-header">
                <h3 className="card-title">Información de cuenta</h3>
              </div>

              {loadingProfile ? (
                <div className="settings-loading">Cargando perfil...</div>
              ) : (
                <div className="info-list">
                  <InfoRow icon={User} label="Nombre completo" value={displayName} />
                  <InfoRow icon={Mail} label="Correo electrónico" value={displayEmail} muted />
                  <InfoRow icon={Lock} label="Contraseña" value="••••••••••" muted />
                  <InfoRow icon={GraduationCap} label="Programa académico" value={programName} />
                  <InfoRow icon={User} label="Rol" value={formatRoleName(user?.role, user?.id)} />
                </div>
              )}
            </div>

            {/* SECCIÓN MI PROYECTO DE GRADO (SOLO ESTUDIANTE) */}
            {isStudent && (
              <div id="mi-proyecto-de-grado" className="settings-card settings-card--project-grade">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Award size={18} color="var(--accent-primary)" />
                    <h3 className="card-title">Mi proyecto de grado</h3>
                  </div>
                  {assignedProject && (
                    <span className="banco-badge-status banco-badge-status--asignado" style={{ fontSize: '0.74rem', padding: '3px 10px', borderRadius: '999px', fontWeight: 700 }}>
                      {assignedProject.status}
                    </span>
                  )}
                </div>

                {loadingProject ? (
                  <div className="settings-loading">Cargando proyecto de grado...</div>
                ) : assignedProject ? (
                  <div className="project-grade-body">
                    <h4 className="project-grade-title">{assignedProject.title}</h4>
                    <p className="project-grade-desc">{assignedProject.description}</p>

                    <div className="project-grade-meta-grid">
                      <div className="project-grade-meta-item">
                        <span className="project-grade-meta-label">Línea de investigación</span>
                        <span className="project-grade-meta-val">{assignedProject.line_name || 'Sin línea'}</span>
                      </div>
                      {assignedProject.subline_name && (
                        <div className="project-grade-meta-item">
                          <span className="project-grade-meta-label">Sublínea</span>
                          <span className="project-grade-meta-val">{assignedProject.subline_name}</span>
                        </div>
                      )}
                      <div className="project-grade-meta-item">
                        <span className="project-grade-meta-label">Proponente</span>
                        <span className="project-grade-meta-val">
                          {assignedProject.proposer_name} ({assignedProject.proposer_role})
                        </span>
                      </div>
                      {assignedProject.proposer_email && (
                        <div className="project-grade-meta-item">
                          <span className="project-grade-meta-label">Contacto proponente</span>
                          <span className="project-grade-meta-val">{assignedProject.proposer_email}</span>
                        </div>
                      )}
                      <div className="project-grade-meta-item">
                        <span className="project-grade-meta-label">Fecha de asignación</span>
                        <span className="project-grade-meta-val">
                          {assignedProject.assigned_at
                            ? new Date(assignedProject.assigned_at).toLocaleDateString('es-CO', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                              })
                            : 'No registrada'}
                        </span>
                      </div>
                      <div className="project-grade-meta-item">
                        <span className="project-grade-meta-label">Estado actual</span>
                        <span className="project-grade-meta-val" style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
                          {assignedProject.status}
                        </span>
                      </div>
                    </div>

                    <div className="project-grade-footer-note">
                      📌 <strong>Fase inicial:</strong> Esta idea seleccionada en el Banco de Proyectos es la base oficial para continuar posteriormente con la formulación del anteproyecto y las siguientes fases de tu trabajo de grado.
                    </div>
                  </div>
                ) : (
                  <div className="project-grade-empty">
                    <BookOpen size={36} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                      No tienes un proyecto de grado asignado aún
                    </p>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0 0 16px 0', maxWidth: '420px', textAlign: 'center' }}>
                      Explora el catálogo del Banco de Proyectos y escoge la idea de investigación que mejor se adapte a tus intereses académicos.
                    </p>
                    <Button variant="primary" icon={BookOpen} onClick={() => navigate('/facultades')}>
                      Explorar Banco de Proyectos
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* SECCIÓN CAMBIAR CONTRASEÑA */}
            <div className="settings-card settings-card--password">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <KeyRound size={18} color="var(--accent-primary)" />
                  <h3 className="card-title">Seguridad y Cambio de Contraseña</h3>
                </div>
                <span className="card-subtitle">
                  Como se te asignó una contraseña institucional, puedes cambiarla aquí por una clave personal segura. Se actualizará automáticamente en la base de datos.
                </span>
              </div>

              {passError && (
                <div className="settings-alert settings-alert--error">
                  <AlertCircle size={15} />
                  <span>{passError}</span>
                </div>
              )}
              {passSuccess && (
                <div className="settings-alert settings-alert--success">
                  <CheckCircle2 size={15} />
                  <span>{passSuccess}</span>
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="edit-form password-form">
                <div className="field">
                  <label className="field-label" htmlFor="ajustes-pass-actual">
                    Contraseña actual *
                  </label>
                  <div className="password-input-wrap">
                    <input
                      id="ajustes-pass-actual"
                      type={showCurrentPass ? 'text' : 'password'}
                      required
                      className="field-input"
                      value={passForm.currentPassword}
                      onChange={handlePassChange('currentPassword')}
                      placeholder="Ingresa tu contraseña actual"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowCurrentPass((p) => !p)}
                      aria-label={showCurrentPass ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'}
                    >
                      {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="password-fields-row">
                  <div className="field">
                    <label className="field-label" htmlFor="ajustes-pass-nueva">
                      Nueva contraseña *
                    </label>
                    <div className="password-input-wrap">
                      <input
                        id="ajustes-pass-nueva"
                        type={showNewPass ? 'text' : 'password'}
                        required
                        minLength={8}
                        className="field-input"
                        value={passForm.newPassword}
                        onChange={handlePassChange('newPassword')}
                        placeholder="Mínimo 8 caracteres"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowNewPass((p) => !p)}
                        aria-label={showNewPass ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
                      >
                        {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="ajustes-pass-confirm">
                      Confirmar nueva contraseña *
                    </label>
                    <div className="password-input-wrap">
                      <input
                        id="ajustes-pass-confirm"
                        type={showConfirmPass ? 'text' : 'password'}
                        required
                        minLength={8}
                        className="field-input"
                        value={passForm.confirmPassword}
                        onChange={handlePassChange('confirmPassword')}
                        placeholder="Repite la nueva contraseña"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowConfirmPass((p) => !p)}
                        aria-label={showConfirmPass ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                      >
                        {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="password-validation-hints">
                  <div className={`password-hint-chip ${passForm.newPassword.length >= 8 ? 'password-hint-chip--valid' : ''}`}>
                    <CheckCircle2 size={13} />
                    <span>Mínimo 8 caracteres ({passForm.newPassword.length}/8)</span>
                  </div>
                  <div className={`password-hint-chip ${passForm.newPassword && passForm.newPassword === passForm.confirmPassword ? 'password-hint-chip--valid' : ''}`}>
                    <CheckCircle2 size={13} />
                    <span>Coincidencia de contraseñas</span>
                  </div>
                </div>

                <div className="edit-actions" style={{ marginTop: '12px' }}>
                  <Button
                    type="submit"
                    variant="primary"
                    icon={KeyRound}
                    loading={passLoading}
                  >
                    {passLoading ? 'Guardando en Base de Datos...' : 'Actualizar Contraseña'}
                  </Button>
                </div>
              </form>
            </div>

            {/* FORMULARIO DE EDICIÓN */}
            {editing && (
              <div className="settings-card settings-card--edit">
                <div className="card-header">
                  <h3 className="card-title">Editar perfil</h3>
                  <span className="card-subtitle">
                    El correo electrónico no puede modificarse desde aquí.
                  </span>
                </div>

                {saveError && (
                  <div className="settings-alert settings-alert--error">
                    <AlertCircle size={15} />
                    <span>{saveError}</span>
                  </div>
                )}
                {saveSuccess && (
                  <div className="settings-alert settings-alert--success">
                    <CheckCircle2 size={15} />
                    <span>{saveSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleSave} className="edit-form">
                  <div className="field">
                    <label className="field-label" htmlFor="ajustes-campo-1">Nombre completo *</label>
                    <input id="ajustes-campo-1"
                      type="text"
                      required
                      className="field-input"
                      value={form.fullName}
                      onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                      placeholder="Tu nombre completo"
                      minLength={3}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="ajustes-campo-2">
                      Correo electrónico
                      <span className="field-lock">🔒 No editable</span>
                    </label>
                    <input id="ajustes-campo-2"
                      type="email"
                      className="field-input field-input--readonly"
                      value={displayEmail}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="ajustes-campo-3">Programa académico</label>
                    <div className="select-wrap">
                      <select id="ajustes-campo-3"
                        className="field-input field-select"
                        value={form.programId}
                        onChange={(e) => setForm((p) => ({ ...p, programId: e.target.value }))}
                      >
                        <option value="">— Sin programa —</option>
                        {programs.map((p) => (
                          <option key={p.program_id} value={p.program_id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="select-chevron" />
                    </div>
                  </div>

                  <div className="edit-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      icon={X}
                      onClick={cancelEdit}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      icon={Save}
                      loading={saving}
                    >
                      {saving ? 'Guardando...' : 'Guardar cambios'}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* PANEL DERECHO */}
          <aside className="settings-aside">
            <div className="settings-card summary-card">
              <div className="card-header">
                <h3 className="card-title">Resumen de cuenta</h3>
              </div>
              <div className="summary-list">
                <div className="summary-row">
                  <span className="summary-key">Estado</span>
                  <span className="summary-val summary-val--active">Activo</span>
                </div>
                <div className="summary-row">
                  <span className="summary-key">Base de datos</span>
                  <span className="summary-val">BaseDatosGrado</span>
                </div>
                <div className="summary-row">
                  <span className="summary-key">Programa</span>
                  <span className="summary-val">{programName}</span>
                </div>
                <div className="summary-row">
                  <span className="summary-key">Rol</span>
                  <span className="summary-val">{formatRoleName(user?.role, user?.id)}</span>
                </div>
              </div>
            </div>

            <div className="settings-card security-card">
              <div className="card-header">
                <h3 className="card-title">Seguridad</h3>
              </div>
              <p className="security-note">
                Conectado directamente a la base de datos PostgreSQL institucional (<strong>BaseDatosGrado</strong>).
              </p>
              <div className="security-badge">
                <Lock size={13} />
                <span>BaseDatosGrado PostgreSQL</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}