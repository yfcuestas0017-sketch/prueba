import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, GraduationCap, BookOpen, CheckCircle2, KeyRound, ArrowLeft, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { Button, FormField, Alert, Modal } from '../../components/ui';
import './Login.css';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  /* Modal de Recuperación de Contraseña */
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  if (user) return <Navigate to="/dashboard" replace />;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(loginForm.email, loginForm.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión. Verifica tus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotEmail.trim()) {
      setForgotError('Ingresa tu correo institucional.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await api.forgotPassword(forgotEmail.trim());
      setForgotSuccess(res.message || 'Si tu correo coincide con una cuenta activa, recibirás un enlace de recuperación en breve.');
    } catch (err) {
      setForgotError(err.message || 'No fue posible procesar la solicitud.');
    } finally {
      setForgotLoading(false);
    }
  };

  const openForgotModal = () => {
    setForgotEmail(loginForm.email || '');
    setForgotError('');
    setForgotSuccess('');
    setForgotModalOpen(true);
  };

  const closeForgotModal = () => {
    setForgotModalOpen(false);
    setForgotError('');
    setForgotSuccess('');
  };

  const setLog = (key) => (e) => setLoginForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="login-page">
      {/* ── LEFT PANEL (Hero Institucional) ── */}
      <div className="login-left">
        <div className="login-left-backdrop" />
        <div className="login-left-content">
          <div className="login-logo-container">
            <img src="/Escudos.png" alt="Logo Universidad CESMAG" className="login-logo-img" />
          </div>

          <div className="login-badge-pill">
            <GraduationCap size={15} />
            <span>Facultad de Ingeniería · GradoHub</span>
          </div>

          <h1 className="login-headline">
            Gestión y Trazabilidad de Trabajos de Grado
          </h1>

          <p className="login-tagline">
            Plataforma centralizada para la administración, seguimiento por fases y evaluación académica de los proyectos de grado institucionales.
          </p>

          <div className="login-features-list">
            <div className="login-feature-item">
              <CheckCircle2 size={16} className="login-feature-icon" />
              <span>Flujo continuo desde anteproyecto hasta sustentación</span>
            </div>
            <div className="login-feature-item">
              <BookOpen size={16} className="login-feature-icon" />
              <span>Reglamento institucional integrado (Acuerdo 105)</span>
            </div>
            <div className="login-feature-item">
              <ShieldCheck size={16} className="login-feature-icon" />
              <span>Control de acceso seguro por roles y auditoría</span>
            </div>
          </div>

          <div className="login-note">
            <div className="login-note-header">
              <span className="login-note-pill">UCESMAG</span>
              <span className="login-note-sub">BaseDatosGrado</span>
            </div>
            <p className="login-note-text">
              Sistema conectado a la infraestructura de datos institucional de la Universidad CESMAG.
            </p>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL (Formulario de Acceso) ── */}
      <div className="login-right">
        <div className="login-card-container">
          <div className="login-form-wrap">
            {/* Encabezado del Formulario */}
            <div className="login-form-header">
              <div className="login-header-chip">
                <Lock size={13} />
                <span>Portal Seguro</span>
              </div>
              <h2 className="login-form-title">Iniciar Sesión</h2>
              <p className="login-form-sub">
                Ingresa tus credenciales institucionales para acceder a tu panel académico.
              </p>
            </div>

            {/* Avisos y Alertas */}
            {error && <Alert type="error">{error}</Alert>}

            {/* Formulario */}
            <form onSubmit={handleLogin} className="login-form">
              <FormField label="Correo institucional" required>
                {(props) => (
                  <div className="login-input-wrapper">
                    <Mail size={17} className="login-input-icon" />
                    <input
                      {...props}
                      type="email"
                      autoFocus
                      value={loginForm.email}
                      onChange={setLog('email')}
                      placeholder="usuario@unicesmag.edu.co"
                      autoComplete="email"
                      required
                      className="login-input-field"
                    />
                  </div>
                )}
              </FormField>

              <FormField label="Contraseña" required>
                {(props) => (
                  <div className="login-input-wrapper">
                    <Lock size={17} className="login-input-icon" />
                    <input
                      {...props}
                      type={showPass ? 'text' : 'password'}
                      value={loginForm.password}
                      onChange={setLog('password')}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      className="login-input-field login-input-pass"
                    />
                    <button
                      type="button"
                      className="login-pass-toggle"
                      onClick={() => setShowPass((p) => !p)}
                      aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      aria-pressed={showPass}
                    >
                      {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                )}
              </FormField>

              <div className="login-row-options">
                <button
                  type="button"
                  className="login-forgot-link"
                  onClick={openForgotModal}
                >
                  <KeyRound size={14} />
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              <Button type="submit" loading={loading} fullWidth size="lg" className="login-submit-btn">
                {loading ? 'Validando credenciales...' : 'Ingresar a la Plataforma'}
              </Button>

              <div className="login-security-card">
                <ShieldCheck size={16} className="login-security-icon" />
                <div className="login-security-info">
                  <strong>Acceso Restringido</strong>
                  <p>La creación y parametrización de cuentas de estudiantes y docentes es administrada por la dirección del programa.</p>
                </div>
              </div>
            </form>

            <div className="login-footer">
              <span>Universidad CESMAG · San Juan de Pasto</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL: RECUPERAR CONTRASEÑA ── */}
      <Modal
        open={forgotModalOpen}
        onClose={closeForgotModal}
        title="Recuperación de Contraseña"
        size="md"
      >
        <div className="forgot-modal-content">
          {!forgotSuccess ? (
            <form onSubmit={handleForgotPassword} className="forgot-form">
              <div className="forgot-modal-banner">
                <KeyRound size={22} className="forgot-banner-icon" />
                <p>
                  Ingresa el correo institucional asociado a tu cuenta. Te enviaremos un enlace seguro con vigencia de <strong>30 minutos</strong> para restablecer tu clave.
                </p>
              </div>

              {forgotError && <Alert type="error">{forgotError}</Alert>}

              <FormField label="Correo institucional" required>
                {(props) => (
                  <div className="login-input-wrapper">
                    <Mail size={17} className="login-input-icon" />
                    <input
                      {...props}
                      type="email"
                      autoFocus
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="ejemplo@unicesmag.edu.co"
                      required
                      className="login-input-field"
                    />
                  </div>
                )}
              </FormField>

              <div className="forgot-modal-actions">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeForgotModal}
                  disabled={forgotLoading}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  loading={forgotLoading}
                  className="forgot-submit-btn"
                >
                  <Send size={15} style={{ marginRight: 6 }} />
                  {forgotLoading ? 'Enviando enlace...' : 'Enviar enlace de recuperación'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="forgot-success-box">
              <div className="forgot-success-icon">
                <CheckCircle2 size={36} />
              </div>
              <h3 className="forgot-success-title">¡Correo enviado!</h3>
              <p className="forgot-success-text">
                Se envió un correo de recuperación de contraseña al correo registrado:
              </p>
              <p className="forgot-success-email">{forgotEmail.trim()}</p>
              <p className="forgot-success-text">
                Abre el mensaje y haz clic en <strong>«Restablecer mi contraseña»</strong>. El enlace es de un solo uso y vence en 30 minutos.
              </p>
              <div className="forgot-success-hint">
                💡 <em>Por favor revisa tu bandeja de entrada o carpeta de correo no deseado (Spam).</em>
              </div>
              <Button
                onClick={closeForgotModal}
                fullWidth
                size="md"
                className="forgot-submit-btn"
              >
                Entendido y Cerrar
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
