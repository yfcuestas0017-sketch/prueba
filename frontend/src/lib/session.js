/**
 * ALMACÉN DE LA SESIÓN EN EL NAVEGADOR
 * UNIVERSIDAD CESMAG
 *
 * Un único sitio donde se guardan el token y el usuario, para que el cliente
 * HTTP (`api.js`) y el contexto de autenticación (`AuthContext.jsx`) compartan
 * la sesión sin importarse el uno al otro.
 *
 * Qué cambió y por qué: antes se guardaba solo el objeto de usuario, sin firma
 * de ningún tipo, y el servidor se creía lo que ese objeto dijera. Bastaba con
 * editar `role` en las DevTools para entrar al panel de administración. Ahora
 * lo que autoriza es el token, que el navegador puede leer pero no falsificar;
 * el objeto de usuario se conserva únicamente para pintar la interfaz sin
 * esperar a una petición.
 */
const CLAVE_USUARIO = 'gradohub_user';
const CLAVE_TOKEN = 'gradohub_token';

export function getToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const crudo = localStorage.getItem(CLAVE_USUARIO);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

export function saveSession(user, token) {
  try {
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(user));
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
  } catch {
    // Modo privado o almacenamiento lleno: la sesión vivirá solo en memoria.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(CLAVE_USUARIO);
    localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    // Nada que limpiar.
  }
}

/**
 * Aviso de que el servidor ha rechazado la sesión (token caducado o inválido).
 *
 * `api.js` lo dispara y `AuthContext` lo escucha para cerrar sesión en toda la
 * aplicación a la vez, en lugar de dejar pantallas a medias con errores sueltos.
 */
export const EVENTO_SESION_EXPIRADA = 'gradohub:sesion-expirada';

export function notifySessionExpired() {
  clearSession();
  window.dispatchEvent(new CustomEvent(EVENTO_SESION_EXPIRADA));
}
