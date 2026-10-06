/**
 * PUNTO DE ENTRADA DEL SISTEMA DE DISEÑO
 *
 * Un solo sitio del que importar, para que en las pantallas se lea
 * `import { Button, FormField, Modal } from '../../components/ui'` en vez de
 * tres rutas relativas distintas.
 */
export { default as Button } from './Button';
export { default as Card, CardHeader, StatCard } from './Card';
export { default as FormField } from './Field';
export { default as Modal } from './Modal';
export { default as Badge, toneForStatus } from './Badge';
export { default as Alert } from './Alert';
export { default as ErrorBoundary } from './ErrorBoundary';
