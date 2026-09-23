/**
 * ERRORES DE DOMINIO CON SEMÁNTICA HTTP
 * UNIVERSIDAD CESMAG
 *
 * Permite que la lógica de negocio aborte una operación indicando *por qué*
 * (403 sin permisos, 404 no existe, 400 datos inválidos) sin tener que conocer
 * el objeto `res` de Express ni depender de él.
 *
 * Esto es lo que hace posible usar `withTransaction`: dentro de una transacción
 * no se puede "retornar" un error, hay que lanzarlo para que se revierta. Antes
 * cada control previo hacía `await client.query('ROLLBACK')` a mano y devolvía
 * la respuesta; si alguien olvidaba el ROLLBACK, la transacción quedaba abierta.
 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Traduce un error a respuesta HTTP.
 *
 * - Si es un HttpError, respeta su código y su mensaje (son mensajes escritos
 *   para la persona que usa el sistema).
 * - Si es cualquier otra cosa, es un fallo no previsto: se registra completo en
 *   el servidor y al cliente se le devuelve un 500 con un texto genérico, sin
 *   filtrar detalles internos de la base de datos.
 */
export function sendError(res, err, logLabel, fallbackMessage) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  // El identificador de la petición lo pone `asignarIdPeticion` y Express deja
  // el request accesible desde la respuesta, así que no hace falta cambiar las
  // decenas de sitios que ya llaman a esta función para que el log y la
  // respuesta compartan el mismo código de correlación.
  const id = res.req?.id || 'sin-id';
  console.error(`[${id}] ${logLabel}`, err);
  return res.status(500).json({ error: fallbackMessage, errorId: id });
}
