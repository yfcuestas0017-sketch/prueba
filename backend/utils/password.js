/**
 * ALMACENAMIENTO Y VERIFICACIÓN DE CONTRASEÑAS
 * UNIVERSIDAD CESMAG
 *
 * Cumple el RNF-06 del documento de requisitos: las contraseñas se guardan
 * como hash bcrypt con sal, nunca en texto plano. Antes de este módulo el
 * login comparaba cadenas directamente y además aceptaba una equivalencia
 * entre '123456' y '12345678' que funcionaba como puerta trasera.
 *
 * MIGRACIÓN PROGRESIVA. La base de datos en producción todavía puede tener
 * filas con la contraseña en texto plano (las anteriores a este cambio). Para
 * no dejar a nadie fuera del sistema de un día para otro, `verifyPassword`
 * reconoce ese formato antiguo y avisa con `needsUpgrade`, de modo que quien
 * llama vuelve a guardar la contraseña ya hasheada. El script
 * `backend/scripts/hash_existing_passwords.js` hace lo mismo de golpe para
 * todas las filas; cuando ya no quede ninguna en texto plano conviene poner
 * LEGACY_PLAINTEXT_LOGIN=off en el entorno para cerrar esa vía por completo.
 */
import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';

/** Coste de bcrypt. 10 es el mínimo recomendado por OWASP para bcrypt. */
export const BCRYPT_ROUNDS = 10;

/** Un hash de bcrypt siempre empieza por $2a$, $2b$ o $2y$ seguido del coste. */
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;

export function isHashed(stored) {
  return typeof stored === 'string' && BCRYPT_PATTERN.test(stored);
}

export async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

/** Comparación de cadenas que no filtra información por el tiempo que tarda. */
function safeEquals(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function legacyLoginAllowed() {
  return String(process.env.LEGACY_PLAINTEXT_LOGIN || 'on').toLowerCase() !== 'off';
}

/**
 * Verifica una contraseña contra lo que hay guardado.
 *
 * Devuelve `{ valid, needsUpgrade }`:
 *   - valid: si la contraseña es correcta.
 *   - needsUpgrade: si lo guardado estaba en texto plano y hay que rehashearlo.
 */
export async function verifyPassword(plain, stored) {
  const input = String(plain ?? '');
  const saved = String(stored ?? '');

  if (!input || !saved) return { valid: false, needsUpgrade: false };

  if (isHashed(saved)) {
    return { valid: await bcrypt.compare(input, saved), needsUpgrade: false };
  }

  if (!legacyLoginAllowed()) return { valid: false, needsUpgrade: false };

  const valid = safeEquals(input.trim(), saved.trim());
  return { valid, needsUpgrade: valid };
}
