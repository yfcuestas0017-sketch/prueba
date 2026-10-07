import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowLeft, ShieldCheck, KeyRound } from 'lucide-react';
import api from '../../lib/api';
import { Button, FormField, Alert } from '../../components/ui';
import './ResetPassword.css';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [validatingToken, setValidatingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidatingToken(false);
      setTokenValid(false);
      setTokenError('No se proporcionó un token de recuperación válido en el enlace.');
      return;
    }

    let isMounted = true;
    api.validateResetToken(token)
      .then((res) => {
        if (!isMounted) return;
        setTokenValid(true);
        setUserEmail(res.email || '');
      })
      .catch((err) => {
        if (!isMounted) return;
        setTokenValid(false);
        setTokenError(err.message || 'El enlace de recuperación es inválido o ha expirado.');
      })
      .finally(() => {
        if (isMounted) setValidatingToken(false);
      });

    return () => { isMounted = false; };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (newPassword.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError('Las contraseñas no coinciden. Por favor verifícalas.');
      return;
    }

    setSubmitting(true);
    try {
      await api.resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err) {
      setFormError(err.message || 'No fue posible actualizar la contraseña.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="reset-page">
      {/* ── LEFT PANEL (Hero Institucional) ── */}
      <div className="reset-left">
        <div className="reset-left-backdrop" />
        <div className="reset-left-content">
          <div className="reset-logo-container">
            <img src="/Escudos.png" alt="Logo Universidad CESMAG" className="reset-logo-img" />
          </div>

          <div className="reset-badge-pill">
            <KeyRound size={15} />
            <span>Seguridad Institucional · GradoHub</span>
          </div>

          <h1 className="reset-headline">
            Restablecimiento Seguro de Contraseña
          </h1>

          <p className="reset-tagline">
            Genera una nueva clave de acceso para proteger tus datos académicos y el seguimiento de tus proyectos de grado.
          </p>

          <div className="reset-note">
            <div className="reset-note-header">
              <ShieldCheck size={16} className="reset-note-icon" />
              <span className="reset-note-title">Recomendaciones de Seguridad</span>
            </div>
            <ul className="reset-note-list">
              <li>Usa un mínimo de 8 caracteres.</li>
              <li>Combina letras mayúsculas, minúsculas, números y símbolos.</li>
              <li>No compartas tus credenciales con terceros.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL (Formulario / Estados) ── */}
      <div className="reset-right">
        <div className="reset-card-container">
          <div className="reset-form-wrap">
            {/* Estado: Validando token */}
            {validatingToken && (
              <div className="reset-state-box">
                <div className="reset-spinner" />
                <h3>Verificando enlace de recuperación...</h3>
                <p>Por favor espera un momento mientras validamos la autenticidad del token.</p>
              </div>
            )}

            {/* Estado: Token Inválido o Expirado */}
            {!validatingToken && !tokenValid && (
              <div className="reset-state-box reset-state-error">
                <div className="reset-icon-badge reset-icon-badge--danger">
                  <AlertCircle size={28} />
                </div>
                <h2 className="reset-state-title">Enlace no válido</h2>
                <p className="reset-state-desc">
                  {tokenError || 'Este enlace de recuperación ha expirado o ya fue utilizado.'}
                </p>
                <div className="reset-actions-group">
                  <Link to="/login" className="reset-btn-secondary">
                    <ArrowLeft size={16} />
                    Regresar al Inicio de Sesión
                  </Link>
                </div>
              </div>
            )}

            {/* Estado: Contraseña Actualizada con Éxito */}
            {!validatingToken && tokenValid && success && (
              <div className="reset-state-box reset-state-success">
                <div className="reset-icon-badge reset-icon-badge--success">
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="reset-state-title">¡Contraseña Actualizada!</h2>
                <p className="reset-state-desc">
                  Tu nueva contraseña ha sido guardada y encriptada exitosamente en la base de datos institucional. Ya puedes ingresar a GradoHub.
                </p>
                <div className="reset-actions-group">
                  <Button
                    onClick={() => navigate('/login')}
                    fullWidth
                    size="lg"
                    className="reset-submit-btn"
                  >
                    Iniciar Sesión Ahora
                  </Button>
                </div>
              </div>
            )}

            {/* Estado: Formulario Activo para ingresar nueva contraseña */}
            {!validatingToken && tokenValid && !success && (
              <>
                <div className="reset-form-header">
                  <div className="reset-header-chip">
                    <Lock size={13} />
                    <span>Actualización de Credenciales</span>
                  </div>
                  <h2 className="reset-form-title">Crea tu nueva contraseña</h2>
                  <p className="reset-form-sub">
                    Cuenta: <strong>{userEmail}</strong>
                  </p>
                </div>

                {formError && <Alert type="error">{formError}</Alert>}

                <form onSubmit={handleSubmit} className="reset-form">
                  <FormField label="Nueva contraseña" required hint="Mínimo 8 caracteres">
                    {(props) => (
                      <div className="reset-input-wrapper">
                        <Lock size={17} className="reset-input-icon" />
                        <input
                          {...props}
                          type={showPass ? 'text' : 'password'}
                          autoFocus
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Mínimo 8 caracteres"
                          autoComplete="new-password"
                          required
                          minLength={8}
                          className="reset-input-field reset-input-pass"
                        />
                        <button
                          type="button"
                          className="reset-pass-toggle"
                          onClick={() => setShowPass((p) => !p)}
                          aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        >
                          {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                    )}
                  </FormField>

                  <FormField label="Confirmar nueva contraseña" required>
                    {(props) => (
                      <div className="reset-input-wrapper">
                        <Lock size={17} className="reset-input-icon" />
                        <input
                          {...props}
                          type={showConfirmPass ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repite la nueva contraseña"
                          autoComplete="new-password"
                          required
                          minLength={8}
                          className="reset-input-field reset-input-pass"
                        />
                        <button
                          type="button"
                          className="reset-pass-toggle"
                          onClick={() => setShowConfirmPass((p) => !p)}
                          aria-label={showConfirmPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        >
                          {showConfirmPass ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                    )}
                  </FormField>

                  <Button
                    type="submit"
                    loading={submitting}
                    fullWidth
                    size="lg"
                    className="reset-submit-btn"
                  >
                    {submitting ? 'Guardando contraseña...' : 'Guardar nueva contraseña'}
                  </Button>

                  <div className="reset-back-link">
                    <Link to="/login" className="reset-link">
                      <ArrowLeft size={15} />
                      Cancelar y volver al inicio de sesión
                    </Link>
                  </div>
                </form>
              </>
            )}

            <div className="reset-footer">
              <span>Universidad CESMAG · GradoHub Seguridad</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
