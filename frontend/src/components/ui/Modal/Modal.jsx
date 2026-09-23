import { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

const FOCUSABLES = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * VENTANA MODAL
 *
 * La aplicación tenía cinco implementaciones distintas de modal, con z-index
 * que iban de 200 a 9999 sin ningún criterio, y ninguna de las cinco atrapaba
 * el foco. Eso significa que al abrir un modal y pulsar Tab, el foco se escapa
 * a la página de detrás: quien navega con teclado o con lector de pantalla
 * acaba rellenando un formulario que no ve.
 *
 * Esta versión hace las cuatro cosas que un modal accesible debe hacer:
 *   - anunciarse como diálogo (role, aria-modal, título asociado),
 *   - cerrarse con Escape,
 *   - mantener el foco dentro mientras está abierto,
 *   - devolver el foco al elemento que lo abrió al cerrarse.
 *
 * Y usa z-index: var(--z-modal), un único valor para todos.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',          // sm | md | lg
  footer,
  closeOnBackdrop = true,
  children,
}) {
  const panelRef = useRef(null);
  const tituloId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`).current;

  const alPulsarTecla = useCallback((evento) => {
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      onClose?.();
      return;
    }

    if (evento.key !== 'Tab') return;

    const enfocables = panelRef.current?.querySelectorAll(FOCUSABLES);
    if (!enfocables || enfocables.length === 0) return;

    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];

    // El ciclo se cierra sobre sí mismo: del último se vuelve al primero y al
    // revés, en lugar de salir al documento de detrás.
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const elementoPrevio = document.activeElement;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // El primer control del modal recibe el foco; si no hay ninguno, lo recibe
    // el propio panel, que por eso lleva tabIndex={-1}.
    const enfocables = panelRef.current?.querySelectorAll(FOCUSABLES);
    (enfocables?.[0] || panelRef.current)?.focus();

    document.addEventListener('keydown', alPulsarTecla, true);

    return () => {
      document.removeEventListener('keydown', alPulsarTecla, true);
      document.body.style.overflow = overflowPrevio;
      elementoPrevio?.focus?.();
    };
  }, [open, alPulsarTecla]);

  if (!open) return null;

  return (
    <div
      className="ui-modal-backdrop"
      onMouseDown={(evento) => {
        // onMouseDown y no onClick: si se empieza a arrastrar dentro del panel
        // y se suelta fuera, el modal no debe cerrarse.
        if (closeOnBackdrop && evento.target === evento.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        className={`ui-modal ui-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? tituloId : undefined}
        aria-label={title ? undefined : 'Ventana de diálogo'}
        tabIndex={-1}
      >
        {(title || onClose) && (
          <header className="ui-modal-header">
            <div>
              {title && <h2 className="ui-modal-title" id={tituloId}>{title}</h2>}
              {description && <p className="ui-modal-description">{description}</p>}
            </div>
            {onClose && (
              <button
                type="button"
                className="ui-modal-close"
                onClick={onClose}
                aria-label="Cerrar ventana"
              >
                <X size={18} />
              </button>
            )}
          </header>
        )}

        <div className="ui-modal-body">{children}</div>

        {footer && <footer className="ui-modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
