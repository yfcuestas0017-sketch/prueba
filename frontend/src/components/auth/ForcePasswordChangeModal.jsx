import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import api from '../../lib/api';
import './ForcePasswordChangeModal.css';

const EMPTY_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function ForcePasswordChangeModal({ onCompleted }) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.querySelector('input')?.focus();

    const keepFocusInDialog = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = dialog.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', keepFocusInDialog, true);
    return () => {
      document.removeEventListener('keydown', keepFocusInDialog, true);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    if (error) setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    const currentPassword = form.currentPassword.trim();
    const newPassword = form.newPassword.trim();
    const confirmPassword = form.confirmPassword.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Completa los tres campos para continuar.');
      return;
    }
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('La nueva contraseña debe ser diferente de la actual.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }

    setSaving(true);
    try {
      const response = await api.changePassword(currentPassword, newPassword);
      if (!response.token) {
        throw new Error('La contraseña se cambió, pero no se pudo renovar la sesión. Inicia sesión nuevamente.');
      }
      onCompleted(response.token);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'currentPassword', label: 'Contraseña actual', visibilityKey: 'current', autoComplete: 'current-password' },
    { key: 'newPassword', label: 'Nueva contraseña', visibilityKey: 'next', autoComplete: 'new-password' },
    { key: 'confirmPassword', label: 'Confirmar nueva contraseña', visibilityKey: 'confirm', autoComplete: 'new-password' },
  ];

  return (
    <div className="force-password-backdrop">
      <section
        ref={dialogRef}
        className="force-password-card"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="force-password-title"
        aria-describedby="force-password-description"
      >
        <div className="force-password-crest" aria-hidden="true">
          <span className="force-password-crest-orbit" />
          <ShieldCheck size={27} strokeWidth={1.7} />
        </div>

        <p className="force-password-eyebrow">Protección de cuenta</p>
        <h1 id="force-password-title">Actualiza tu contraseña</h1>
        <p className="force-password-copy" id="force-password-description">
          Para continuar, reemplaza la contraseña inicial por una personal. Este cambio es obligatorio y solo tendrás que hacerlo una vez.
        </p>

        <form className="force-password-form" onSubmit={submit}>
          {fields.map(({ key, label, visibilityKey, autoComplete }, index) => (
            <label className="force-password-field" key={key} htmlFor={`force-password-${key}`}>
              <span className="force-password-label">
                <span className="force-password-index">0{index + 1}</span>
                {label}
              </span>
              <span className="force-password-input-wrap">
                <KeyRound className="force-password-input-icon" size={16} aria-hidden="true" />
                <input
                  id={`force-password-${key}`}
                  type={visible[visibilityKey] ? 'text' : 'password'}
                  value={form[key]}
                  onChange={updateField(key)}
                  autoComplete={autoComplete}
                  required
                  minLength={key === 'currentPassword' ? undefined : 8}
                  autoFocus={index === 0}
                  disabled={saving}
                />
                <button
                  className="force-password-visibility"
                  type="button"
                  aria-label={`${visible[visibilityKey] ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
                  onClick={() => setVisible((current) => ({ ...current, [visibilityKey]: !current[visibilityKey] }))}
                  disabled={saving}
                >
                  {visible[visibilityKey] ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
          ))}

          <p className="force-password-hint">Usa al menos 8 caracteres y evita reutilizar la contraseña inicial.</p>

          {error && (
            <p className="force-password-error" role="alert">
              {error}
            </p>
          )}

          <button className="force-password-submit" type="submit" disabled={saving}>
            {saving ? <LoaderCircle size={18} className="force-password-spinner" /> : <ShieldCheck size={18} />}
            {saving ? 'Guardando nueva contraseña…' : 'Guardar y continuar'}
          </button>
        </form>

        <div className="force-password-footnote">
          <span className="force-password-footnote-dot" />
          Sesión protegida · Universidad CESMAG
        </div>
      </section>
    </div>
  );
}
