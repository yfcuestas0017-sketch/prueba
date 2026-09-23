/**
 * MANEJO CENTRAL DE ERRORES
 * UNIVERSIDAD CESMAG
 *
 * Hasta aquí no había ninguno. Las consecuencias eran tres:
 *
 *  - Un fallo no previsto dentro de un handler llegaba al manejador por defecto
 *    de Express, que responde una **página HTML con la traza de pila**. A un
 *    cliente que espera JSON eso le llega como "Unexpected token < in JSON",
 *    y de paso publica la estructura interna del servidor.
 *  - Una ruta inexistente bajo /api devolvía esa misma página HTML en vez de un
 *    404 en JSON.
 *  - Cada controlador registraba el error a su manera, sin nada que permitiera
 *    relacionar lo que vio la usuaria con lo que quedó en el log.
 *
 * Eso último es lo que resuelve el identificador de correlación: la respuesta
 * lleva un `errorId` corto, el log lleva el mismo, y con él se encuentra en el
 * servidor el detalle completo de un error que alguien reporta por teléfono.
 */
import { randomUUID } from 'crypto';
import { HttpError } from '../utils/httpError.js';

/**
 * Asigna un identificador corto a cada petición.
 *
 * Va lo más arriba posible de la cadena para que cualquier cosa que ocurra
 * después pueda referirse a él. Se devuelve también como cabecera, de modo que
 * se puede leer desde las herramientas del navegador.
 */
export function asignarIdPeticion(req, res, next) {
  req.id = randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  next();
}

/** Cualquier ruta de la API que no exista. Debe registrarse la última. */
export function rutaNoEncontrada(req, res) {
  res.status(404).json({
    error: `No existe el recurso solicitado: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Traduce cualquier error a una respuesta JSON.
 *
 * Express 5 encamina aquí también los rechazos de promesa de los handlers
 * `async`, cosa que Express 4 no hacía: por eso este manejador es una red de
 * seguridad real y no solo un adorno.
 */
export function manejadorDeErrores(err, req, res, next) {
  // Si la respuesta ya empezó a enviarse no se puede cambiar el código de
  // estado; se delega en Express, que cerrará la conexión.
  if (res.headersSent) {
    return next(err);
  }

  const id = req.id || 'sin-id';

  // Errores de dominio: su código y su mensaje están escritos para quien usa el
  // sistema, así que se respetan tal cual.
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  // Origen rechazado por CORS. Es una decisión de seguridad, no un fallo.
  if (err?.message?.startsWith('Origen no autorizado por CORS')) {
    console.warn(`[${id}] ${err.message}`);
    return res.status(403).json({ error: 'Origen no autorizado.' });
  }

  // Errores del analizador del cuerpo de la petición. Distinguirlos importa:
  // "demasiado grande" y "JSON mal formado" son problemas de quien llama, no
  // del servidor, y devolverlos como 500 confunde a quien depura.
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El contenido enviado supera el tamaño permitido.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
  }

  // A partir de aquí es un fallo no previsto: el detalle se queda en el
  // servidor y al cliente solo le llega el identificador con el que buscarlo.
  console.error(`[${id}] ${req.method} ${req.originalUrl} — error no controlado:`, err);

  return res.status(500).json({
    error: 'Ocurrió un error inesperado en el servidor. Si el problema persiste, informa este código.',
    errorId: id,
  });
}
