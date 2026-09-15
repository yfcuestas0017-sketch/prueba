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

// "Administrador de Programa" reutiliza el rol "Administrador" (sin la
// palabra "general") que se le asigna, además de "Docente", a un docente
// promovido desde Administración General.
const PROGRAM_ADMIN_ROLE_NAMES = [
  'administrador',
  'admin',
  'administrador de programa',
  'admin de programa',
  'administrador del programa',
];

const DOCENTE_ROLE_NAMES = ['docente', 'profesor'];

export function normalizeRoleName(role) {
  return (role || '').toString().trim().toLowerCase();
}

export function isGeneralAdminRoleName(role) {
  return GENERAL_ADMIN_ROLE_NAMES.includes(normalizeRoleName(role));
}

export function isProgramAdminRoleName(role) {
  return PROGRAM_ADMIN_ROLE_NAMES.includes(normalizeRoleName(role));
}

export function isDocenteRoleName(role) {
  return DOCENTE_ROLE_NAMES.includes(normalizeRoleName(role));
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
