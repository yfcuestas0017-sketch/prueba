import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, UserPlus, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { Button, FormField, Alert } from '../../components/ui';
import './Login.css';

/* ─── mode toggle ─────────────────────────────────────────── */
const MODES = { login: 'login', register: 'register' };

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState(MODES.login);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /* ─── login form ──────────────────────────────────────────── */
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  /* ─── register form ───────────────────────────────────────── */
  const [regForm, setRegForm] = useState({
    fullName: '',
    email: '',
    password: '',
    semesterId: '',
  });
  const [semesters, setSemesters] = useState([]);
  const [semestersLoading, setSemestersLoading] = useState(false);

  /* ─── handlers ────────────────────────────────────────────── */
  const switchMode = (m) => { setMode(m); setError(''); setSuccess(''); };

  useEffect(() => {
    if (mode !== MODES.register || semesters.length > 0) return;
    let mounted = true;
    setSemestersLoading(true);
    api.getCatalogs()
      .then((catalogs) => { if (mounted) setSemesters(catalogs.semesters || []); })
      .catch(() => { if (mounted) setError('No fue posible cargar los semestres académicos.'); })
      .finally(() => { if (mounted) setSemestersLoading(false); });
    return () => { mounted = false; };
  }, [mode, semesters.length]);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(loginForm.email, loginForm.password);
      navigate('/dashboard');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    if (!regForm.semesterId) {
      setError('Selecciona tu semestre académico.');
      setLoading(false);
      return;
    }
    try {
      await register({
        fullName: regForm.fullName,
        email: regForm.email,
        password: regForm.password,
        semesterId: regForm.semesterId,
      });
      navigate('/dashboard');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const setReg = (key) => (e) => setRegForm((p) => ({ ...p, [key]: e.target.value }));
  const setLog = (key) => (e) => setLoginForm((p) => ({ ...p, [key]: e.target.value }));

  /* ─── render ──────────────────────────────────────────────── */
  return (
    <>
      <div className="login-page">
        {/* LEFT PANEL */}
        <div className="login-left">
          <div className="login-left-content">
            <div className="login-logo-container">
              <img src="/Escudos.png" alt="Logo UCESMAG" className="login-logo-img" />
            </div>
            <h1 className="login-headline">Gestión de Proyectos de Grado</h1>
            <p className="login-tagline">
              Centraliza, comparte y consulta los trabajos de grado de todas las facultades.
            </p>
            <div className="login-note">
              <span className="login-note-pill">UCESMAG</span>
              <p className="login-note-text">
                La información se conecta directamente con la base de datos institucional BaseDatosGrado.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="login-right">
          <div className="login-form-wrap">

            {/* TAB SWITCHER */}
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab ${mode === MODES.login ? 'auth-tab--active' : ''}`}
                onClick={() => switchMode(MODES.login)}
              >
                <LogIn size={15} />
                Iniciar sesión
              </button>
              <button
                type="button"
                className={`auth-tab ${mode === MODES.register ? 'auth-tab--active' : ''}`}
                onClick={() => switchMode(MODES.register)}
              >
                <UserPlus size={15} />
                Registrarse
              </button>
              <div className={`auth-tab-indicator ${mode === MODES.register ? 'auth-tab-indicator--right' : ''}`} />
            </div>

            {/* HEADER */}
            <div className="login-form-header">
              <h2 className="login-form-title">
                {mode === MODES.login ? 'Bienvenido de nuevo' : 'Crear cuenta'}
              </h2>
              <p className="login-form-sub">
                {mode === MODES.login
                  ? 'Accede con tus credenciales institucionales.'
                  : 'Completa los datos para registrarte como estudiante.'}
              </p>
            </div>

            {/* Avisos. El componente Alert lleva role="alert" en los errores y
                aria-live="polite" en los exitos: antes, quien usa lector de
                pantalla escribia mal la contrasena y no recibia ninguna senal
                de que hubiera fallado nada. */}
            {error && <Alert type="error">{error}</Alert>}
            {success && <Alert type="success">{success}</Alert>}

            {/* ── LOGIN FORM ── */}
            {mode === MODES.login && (
              <form onSubmit={handleLogin} className="login-form">
                <FormField label="Correo institucional" required>
                  {(props) => (
                    <input
                      {...props}
                      type="email" autoFocus
                      value={loginForm.email}
                      onChange={setLog('email')}
                      placeholder="usuario@universidad.edu.co"
                      autoComplete="email"
                    />
                  )}
                </FormField>

                <FormField label="Contraseña" required>
                  {(props) => (
                    <div className="ui-field-adorned">
                      <input
                        {...props}
                        type={showPass ? 'text' : 'password'}
                        value={loginForm.password}
                        onChange={setLog('password')}
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className="ui-field-adornment"
                        onClick={() => setShowPass((p) => !p)}
                        aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        aria-pressed={showPass}
                      >
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  )}
                </FormField>

                <Button type="submit" loading={loading} fullWidth size="lg">
                  {loading ? 'Ingresando...' : 'Ingresar'}
                </Button>
                <p className="login-switch-hint">
                  ¿No tienes cuenta?{' '}
                  <button type="button" className="link-btn" onClick={() => switchMode(MODES.register)}>
                    Regístrate aquí
                  </button>
                </p>
              </form>
            )}

            {/* ── REGISTER FORM ── */}
            {mode === MODES.register && (
              <form onSubmit={handleRegister} className="login-form">

                <FormField label="Nombre completo" required>
                  {(props) => (
                    <input
                      {...props}
                      type="text" autoFocus
                      value={regForm.fullName}
                      onChange={setReg('fullName')}
                      placeholder="Ej: María Pérez González"
                      minLength={3}
                      autoComplete="name"
                    />
                  )}
                </FormField>

                <FormField label="Correo electrónico" required>
                  {(props) => (
                    <input
                      {...props}
                      type="email"
                      value={regForm.email}
                      onChange={setReg('email')}
                      placeholder="usuario@universidad.edu.co"
                      autoComplete="email"
                    />
                  )}
                </FormField>

                <FormField label="Contraseña" required hint="Mínimo 8 caracteres.">
                  {(props) => (
                    <div className="ui-field-adorned">
                      <input
                        {...props}
                        type={showPass ? 'text' : 'password'}
                        value={regForm.password}
                        onChange={setReg('password')}
                        placeholder="Mínimo 8 caracteres"
                        minLength={8}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="ui-field-adornment"
                        onClick={() => setShowPass((p) => !p)}
                        aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        aria-pressed={showPass}
                      >
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  )}
                </FormField>

                <FormField label="Semestre académico" required>
                  {(props) => (
                    <select
                      {...props}
                      value={regForm.semesterId}
                      onChange={setReg('semesterId')}
                      disabled={semestersLoading}
                    >
                      <option value="">{semestersLoading ? 'Cargando semestres...' : 'Selecciona tu semestre'}</option>
                      {semesters.map((semester) => (
                        <option key={semester.semester_id} value={semester.semester_id}>
                          {semester.semester_number}° semestre
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>

                {/* Nota: rol asignado automáticamente */}
                <div className="reg-role-note">
                  <span className="reg-role-pill">Rol: Estudiante</span>
                  <span>asignado automáticamente al crear tu cuenta.</span>
                </div>

                <Button type="submit" loading={loading} fullWidth size="lg">
                  {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                </Button>

                <p className="login-switch-hint">
                  ¿Ya tienes cuenta?{' '}
                  <button type="button" className="link-btn" onClick={() => switchMode(MODES.login)}>
                    Inicia sesión
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
