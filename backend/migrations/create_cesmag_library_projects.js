import pool from '../config/db.js';

export async function setupCesmagLibraryProjectsTable() {
  console.log('[MIGRATION] Verificando tabla public.cesmag_library_projects...');

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS public.cesmag_library_projects (
      project_id SERIAL PRIMARY KEY,
      title VARCHAR(350) NOT NULL,
      authors TEXT NOT NULL,
      advisor VARCHAR(200) NOT NULL,
      jurors TEXT,
      program_name VARCHAR(150) NOT NULL,
      faculty_name VARCHAR(150),
      academic_year INTEGER NOT NULL,
      modality VARCHAR(150) NOT NULL DEFAULT 'Trabajo de investigación',
      distinction VARCHAR(50) NOT NULL DEFAULT 'Aprobado',
      abstract TEXT NOT NULL,
      general_objective TEXT,
      specific_objectives TEXT,
      methodology TEXT,
      keywords TEXT[] NOT NULL DEFAULT '{}',
      call_number VARCHAR(100),
      repository_url VARCHAR(500),
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_cesmag_library_year ON public.cesmag_library_projects(academic_year);
    CREATE INDEX IF NOT EXISTS idx_cesmag_library_program ON public.cesmag_library_projects(program_name);
    CREATE INDEX IF NOT EXISTS idx_cesmag_library_distinction ON public.cesmag_library_projects(distinction);
  `;

  await pool.query(createTableSql);
  console.log('[MIGRATION] Tabla public.cesmag_library_projects lista.');

  const countRes = await pool.query('SELECT COUNT(*) FROM public.cesmag_library_projects');
  const count = parseInt(countRes.rows[0].count, 10);

  if (count === 0) {
    console.log('[MIGRATION] Extrayendo colección inicial de Trabajos de Grado desde el Repositorio DSpace CESMAG...');
    try {
      const { syncCesmagRepository } = await import('../scripts/importCesmagRepository.js');
      const res = await syncCesmagRepository({ maxPagesPerCollection: 1, rpp: 25 });
      console.log(`[MIGRATION] ${res.totalInserted} proyectos extraídos e importados exitosamente desde el repositorio institucional.`);
    } catch (err) {
      console.warn('[MIGRATION] Advertencia al sincronizar repositorio inicial:', err.message);
    }
  }
}
