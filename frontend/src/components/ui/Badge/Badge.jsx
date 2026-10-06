import './Badge.css';

/**
 * DISTINTIVO DE ESTADO
 *
 * Había siete familias de distintivo repartidas por la aplicación, con dos
 * verdes distintos para el mismo significado. Aquí hay un solo componente y
 * seis tonos semánticos.
 *
 * `status` traduce los estados del dominio —los de la tabla `statuses` y los
 * del Banco de Proyectos— al tono que les corresponde, para que "Aprobado" se
 * vea igual en todas las pantallas.
 */
const TONO_POR_ESTADO = {
  aprobado: 'success',
  finalizado: 'success',
  terminado: 'success',
  disponible: 'success',
  activo: 'success',
  'en desarrollo': 'info',
  'en curso': 'info',
  asignado: 'info',
  radicado: 'info',
  pendiente: 'warning',
  'en revisión': 'warning',
  'en revision': 'warning',
  rechazado: 'danger',
  cancelado: 'danger',
  inactivo: 'neutral',
};

export function toneForStatus(status) {
  return TONO_POR_ESTADO[String(status || '').trim().toLowerCase()] || 'neutral';
}

export default function Badge({
  children,
  tone,                  // neutral | info | success | warning | danger | accent
  status,
  size = 'md',           // sm | md
  className = '',
  ...props
}) {
  const tonoFinal = tone || (status ? toneForStatus(status) : 'neutral');

  return (
    <span
      className={`ui-badge ui-badge--${tonoFinal} ui-badge--${size} ${className}`.trim()}
      {...props}
    >
      {children ?? status}
    </span>
  );
}
