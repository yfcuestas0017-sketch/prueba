/**
 * HELPER DE TRANSACCIONES
 * UNIVERSIDAD CESMAG
 *
 * Centraliza el ciclo connect → BEGIN → COMMIT/ROLLBACK → release que antes se
 * repetía literalmente en cada controlador que escribe en la base de datos.
 *
 * La función recibe el pool y un callback que hace el trabajo real. El callback
 * recibe el `client` de la transacción: todas las consultas que deban participar
 * de ella tienen que usar ese client, no el pool.
 *
 * Los errores se propagan tal cual (después del ROLLBACK). Traducirlos a una
 * respuesta HTTP es responsabilidad del controlador, no de esta capa.
 *
 * Uso:
 *   const nuevoRol = await withTransaction(pool, async (client) => {
 *     const { rows } = await client.query('INSERT INTO ... RETURNING *', [...]);
 *     await client.query('INSERT INTO role_permissions ...', [...]);
 *     return rows[0];
 *   });
 */
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Si el ROLLBACK también falla (conexión caída), se conserva el error
      // original, que es el que explica qué salió mal.
      console.error('Fallo el ROLLBACK de la transacción:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

export default withTransaction;
