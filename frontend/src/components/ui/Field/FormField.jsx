import { useId } from 'react';
import './Field.css';

/**
 * CAMPO DE FORMULARIO CON ETIQUETA ASOCIADA
 *
 * Resuelve de una vez dos problemas distintos que el informe de frontend
 * señalaba por separado:
 *
 *  1. La altura. Había siete familias de campo de texto, de 33px a 41px según
 *     la pantalla. Todo lo que pase por aquí mide --control-h-md.
 *
 *  2. La etiqueta. De 80 `<label>` del proyecto, solo 11 tenían `htmlFor`: los
 *     otros 69 eran hermanos del campo, sin ninguna relación programática, así
 *     que un lector de pantalla no anuncia para qué sirve el campo al recibir
 *     el foco (incumple WCAG 1.3.1 y 4.1.2). `useId` genera el identificador y
 *     lo entrega al hijo, de modo que **es imposible olvidarse de asociarlos**.
 *
 * Se usa con una función como hijo, que recibe las propiedades ya calculadas:
 *
 *   <FormField label="Correo" error={error} required>
 *     {(props) => <input type="email" {...props} value={v} onChange={...} />}
 *   </FormField>
 */
export default function FormField({
  label,
  hint,
  error,
  required = false,
  className = '',
  children,
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  const propiedadesDelControl = {
    id,
    className: 'ui-field-control',
    'aria-describedby': describedBy,
    'aria-invalid': error ? 'true' : undefined,
    required: required || undefined,
  };

  return (
    <div className={`ui-field ${className}`.trim()}>
      {label && (
        <label className="ui-field-label" htmlFor={id}>
          {label}
          {required && <span className="ui-field-required" aria-hidden="true">*</span>}
        </label>
      )}

      {typeof children === 'function' ? children(propiedadesDelControl) : children}

      {hint && <p className="ui-field-hint" id={hintId}>{hint}</p>}

      {/* role="alert" hace que el lector de pantalla anuncie el error en cuanto
          aparece, sin esperar a que el usuario navegue hasta él. */}
      {error && <p className="ui-field-error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}
