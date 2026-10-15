import pool from '../config/db.js';

const BASE_URL = 'http://repositorio.unicesmag.edu.co:8080';

const COLLECTIONS = [
  { name: 'Ingeniería de Sistemas', faculty: 'Facultad de Ingeniería', handle: '677', limit: 12 },
  { name: 'Ingeniería Electrónica', faculty: 'Facultad de Ingeniería', handle: '662', limit: 10 },
  { name: 'Psicología', faculty: 'Facultad de Ciencias Sociales y Humanas', handle: '674', limit: 12 },
  { name: 'Derecho', faculty: 'Facultad de Ciencias Sociales y Humanas', handle: '673', limit: 12 },
  { name: 'Diseño Gráfico', faculty: 'Facultad de Arquitectura y Bellas Artes', handle: '676', limit: 10 },
  { name: 'Arquitectura', faculty: 'Facultad de Arquitectura y Bellas Artes', handle: '675', limit: 10 },
  { name: 'Administración de Empresas', faculty: 'Facultad de Ciencias Administrativas y Contables', handle: '665', limit: 10 },
  { name: 'Contaduría Pública', faculty: 'Facultad de Ciencias Administrativas y Contables', handle: '672', limit: 10 },
  { name: 'Licenciatura en Educación Física', faculty: 'Facultad de Educación', handle: '678', limit: 8 },
  { name: 'Licenciatura en Educación Infantil', faculty: 'Facultad de Educación', handle: '679', limit: 8 },
  { name: 'Licenciatura en Educación Preescolar', faculty: 'Facultad de Educación', handle: '819', limit: 8 },
  { name: 'Licenciatura en Química', faculty: 'Facultad de Educación', handle: '976', limit: 8 },
  { name: 'Tecnología en Contabilidad y Finanzas', faculty: 'Facultad de Ciencias Administrativas y Contables', handle: '680', limit: 8 },
  { name: 'Tecnología en Gestión Financiera', faculty: 'Facultad de Ciencias Administrativas y Contables', handle: '681', limit: 8 },
];

function cleanHtml(html) {
  if (!html) return '';
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function fetchItemDetails(itemPath, defaultProgram = null, defaultFaculty = null) {
  try {
    const itemUrl = itemPath.startsWith('http') ? itemPath : `${BASE_URL}${itemPath}`;
    const res = await fetch(itemUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (CESMAG-GradoHub-Bot)' } });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<meta\s+name="DC\.title"\s+content="([^"]+)"/i);
    const title = titleMatch ? cleanHtml(titleMatch[1]) : '';
    if (!title) return null;

    const authors = [...html.matchAll(/<meta\s+name="DC\.creator"\s+content="([^"]+)"/gi)]
      .map((m) => cleanHtml(m[1]))
      .filter(Boolean);

    const abstractMatch = html.match(/<meta\s+name="DCTERMS\.abstract"\s+content="([^"]+)"/i);
    const abstract = abstractMatch ? cleanHtml(abstractMatch[1]) : 'Trabajo de grado disponible en el repositorio institucional de la Universidad CESMAG.';

    const dateMatch = html.match(/<meta\s+name="DCTERMS\.issued"\s+content="([^"]+)"/i);
    let year = 2024;
    if (dateMatch) {
      const parsedYear = parseInt(dateMatch[1].slice(0, 4), 10);
      if (!isNaN(parsedYear) && parsedYear > 1990 && parsedYear <= 2030) {
        year = parsedYear;
      }
    }

    const keywords = [...html.matchAll(/<meta\s+name="DC\.subject"\s+content="([^"]+)"/gi)]
      .map((m) => cleanHtml(m[1]).toUpperCase())
      .filter(Boolean);

    // Call number (identificador tipo CEIS063, CEDE072)
    const identifiers = [...html.matchAll(/<meta\s+name="DC\.identifier"\s+content="([^"]+)"/gi)]
      .map((m) => cleanHtml(m[1]));
    const callNumber = identifiers.find((id) => /^[A-Z]{3,6}\d{2,5}$/i.test(id)) || `CESMAG-${year}-${Math.floor(100 + Math.random() * 900)}`;

    // Programa desde breadcrumbs de DSpace si no viene dado
    let detectedProgram = defaultProgram;
    if (!detectedProgram) {
      const trailMatches = [...html.matchAll(/<li class="ds-trail-link[^"]*">\s*<a href="[^"]*\/handle\/123456789\/(\d+)">([^<]+)<\/a>/g)];
      if (trailMatches.length > 0) {
        const lastCol = trailMatches[trailMatches.length - 1];
        detectedProgram = cleanHtml(lastCol[2]);
      }
    }
    if (!detectedProgram || detectedProgram === 'Universidad CESMAG' || detectedProgram === 'Repositorio Institucional de Trabajos de Grado') {
      detectedProgram = 'Universidad CESMAG (General)';
    }

    // Extracción de objetivo general si está redactado en el resumen
    let generalObjective = '';
    const objMatch = abstract.match(/(?:objetivo(?:\s+general)?\s*(?:fue|es|consiste en)?\s*[:\.]?\s*)([^.]+?\.)/i);
    if (objMatch && objMatch[1]) {
      generalObjective = objMatch[1].trim();
    } else {
      generalObjective = abstract.slice(0, 220) + '...';
    }

    return {
      title,
      authors: authors.length > 0 ? authors.join(', ') : 'Universidad CESMAG',
      advisor: 'Docente Asesor Institucional CESMAG',
      abstract,
      academic_year: year,
      keywords,
      call_number: callNumber,
      repository_url: itemUrl,
      general_objective: generalObjective,
      distinction: 'Aprobado',
      program_name: detectedProgram,
      faculty_name: defaultFaculty || 'Universidad CESMAG',
    };
  } catch (err) {
    console.error(`Error al consultar detalle ${itemPath}:`, err.message);
    return null;
  }
}

export async function importProjectFromUrl(url, programName = null, facultyName = null) {
  const details = await fetchItemDetails(url, programName, facultyName);
  if (!details) return null;

  const existing = await pool.query(
    'SELECT project_id FROM public.cesmag_library_projects WHERE repository_url = $1 OR title ILIKE $2 LIMIT 1',
    [details.repository_url, details.title]
  );

  if (existing.rows.length > 0) {
    const updated = await pool.query(
      `UPDATE public.cesmag_library_projects
       SET authors = $1,
           academic_year = $2,
           abstract = $3,
           general_objective = $4,
           keywords = $5,
           call_number = $6,
           program_name = COALESCE($7, program_name),
           faculty_name = COALESCE($8, faculty_name)
       WHERE project_id = $9
       RETURNING *`,
      [
        details.authors,
        details.academic_year,
        details.abstract,
        details.general_objective,
        details.keywords,
        details.call_number,
        details.program_name,
        details.faculty_name,
        existing.rows[0].project_id,
      ]
    );
    return { action: 'updated', project: updated.rows[0] };
  } else {
    const inserted = await pool.query(
      `INSERT INTO public.cesmag_library_projects
       (title, authors, advisor, program_name, faculty_name, academic_year, modality, distinction, abstract, general_objective, keywords, call_number, repository_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        details.title,
        details.authors,
        details.advisor,
        details.program_name,
        details.faculty_name,
        details.academic_year,
        'Trabajo de investigación',
        details.distinction,
        details.abstract,
        details.general_objective,
        details.keywords,
        details.call_number,
        details.repository_url,
      ]
    );
    return { action: 'inserted', project: inserted.rows[0] };
  }
}

async function getRecentItemUrlsFromCollection(colHandle, maxPages = 1, rpp = 25) {
  const itemUrls = new Set();
  for (let page = 1; page <= maxPages; page++) {
    const url = `${BASE_URL}/xmlui/handle/123456789/${colHandle}/browse?type=dateissued&rpp=${rpp}&page=${page}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (CESMAG-GradoHub-Bot)' } });
      if (!res.ok) break;
      const text = await res.text();
      const matches = [...text.matchAll(/class="artifact-title"[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>/g)];
      if (matches.length === 0) break;

      for (const m of matches) {
        const href = m[1];
        if (href.startsWith('/xmlui/handle/123456789/') && href !== `/xmlui/handle/123456789/${colHandle}`) {
          itemUrls.add(href);
        }
      }
    } catch (err) {
      console.error(`Error al listar recientes de handle ${colHandle}:`, err.message);
      break;
    }
  }
  return Array.from(itemUrls);
}

export async function syncCesmagRepository({ maxPagesPerCollection = 1, rpp = 25 } = {}) {
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalChecked = 0;

  for (const col of COLLECTIONS) {
    try {
      const itemUrls = await getRecentItemUrlsFromCollection(col.handle, maxPagesPerCollection, rpp);
      totalChecked += itemUrls.length;

      for (const itemPath of itemUrls) {
        try {
          const itemUrl = itemPath.startsWith('http') ? itemPath : `${BASE_URL}${itemPath}`;
          const existing = await pool.query(
            'SELECT project_id FROM public.cesmag_library_projects WHERE repository_url = $1 LIMIT 1',
            [itemUrl]
          );

          if (existing.rows.length === 0) {
            const details = await fetchItemDetails(itemPath, col.name, col.faculty);
            if (details) {
              await pool.query(
                `INSERT INTO public.cesmag_library_projects
                 (title, authors, advisor, program_name, faculty_name, academic_year, modality, distinction, abstract, general_objective, keywords, call_number, repository_url)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [
                  details.title,
                  details.authors,
                  details.advisor,
                  col.name,
                  col.faculty,
                  details.academic_year,
                  'Trabajo de investigación',
                  details.distinction,
                  details.abstract,
                  details.general_objective,
                  details.keywords,
                  details.call_number,
                  details.repository_url,
                ]
              );
              totalInserted++;
            }
          }
        } catch (itemErr) {
          console.warn(`[SyncCESMAG] Error en item ${itemPath}:`, itemErr.message);
        }
      }
    } catch (colErr) {
      console.warn(`[SyncCESMAG] Error en coleccion ${col.name}:`, colErr.message);
    }
  }

  return { totalInserted, totalUpdated, totalChecked };
}

async function getAllItemUrlsFromCollection(colHandle) {
  const itemUrls = new Set();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${BASE_URL}/xmlui/handle/123456789/${colHandle}/browse?type=dateissued&rpp=100&page=${page}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (CESMAG-GradoHub-Bot)' } });
      if (!res.ok) break;
      const text = await res.text();
      const matches = [...text.matchAll(/class="artifact-title"[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>/g)];
      if (matches.length === 0) break;

      let newFound = 0;
      for (const m of matches) {
        const href = m[1];
        if (href.startsWith('/xmlui/handle/123456789/') && href !== `/xmlui/handle/123456789/${colHandle}`) {
          if (!itemUrls.has(href)) {
            itemUrls.add(href);
            newFound++;
          }
        }
      }

      if (matches.length < 100 || newFound === 0) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (err) {
      console.error(`Error al listar página ${page} de handle ${colHandle}:`, err.message);
      break;
    }
  }

  return Array.from(itemUrls);
}

async function processConcurrent(items, concurrency, workerFn) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      await workerFn(items[current], current, items.length);
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

async function run() {
  console.log('=== INICIANDO EXTRACCIÓN TOTAL DE TODOS LOS TRABAJOS DE GRADO CESMAG ===');
  let totalInserted = 0;
  let totalUpdated = 0;

  for (const col of COLLECTIONS) {
    console.log(`\n======================================================`);
    console.log(`Colección: ${col.name} [${col.faculty}] (handle: ${col.handle})`);
    console.log(`Listando todos los trabajos de grado disponibles...`);

    const itemUrls = await getAllItemUrlsFromCollection(col.handle);
    console.log(`-> Total de trabajos detectados en ${col.name}: ${itemUrls.length}`);

    await processConcurrent(itemUrls, 6, async (itemPath, i, total) => {
      try {
        const details = await fetchItemDetails(itemPath, col.name, col.faculty);
        if (!details) return;

        const existing = await pool.query(
          'SELECT project_id FROM public.cesmag_library_projects WHERE repository_url = $1 OR title ILIKE $2 LIMIT 1',
          [details.repository_url, details.title]
        );

        if (existing.rows.length > 0) {
          await pool.query(
            `UPDATE public.cesmag_library_projects
             SET authors = $1,
                 academic_year = $2,
                 abstract = $3,
                 general_objective = $4,
                 keywords = $5,
                 call_number = $6,
                 program_name = $7,
                 faculty_name = $8
             WHERE project_id = $9`,
            [
              details.authors,
              details.academic_year,
              details.abstract,
              details.general_objective,
              details.keywords,
              details.call_number,
              col.name,
              col.faculty,
              existing.rows[0].project_id,
            ]
          );
          totalUpdated++;
          console.log(`  [${i + 1}/${total}] UPDATE: ${details.title.slice(0, 50)}... (${col.name})`);
        } else {
          await pool.query(
            `INSERT INTO public.cesmag_library_projects
             (title, authors, advisor, program_name, faculty_name, academic_year, modality, distinction, abstract, general_objective, keywords, call_number, repository_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              details.title,
              details.authors,
              details.advisor,
              col.name,
              col.faculty,
              details.academic_year,
              'Trabajo de investigación',
              details.distinction,
              details.abstract,
              details.general_objective,
              details.keywords,
              details.call_number,
              details.repository_url,
            ]
          );
          totalInserted++;
          console.log(`  [${i + 1}/${total}] INSERT: ${details.title.slice(0, 50)}... (${col.name})`);
        }
      } catch (err) {
        console.error(`Error en item ${itemPath}:`, err.message);
      }
    });
  }

  console.log('\n======================================================');
  console.log(`Extracción completa finalizada:`);
  console.log(`  - Insertados: ${totalInserted}`);
  console.log(`  - Actualizados: ${totalUpdated}`);
  const totalInDb = await pool.query('SELECT COUNT(*) FROM public.cesmag_library_projects');
  console.log(`Total de proyectos registrados en la BD: ${totalInDb.rows[0].count}`);
  console.log('======================================================');
  process.exit(0);
}

if (process.argv[1] && (process.argv[1].includes('importCesmagRepository.js') || process.argv[1].endsWith('importCesmagRepository.js'))) {
  run();
}
