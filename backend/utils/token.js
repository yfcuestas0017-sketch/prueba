/**
 * EMISIÓN Y VERIFICACIÓN DE TOKENS DE SESIÓN (JWT)
 * UNIVERSIDAD CESMAG
 *
 * El sistema no tenía sesiones: el login devolvía un objeto de usuario plano y
 * cada endpoint creía la identidad que le enviaba el cliente (`userId`,
 * `adminUserId`, `x-user-id`). Eso convertía el RBAC en decorativo, porque
 * bastaba con escribir otro identificador en la petición.
 *
 * A partir de aquí la identidad viaja firmada por el servidor. El cliente puede
 * leer el token, pero no puede fabricar uno ni alterar su contenido sin invalidar
 * la firma, porque no conoce JWT_SECRET.
 *
 * El secreto NO tiene valor por defecto a propósito: un valor por defecto en el
 * código fuente es exactamente el problema que este módulo viene a resolver.
 */
import jwt from 'jsonwebtoken';

/** Duración de la sesión. Se puede ajustar con JWT_EXPIRES_IN. */
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET no está definida o es demasiado corta (mínimo 32 caracteres). ' +
      'Genera una con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))" ' +
      'y añádela a .env.local',
    );
  }
  return secret;
}

/**
 * Firma el token de sesión.
 *
 * El contenido es un retrato del usuario en el momento de iniciar sesión, útil
 * para evitar consultas repetidas. Las decisiones de autorización realmente
 * sensibles (administración general) vuelven a comprobarse contra la base de
 * datos en cada petición, porque un rol puede revocarse mientras la sesión sigue
 * abierta.
 */
export function signSessionToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: user.role,
      roleId: user.roleId ?? null,
      programId: user.programId ?? null,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    },
    getJwtSecret(),
    { expiresIn: EXPIRES_IN, issuer: 'gradohub' },
  );
}

/** Devuelve el contenido del token o lanza si la firma o la vigencia fallan. */
export function verifySessionToken(token) {
  return jwt.verify(token, getJwtSecret(), { issuer: 'gradohub' });
}

export { EXPIRES_IN as SESSION_EXPIRES_IN };
