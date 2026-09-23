/**
 * VALORES SEGUROS PARA INCRUSTAR EN SQL
 * UNIVERSIDAD CESMAG
 *
 * Lo correcto es siempre el parámetro posicional (`$1`, `$2`), y así está
 * escrito el 95% del backend. El Chatbook es la excepción: arma sus consultas
 * por fragmentos que se combinan de formas distintas según la pregunta, y
 * renumerar los parámetros de cada combinación sería más frágil que el problema
 * que resuelve.
 *
 * Para esos fragmentos existe esta función. No "escapa" nada —escapar a mano es
 * precisamente lo que sale mal—: comprueba que el valor sea un entero positivo
 * y, si no lo es, devuelve null para que el fragmento entero se omita. Un
 * entero validado no puede contener SQL.
 */
export function enteroSeguro(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0 || numero > Number.MAX_SAFE_INTEGER) return null;
  return numero;
}
