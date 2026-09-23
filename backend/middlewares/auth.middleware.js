/**
 * AUTENTICACIÓN Y AUTORIZACIÓN (MIDDLEWARE DE EXPRESS)
 * UNIVERSIDAD CESMAG
 *
 * Este archivo es el punto donde el sistema deja de creerse la identidad que
 * le envía el cliente. Hasta ahora cada handler leía `userId`, `adminUserId`,
 * `userRole` o la cabecera `x-user-id` del propio request: cualquiera con
 * `curl` podía declararse administrador. A partir de aquí la identidad sale
 * del token firmado y solo de ahí.
 *
 * Se aplica en los routers, no dentro de los handlers, para que ningún endpoint
 * nuevo pueda quedarse sin protección por descuido.
 */
import { verifySessionToken } from '../utils/token.js';
import { assertAdminGeneral } from './adminGeneral.middleware.js';
import pool from '../config/db.js';

/** Extrae el token del encabezado `Authorization: Bearer <token>`. */
function extractToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function userFromPayload(payload) {
  return {
    id: String(payload.sub),
    email: payload.email || null,
    role: (payload.role || '').toLowerCase(),
    roleId: payload.roleId ?? null,
    programId: payload.programId ?? null,
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
  };
}

/**
 * Sustituye por la identidad verificada cualquier identidad que el cliente
 * haya escrito en la petición.
 *
 * Es la pieza que hace segura la migración sin reescribir los diez
 * controladores de golpe: los handlers antiguos siguen leyendo `adminUserId` o
 * `x-user-id` como siempre, pero lo que encuentran ahí ya no es lo que mandó el
 * cliente, sino lo que dice el token. Un `userRole` declarado por el cliente se
 * elimina, porque `projectBank` lo usaba como respaldo cuando no encontraba al
 * usuario (escalada de privilegios de la §5.5 de la auditoría).
 *
 * `req.query` en Express 5 es un getter que reconstruye el objeto en cada
 * lectura, así que no basta con asignar una propiedad: hay que sustituir la
 * propiedad entera sobre el request.
 */
function stampVerifiedIdentity(req) {
  const id = req.user.id;

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    req.body.adminUserId = id;
    if ('userId' in req.body) req.body.userId = id;
    if ('studentId' in req.body) req.body.studentId = id;
    delete req.body.userRole;
  }

  const query = { ...req.query, adminUserId: id };
  if ('userId' in query) query.userId = id;
  delete query.userRole;
  Object.defineProperty(req, 'query', {
    value: query, writable: true, configurable: true, enumerable: true,
  });

  req.headers['x-user-id'] = id;
  delete req.headers['x-user-role'];
}

/**
 * Identificador de quien hace la petición, según el token.
 *
 * Es la forma correcta de responder a "¿quién está pidiendo esto?". Sustituye a
 * `req.body.userId`, `req.query.adminUserId` y `req.headers['x-user-id']`, que
 * eran datos que escribía el propio cliente.
 */
export function actorId(req) {
  return req.user?.id ?? null;
}

/** Exige sesión válida. Deja la identidad verificada en `req.user`. */
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión para realizar esta acción.' });
  }

  try {
    req.user = userFromPayload(verifySessionToken(token));
  } catch (err) {
    const expirada = err?.name === 'TokenExpiredError';
    return res.status(401).json({
      error: expirada
        ? 'Tu sesión ha expirado. Vuelve a iniciar sesión.'
        : 'Sesión inválida. Vuelve a iniciar sesión.',
      code: expirada ? 'SESSION_EXPIRED' : 'SESSION_INVALID',
    });
  }

  stampVerifiedIdentity(req);
  return next();
}

/**
 * Reconoce la sesión si viene, pero no la exige.
 *
 * Lo usa `/catalogs`, que el formulario de registro necesita consultar antes de
 * tener sesión; el controlador decide qué parte del catálogo es pública.
 */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();

  try {
    req.user = userFromPayload(verifySessionToken(token));
    stampVerifiedIdentity(req);
  } catch {
    // Un token inválido en un endpoint público se trata como visitante anónimo.
  }
  return next();
}

/** Exige que el rol del token esté entre los indicados. */
export function requireRole(...roles) {
  const permitidos = roles.map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Debes iniciar sesión para realizar esta acción.' });
    }
    if (!permitidos.some((rol) => req.user.role.includes(rol))) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción.' });
    }
    return next();
  };
}

/**
 * Exige rol de Administrador General, comprobándolo contra la base de datos.
 *
 * No se conforma con el rol que lleva el token: si a alguien se le retira el rol
 * mientras tiene la sesión abierta, debe perder el acceso en la siguiente
 * petición, no cuando caduque el token.
 */
export async function requireAdminGeneral(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Debes iniciar sesión para realizar esta acción.' });
  }
  try {
    if (!(await assertAdminGeneral(pool, req.user.id))) {
      return res.status(403).json({
        error: 'Acceso denegado. Se requieren permisos de Administrador General del Sistema.',
      });
    }
    return next();
  } catch (err) {
    console.error('Error al verificar permisos de administración:', err);
    return res.status(500).json({ error: 'Error al verificar permisos.' });
  }
}
