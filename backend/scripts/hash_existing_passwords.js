/**
 * MIGRACIÓN ÚNICA: CONTRASEÑAS EN TEXTO PLANO → BCRYPT
 * UNIVERSIDAD CESMAG
 *
 * La tabla `users` guardaba las contraseñas tal cual se escribían. Este script
 * las convierte a hash bcrypt. Es la única oportunidad de hacerlo: después del
 * cambio la contraseña original ya no se puede recuperar desde la base de datos
 * (que es justamente el objetivo).
 *
 *   node backend/scripts/hash_existing_passwords.js            → solo informa
 *   node backend/scripts/hash_existing_passwords.js --apply    → escribe
 *
 * Es idempotente: las filas que ya están hasheadas se ignoran, así que puede
 * ejecutarse otra vez sin estropear nada. Nadie pierde el acceso: la contraseña
 * que cada persona ya usaba sigue siendo válida, solo cambia cómo se guarda.
 */
import pool from '../config/db.js';
import { hashPassword, isHashed } from '../utils/password.js';

const APLICAR = process.argv.includes('--apply');

async function main() {
  const { rows } = await pool.query(
    'SELECT user_id, email, password FROM public.users ORDER BY email',
  );

  const vacias = rows.filter((r) => !r.password || !String(r.password).trim());
  const yaHasheadas = rows.filter((r) => isHashed(r.password));
  const pendientes = rows.filter(
    (r) => r.password && String(r.password).trim() && !isHashed(r.password),
  );

  console.log(`Usuarios en la base de datos : ${rows.length}`);
  console.log(`Ya hasheadas (se omiten)     : ${yaHasheadas.length}`);
  console.log(`Sin contraseña (se omiten)   : ${vacias.length}`);
  console.log(`Pendientes de hashear        : ${pendientes.length}`);

  if (pendientes.length === 0) {
    console.log('\nNo hay nada que migrar.');
    return;
  }

  if (!APLICAR) {
    console.log('\nSimulación: no se ha escrito nada.');
    console.log('Para aplicarlo de verdad:');
    console.log('  node backend/scripts/hash_existing_passwords.js --apply');
    return;
  }

  let migradas = 0;
  const fallos = [];

  for (const usuario of pendientes) {
    try {
      const hash = await hashPassword(String(usuario.password).trim());
      // La condición de la cláusula WHERE evita pisar una fila que se haya
      // hasheado entretanto (por ejemplo, si alguien inicia sesión ahora mismo).
      const res = await pool.query(
        `UPDATE public.users SET password = $1
          WHERE user_id = $2 AND password = $3`,
        [hash, usuario.user_id, usuario.password],
      );
      if (res.rowCount === 1) migradas += 1;
    } catch (err) {
      fallos.push({ email: usuario.email, motivo: err.message });
    }
  }

  console.log(`\nContraseñas migradas a bcrypt: ${migradas} de ${pendientes.length}`);
  if (fallos.length > 0) {
    console.log('Fallos:');
    fallos.forEach((f) => console.log(`  - ${f.email}: ${f.motivo}`));
  }

  const { rows: verificacion } = await pool.query(
    `SELECT COUNT(*)::int AS en_claro FROM public.users
      WHERE password IS NOT NULL AND TRIM(password) <> ''
        AND password !~ '^\$2[aby]\$'`,
  );
  console.log(`Quedan en texto plano: ${verificacion[0].en_claro}`);
  if (verificacion[0].en_claro === 0) {
    console.log('\nPuedes cerrar definitivamente la vía antigua añadiendo a .env.local:');
    console.log('  LEGACY_PLAINTEXT_LOGIN=off');
  }
}

main()
  .catch((err) => {
    console.error('Error en la migración de contraseñas:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
