import fs from 'fs';
import path from 'path';
import pool from '../server/db.js';

async function applyDumpAdjustments() {
  console.log('🚀 Aplicando ajustes del DUMP SQL en BaseDatosGrado...');
  
  const sqlPath = path.join(process.cwd(), 'scratch', 'dump_20260904.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  try {
    await pool.query(sqlContent);
    console.log('✅ Ajustes del DUMP SQL aplicados con éxito en la base de datos local.');
  } catch (err) {
    console.error('❌ Error ejecutando DUMP SQL:', err.message);
    process.exit(1);
  }

  // Verificar tablas existentes y conteos
  const tablesRes = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);

  console.log('\n📊 ESTADO ACTUALIZADO DE TABLAS EN BaseDatosGrado:');
  console.table(tablesRes.rows);

  const counts = await Promise.all([
    pool.query('SELECT COUNT(*) FROM public.users').then(r => ({ Tabla: 'users', Registros: r.rows[0].count })),
    pool.query('SELECT COUNT(*) FROM public.projects').then(r => ({ Tabla: 'projects', Registros: r.rows[0].count })),
    pool.query('SELECT COUNT(*) FROM public.degree_options').then(r => ({ Tabla: 'degree_options', Registros: r.rows[0].count })),
    pool.query('SELECT COUNT(*) FROM public.project_bank').then(r => ({ Tabla: 'project_bank', Registros: r.rows[0].count })),
    pool.query('SELECT COUNT(*) FROM public.project_bank_histories').then(r => ({ Tabla: 'project_bank_histories', Registros: r.rows[0].count })),
  ]);

  console.log('\n📈 REGISTROS VERIFICADOS:');
  console.table(counts);

  process.exit(0);
}

applyDumpAdjustments().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
