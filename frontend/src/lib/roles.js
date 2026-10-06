/**
 * Utilidades centralizadas para detección de roles.
 *
 * Antes existían varias copias (ligeramente distintas) de esta misma lógica
 * repartidas en ProtectedRoute, Sidebar, ProgramFilterContext y
 * BancoProyectos, lo que provocaba inconsistencias: por ejemplo, el
 * "Administrador General" quedaba fuera del grupo "isAdmin" en algunas
 * pantallas. Este archivo centraliza esa lógica para que todo el frontend
 * la use de la misma forma.
 */

const GENERAL_ADMIN_ROLE_NAMES = [
  'administrador general',
  'admin general',
  'administrador general del sistema',
];

// "Administrador de Programa" incluye 'Administrador programa', 'Administrador',
// 'Administrador de programa', etc. Cualquier rol administrativo que no sea general.
const PROGRAM_ADMIN_ROLE_NAMES = [
  'administrador',
  'admin',
  'administrador programa',
  'admin programa',
  'administrador de programa',
  'admin de programa',
  'administrador del programa',
  'admin del programa',
];

const DOCENTE_ROLE_NAMES = ['docente', 'profesor'];

export function normalizeRoleName(role) {
  return (role || '').toString().trim().toLowerCase();
}

export function isGeneralAdminRoleName(role) {
  const n = normalizeRoleName(role);
  if (!n) return false;
  return (
    GENERAL_ADMIN_ROLE_NAMES.includes(n) ||
    n.includes('administrador general') ||
    n.includes('admin general')
  );
}

export function isProgramAdminRoleName(role) {
  const n = normalizeRoleName(role);
  if (!n) return false;
  if (isGeneralAdminRoleName(n)) return false;
  return (
    PROGRAM_ADMIN_ROLE_NAMES.includes(n) ||
    n.includes('administrador programa') ||
    n.includes('admin programa') ||
    n.includes('administrador de programa') ||
    n.includes('admin de programa') ||
    n.includes('administrador del programa') ||
    n === 'administrador' ||
    n === 'admin' ||
    ((n.includes('administrador') || n.includes('admin')) && !n.includes('general'))
  );
}

export function isDocenteRoleName(role) {
  const n = normalizeRoleName(role);
  if (!n) return false;
  return DOCENTE_ROLE_NAMES.includes(n) || n.includes('docente') || n.includes('profesor');
}

// Un usuario puede tener múltiples roles (p. ej. Docente + Administrador
// para el "Administrador de Programa"). `user.role` trae el rol "principal"
// resuelto por el backend, y `user.roles` (si existe) trae la lista
// completa de nombres de rol. Revisamos ambos para no depender de cuál
// ganó como principal.
function matchesAnyRole(user, predicate) {
  if (!user) return false;
  if (predicate(user.role)) return true;
  if (Array.isArray(user.roles)) {
    return user.roles.some((r) => predicate(typeof r === 'string' ? r : r?.name));
  }
  return false;
}

export function userIsGeneralAdmin(user) {
  return matchesAnyRole(user, isGeneralAdminRoleName) || user?.authMode === 'local';
}

export function userIsProgramAdmin(user) {
  return matchesAnyRole(user, isProgramAdminRoleName);
}

export function userIsDocente(user) {
  return matchesAnyRole(user, isDocenteRoleName);
}

// "Cualquier tipo de administrador": general o de programa.
export function userIsAnyAdmin(user) {
  return userIsGeneralAdmin(user) || userIsProgramAdmin(user);
}

export function userIsStudent(user) {
  return !userIsAnyAdmin(user) && !userIsDocente(user);
}

export default {
  normalizeRoleName,
  isGeneralAdminRoleName,
  isProgramAdminRoleName,
  isDocenteRoleName,
  userIsGeneralAdmin,
  userIsProgramAdmin,
  userIsDocente,
  userIsAnyAdmin,
  userIsStudent,
};
