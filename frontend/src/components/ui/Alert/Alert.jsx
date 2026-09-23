import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import './Alert.css';

/**
 * AVISO DE ÉXITO, ERROR O ADVERTENCIA
 *
 * Había cinco familias de aviso, y una de ellas no respondía al tema. Pero lo
 * importante aquí no es el aspecto, sino que **nada de lo que cambiaba en
 * pantalla se anunciaba a la tecnología asistiva**: en todo el proyecto no
 * había una sola región `aria-live`. Quien usa un lector de pantalla guardaba
 * un formulario y no recibía ninguna confirmación de que se hubiera guardado.
 *
 * Por eso el tipo del aviso decide también cómo se anuncia:
 *   - error y advertencia -> role="alert" (interrumpe: hay que enterarse ya),
 *   - éxito e información -> aria-live="polite" (espera a una pausa).
 */
const CONFIGURACION = {
  success: { Icono: CheckCircle2,   rol: 'status', live: 'polite' },
  info:    { Icono: Info,           rol: 'status', live: 'polite' },
  warning: { Icono: AlertTriangle,  rol: 'alert',  live: 'assertive' },
  error:   { Icono: XCircle,        rol: 'alert',  live: 'assertive' },
};

export default function Alert({
  type = 'info',        // success | info | warning | error
  title,
  children,
  onDismiss,
  className = '',
}) {
  const { Icono, rol, live } = CONFIGURACION[type] || CONFIGURACION.info;

  return (
    <div className={`ui-alert ui-alert--${type} ${className}`.trim()} role={rol} aria-live={live}>
      <Icono size={18} className="ui-alert-icon" aria-hidden="true" />
      <div className="ui-alert-content">
        {title && <strong className="ui-alert-title">{title}</strong>}
        {children && <div className="ui-alert-text">{children}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="ui-alert-dismiss" onClick={onDismiss} aria-label="Descartar aviso">
          ×
        </button>
      )}
    </div>
  );
}
