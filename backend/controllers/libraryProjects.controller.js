import pool from '../config/db.js';
import { normalizeText, tokenizeQuery } from '../chatbook/regulation/regulation_search.js';
import { assertAdminGeneral } from '../middlewares/adminGeneral.middleware.js';

/**
 * Sanitizar y validar la URL del repositorio institucional CRAI UNICESMAG.
 * Asegura puerto 8080, protocolo HTTP y maneja fallbacks válidos.
 */
export const sanitizeRepositoryUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  let url = raw.trim();
  if (!url) return '';
  if (url.includes('repositorio.unicesmag.edu.co')) {
    if (url.includes('/handle/cesmag/')) {
      return 'http://repositorio.unicesmag.edu.co:8080/xmlui/handle/123456789/660';
    }
    if (!url.includes(':8080')) {
      url = url.replace(/^https?:\/\/repositorio\.unicesmag\.edu\.co/i, 'http://repositorio.unicesmag.edu.co:8080');
    }
    if (url.startsWith('https://repositorio.unicesmag.edu.co:8080')) {
      url = url.replace('https://', 'http://');
    }
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url;
};

/**
 * Listado y búsqueda facetada de proyectos de grado de la Biblioteca CESMAG
 */
export const getLibraryProjects = async (req, res) => {
  try {
    const {
      q = '',
      program = '',
      faculty = '',
      year = '',
      distinction = '',
      modality = '',
      page = 1,
      limit = 12,
    } = req.query;

    const isGenAdmin = await assertAdminGeneral(pool, req.user?.id);

    // Obtener información del usuario actual (docente / estudiante)
    let userScope = null;
    let enforcedFaculty = '';
    let enforcedProgram = '';

    if (!isGenAdmin) {
      const scopeRes = await pool.query(
        `SELECT u.program_id, pr.name AS program_name, f.name AS faculty_name
         FROM public.users u
         LEFT JOIN public.programs pr ON pr.program_id = u.program_id
         LEFT JOIN public.faculties f ON f.faculty_id = pr.faculty_id
         WHERE u.user_id::text = $1
         LIMIT 1`,
        [String(req.user?.id)]
      );
      userScope = scopeRes.rows[0] || {};
      enforcedFaculty = userScope.faculty_name || '';
      enforcedProgram = userScope.program_name || '';
    }

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (q && q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      conditions.push(`(
        title ILIKE $${paramIndex} OR
        authors ILIKE $${paramIndex} OR
        advisor ILIKE $${paramIndex} OR
        abstract ILIKE $${paramIndex} OR
        call_number ILIKE $${paramIndex} OR
        array_to_string(keywords, ' ') ILIKE $${paramIndex}
      )`);
      params.push(searchTerm);
      paramIndex++;
    }

    // SI ES ADMIN GENERAL: control total, puede explorar todas las facultades y programas
    if (isGenAdmin) {
      if (faculty && faculty.trim() && faculty !== 'all') {
        conditions.push(`faculty_name ILIKE $${paramIndex}`);
        params.push(`%${faculty.trim()}%`);
        paramIndex++;
      }

      if (program && program.trim() && program !== 'all') {
        conditions.push(`program_name ILIKE $${paramIndex}`);
        params.push(`%${program.trim()}%`);
        paramIndex++;
      }
    } else {
      // DOCENTES Y ESTUDIANTES: solo ven los proyectos de su programa y facultad
      if (enforcedFaculty) {
        conditions.push(`faculty_name ILIKE $${paramIndex}`);
        params.push(`%${enforcedFaculty.trim()}%`);
        paramIndex++;
      } else {
        conditions.push(`1 = 0`);
      }

      if (enforcedProgram) {
        conditions.push(`program_name ILIKE $${paramIndex}`);
        params.push(`%${enforcedProgram.trim()}%`);
        paramIndex++;
      }
    }

    if (year && year.trim() && year !== 'all') {
      conditions.push(`academic_year = $${paramIndex}`);
      params.push(parseInt(year, 10));
      paramIndex++;
    }

    if (distinction && distinction.trim() && distinction !== 'all') {
      conditions.push(`distinction ILIKE $${paramIndex}`);
      params.push(distinction.trim());
      paramIndex++;
    }

    if (modality && modality.trim() && modality !== 'all') {
      conditions.push(`modality ILIKE $${paramIndex}`);
      params.push(`%${modality.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Contar total
    const countSql = `SELECT COUNT(*) FROM public.cesmag_library_projects ${whereClause}`;
    const countRes = await pool.query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    // Consultar proyectos
    const listSql = `
      SELECT 
        project_id,
        title,
        authors,
        advisor,
        jurors,
        program_name,
        faculty_name,
        academic_year,
        modality,
        distinction,
        abstract,
        general_objective,
        specific_objectives,
        methodology,
        keywords,
        call_number,
        repository_url,
        created_at
      FROM public.cesmag_library_projects
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN distinction = 'Laureado' THEN 1 
          WHEN distinction = 'Meritorio' THEN 2 
          ELSE 3 
        END,
        academic_year DESC,
        project_id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const listRes = await pool.query(listSql, [...params, parseInt(limit, 10), offset]);

    // Obtener valores únicos para filtros (acotados si es Docente/Estudiante)
    let facetsWhere = '';
    const facetsParams = [];
    if (!isGenAdmin) {
      if (enforcedFaculty) {
        facetsWhere = `WHERE faculty_name ILIKE $1`;
        facetsParams.push(`%${enforcedFaculty.trim()}%`);
        if (enforcedProgram) {
          facetsWhere += ` AND program_name ILIKE $2`;
          facetsParams.push(`%${enforcedProgram.trim()}%`);
        }
      } else {
        facetsWhere = `WHERE 1 = 0`;
      }
    }

    const filtersRes = await pool.query(`
      SELECT 
        ARRAY_AGG(DISTINCT faculty_name) FILTER (WHERE faculty_name IS NOT NULL) as faculties,
        ARRAY_AGG(DISTINCT program_name) FILTER (WHERE program_name IS NOT NULL) as programs,
        ARRAY_AGG(DISTINCT academic_year) FILTER (WHERE academic_year IS NOT NULL) as years,
        ARRAY_AGG(DISTINCT distinction) FILTER (WHERE distinction IS NOT NULL) as distinctions,
        ARRAY_AGG(DISTINCT modality) FILTER (WHERE modality IS NOT NULL) as modalities
      FROM public.cesmag_library_projects
      ${facetsWhere}
    `, facetsParams);

    res.json({
      success: true,
      total,
      page: parseInt(page, 10),
      isGeneralAdmin: isGenAdmin,
      userScope: isGenAdmin ? null : { faculty: enforcedFaculty, program: enforcedProgram },
      projects: listRes.rows.map((p) => ({
        ...p,
        id: p.project_id,
        program: p.program_name,
        faculty: p.faculty_name,
        year: p.academic_year,
        repository_url: sanitizeRepositoryUrl(p.repository_url),
      })),
      facets: {
        faculties: (filtersRes.rows[0]?.faculties || []).filter(Boolean).sort(),
        programs: (filtersRes.rows[0]?.programs || []).sort(),
        years: (filtersRes.rows[0]?.years || []).sort((a, b) => b - a),
        distinctions: (filtersRes.rows[0]?.distinctions || []).sort(),
        modalities: (filtersRes.rows[0]?.modalities || []).sort(),
      },
    });
  } catch (err) {
    console.error('[LibraryProjectsController] Error al consultar proyectos:', err);
    res.status(500).json({ error: 'Error al consultar el catálogo de biblioteca.' });
  }
};

/**
 * Motor de recomendación de antecedentes temáticos para el trabajo de grado del estudiante
 */
export const recommendLibraryProjects = async (req, res) => {
  try {
    const { text = '', program = '', faculty = '', limit = 6 } = req.body;
    const rawText = String(text || '').trim();

    if (!rawText) {
      return res.status(400).json({ error: 'Ingresa el tema, idea u objetivos de tu trabajo de grado.' });
    }

    const isGenAdmin = await assertAdminGeneral(pool, req.user?.id);
    let targetProgram = program;
    let targetFaculty = faculty;

    if (!isGenAdmin) {
      const scopeRes = await pool.query(
        `SELECT u.program_id, pr.name AS program_name, f.name AS faculty_name
         FROM public.users u
         LEFT JOIN public.programs pr ON pr.program_id = u.program_id
         LEFT JOIN public.faculties f ON f.faculty_id = pr.faculty_id
         WHERE u.user_id::text = $1
         LIMIT 1`,
        [String(req.user?.id)]
      );
      const userScope = scopeRes.rows[0] || {};
      targetFaculty = userScope.faculty_name || targetFaculty;
      targetProgram = userScope.program_name || targetProgram;
    }

    const normQuery = normalizeText(rawText);
    const tokens = tokenizeQuery(rawText);

    let whereRecom = '';
    const paramsRecom = [];
    if (!isGenAdmin) {
      if (targetFaculty) {
        whereRecom = 'WHERE faculty_name ILIKE $1';
        paramsRecom.push(`%${targetFaculty}%`);
        if (targetProgram) {
          whereRecom += ' AND program_name ILIKE $2';
          paramsRecom.push(`%${targetProgram}%`);
        }
      } else {
        whereRecom = 'WHERE 1 = 0';
      }
    }

    // Consultar proyectos dentro del alcance permitido
    const allRes = await pool.query(`
      SELECT 
        project_id,
        title,
        authors,
        advisor,
        program_name,
        faculty_name,
        academic_year,
        modality,
        distinction,
        abstract,
        general_objective,
        specific_objectives,
        methodology,
        keywords,
        call_number,
        repository_url
      FROM public.cesmag_library_projects
      ${whereRecom}
    `, paramsRecom);

    const scored = [];
    const advisorOccurrences = {};

    for (const proj of allRes.rows) {
      let score = 0;
      const titleNorm = normalizeText(proj.title);
      const abstractNorm = normalizeText(proj.abstract);
      const objNorm = normalizeText(proj.general_objective || '');
      const keywordsNorm = (proj.keywords || []).map(normalizeText);

      // Coincidencia exacta o frase
      if (normQuery && titleNorm.includes(normQuery)) score += 120;
      if (normQuery && abstractNorm.includes(normQuery)) score += 60;

      // Coincidencias de tokens clave
      for (const token of tokens) {
        if (titleNorm.includes(token)) score += 35;
        if (keywordsNorm.some(kw => kw.includes(token))) score += 25;
        if (objNorm.includes(token)) score += 15;
        if (abstractNorm.includes(token)) score += 10;
      }

      // Bonus por programa afín
      if (program && proj.program_name && normalizeText(proj.program_name).includes(normalizeText(program))) {
        score += 30;
      }

      // Bonus por facultad afín
      if (faculty && proj.faculty_name && normalizeText(proj.faculty_name).includes(normalizeText(faculty))) {
        score += 20;
      }

      // Bonus por distinción académica (referencias de alta calidad)
      if (proj.distinction === 'Laureado') score += 15;
      else if (proj.distinction === 'Meritorio') score += 10;

      if (score > 10) {
        scored.push({
          ...proj,
          relevance_score: score,
        });

        // Contabilizar directores con experiencia en el tema
        if (proj.advisor) {
          advisorOccurrences[proj.advisor] = (advisorOccurrences[proj.advisor] || 0) + 1;
        }
      }
    }

    scored.sort((a, b) => b.relevance_score - a.relevance_score);
    const topProjects = scored.slice(0, parseInt(limit, 10)).map((p) => ({
      ...p,
      repository_url: sanitizeRepositoryUrl(p.repository_url),
    }));

    // Formatear directores recomendados
    const recommendedAdvisors = Object.entries(advisorOccurrences)
      .map(([name, count]) => ({ name, projectsCount: count }))
      .sort((a, b) => b.projectsCount - a.projectsCount)
      .slice(0, 4);

    // Extraer objetivos de referencia inspiradores de los proyectos más afines
    const referenceObjectives = topProjects
      .filter(p => p.general_objective)
      .map(p => ({
        projectTitle: p.title,
        general_objective: p.general_objective,
        specific_objectives: p.specific_objectives,
        year: p.academic_year,
      }));

    res.json({
      success: true,
      query: rawText,
      totalMatches: scored.length,
      recommendedProjects: topProjects,
      recommendedAdvisors,
      referenceObjectives,
    });
  } catch (err) {
    console.error('[LibraryProjectsController] Error en recomendador de antecedentes:', err);
    res.status(500).json({ error: 'Error al procesar la recomendación de antecedentes.' });
  }
};

/**
 * Detalle de un proyecto de biblioteca
 */
export const getLibraryProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const projectRes = await pool.query(
      'SELECT * FROM public.cesmag_library_projects WHERE project_id = $1',
      [parseInt(id, 10)]
    );

    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado en la biblioteca.' });
    }

    const found = projectRes.rows[0];
    res.json({
      success: true,
      project: {
        ...found,
        repository_url: sanitizeRepositoryUrl(found.repository_url),
      },
    });
  } catch (err) {
    console.error('[LibraryProjectsController] Error al obtener proyecto por id:', err);
    res.status(500).json({ error: 'Error al consultar el proyecto de biblioteca.' });
  }
};

/**
 * Crear un nuevo proyecto en el catálogo de biblioteca (Admin)
 */
export const createLibraryProject = async (req, res) => {
  try {
    const isGenAdmin = await assertAdminGeneral(pool, req.user?.id);
    if (!isGenAdmin) {
      return res.status(403).json({ error: 'Acceso denegado. Solo el Administrador General tiene permisos para crear proyectos en este módulo.' });
    }

    const {
      title,
      authors,
      advisor,
      jurors = '',
      program_name,
      faculty_name = '',
      academic_year,
      modality = 'Trabajo de investigación',
      distinction = 'Aprobado',
      abstract,
      general_objective = '',
      specific_objectives = '',
      methodology = '',
      keywords = [],
      call_number = '',
      repository_url = '',
    } = req.body;

    if (!title || !authors || !advisor || !program_name || !academic_year || !abstract) {
      return res.status(400).json({
        error: 'Título, autores, asesor, programa, año y resumen son campos obligatorios.',
      });
    }

    const insertSql = `
      INSERT INTO public.cesmag_library_projects
      (title, authors, advisor, jurors, program_name, faculty_name, academic_year, modality, distinction, abstract, general_objective, specific_objectives, methodology, keywords, call_number, repository_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const insertRes = await pool.query(insertSql, [
      title,
      authors,
      advisor,
      jurors,
      program_name,
      faculty_name,
      parseInt(academic_year, 10),
      modality,
      distinction,
      abstract,
      general_objective,
      specific_objectives,
      methodology,
      Array.isArray(keywords) ? keywords : (keywords ? String(keywords).split(',').map(s => s.trim()) : []),
      call_number,
      sanitizeRepositoryUrl(repository_url),
    ]);

    res.status(201).json({
      success: true,
      message: 'Proyecto de grado agregado exitosamente a la biblioteca CESMAG.',
      project: insertRes.rows[0],
    });
  } catch (err) {
    console.error('[LibraryProjectsController] Error al crear proyecto:', err);
    res.status(500).json({ error: 'Error al registrar el proyecto en la biblioteca.' });
  }
};

/**
 * Actualizar proyecto de biblioteca (Admin)
 */
export const updateLibraryProject = async (req, res) => {
  try {
    const isGenAdmin = await assertAdminGeneral(pool, req.user?.id);
    if (!isGenAdmin) {
      return res.status(403).json({ error: 'Acceso denegado. Solo el Administrador General puede editar proyectos en la biblioteca.' });
    }

    const { id } = req.params;
    const {
      title,
      authors,
      advisor,
      jurors,
      program_name,
      faculty_name,
      academic_year,
      modality,
      distinction,
      abstract,
      general_objective,
      specific_objectives,
      methodology,
      keywords,
      call_number,
      repository_url,
    } = req.body;

    const updateSql = `
      UPDATE public.cesmag_library_projects
      SET
        title = COALESCE($1, title),
        authors = COALESCE($2, authors),
        advisor = COALESCE($3, advisor),
        jurors = COALESCE($4, jurors),
        program_name = COALESCE($5, program_name),
        faculty_name = COALESCE($6, faculty_name),
        academic_year = COALESCE($7, academic_year),
        modality = COALESCE($8, modality),
        distinction = COALESCE($9, distinction),
        abstract = COALESCE($10, abstract),
        general_objective = COALESCE($11, general_objective),
        specific_objectives = COALESCE($12, specific_objectives),
        methodology = COALESCE($13, methodology),
        keywords = COALESCE($14, keywords),
        call_number = COALESCE($15, call_number),
        repository_url = COALESCE($16, repository_url)
      WHERE project_id = $17
      RETURNING *
    `;

    const updateRes = await pool.query(updateSql, [
      title || null,
      authors || null,
      advisor || null,
      jurors || null,
      program_name || null,
      faculty_name || null,
      academic_year ? parseInt(academic_year, 10) : null,
      modality || null,
      distinction || null,
      abstract || null,
      general_objective || null,
      specific_objectives || null,
      methodology || null,
      Array.isArray(keywords) ? keywords : null,
      call_number || null,
      repository_url !== undefined ? sanitizeRepositoryUrl(repository_url) : null,
      parseInt(id, 10),
    ]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado para actualizar.' });
    }

    res.json({
      success: true,
      message: 'Proyecto de biblioteca actualizado exitosamente.',
      project: updateRes.rows[0],
    });
  } catch (err) {
    console.error('[LibraryProjectsController] Error al actualizar proyecto:', err);
    res.status(500).json({ error: 'Error al actualizar el proyecto de biblioteca.' });
  }
};

/**
 * Eliminar proyecto de biblioteca (Admin)
 */
export const deleteLibraryProject = async (req, res) => {
  try {
    const isGenAdmin = await assertAdminGeneral(pool, req.user?.id);
    if (!isGenAdmin) {
      return res.status(403).json({ error: 'Acceso denegado. Solo el Administrador General puede eliminar proyectos de la biblioteca.' });
    }

    const { id } = req.params;
    const deleteRes = await pool.query(
      'DELETE FROM public.cesmag_library_projects WHERE project_id = $1 RETURNING project_id',
      [parseInt(id, 10)]
    );

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado para eliminar.' });
    }

    res.json({
      success: true,
      message: 'Proyecto de grado eliminado de la biblioteca.',
    });
  } catch (err) {
    console.error('[LibraryProjectsController] Error al eliminar proyecto:', err);
    res.status(500).json({ error: 'Error al eliminar el proyecto de biblioteca.' });
  }
};

/**
 * Importar o sincronizar un proyecto directamente desde su enlace del Repositorio CESMAG
 */
export const importLibraryProjectFromLink = async (req, res) => {
  try {
    const isGenAdmin = await assertAdminGeneral(pool, req.user?.id);
    if (!isGenAdmin) {
      return res.status(403).json({ error: 'Acceso denegado. Solo el Administrador General puede importar proyectos al repositorio.' });
    }

    const { url, program_name, faculty_name } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'La URL del proyecto en el repositorio es requerida.' });
    }

    const { importProjectFromUrl } = await import('../scripts/importCesmagRepository.js');
    const result = await importProjectFromUrl(url.trim(), program_name, faculty_name);

    if (!result) {
      return res.status(422).json({
        error: 'No se pudo extraer la información del enlace proporcionado. Asegúrate de que sea un enlace válido del repositorio DSpace de la Universidad CESMAG.',
      });
    }

    return res.json({
      success: true,
      action: result.action,
      message: result.action === 'inserted' ? 'Proyecto extraído e importado exitosamente.' : 'Proyecto actualizado con los datos del repositorio.',
      project: result.project,
    });
  } catch (err) {
    console.error('[LibraryProjectsController] Error al importar desde URL:', err);
    return res.status(500).json({ error: 'Error interno al intentar extraer el proyecto del repositorio.' });
  }
};

/**
 * Sincronización rápida de novedades desde el Repositorio DSpace CESMAG
 */
export const syncLibraryProjects = async (req, res) => {
  try {
    const isGenAdmin = await assertAdminGeneral(pool, req.user?.id);
    if (!isGenAdmin) {
      return res.status(403).json({ error: 'Acceso denegado. Solo el Administrador General puede ejecutar la sincronización del repositorio.' });
    }

    const { syncCesmagRepository } = await import('../scripts/importCesmagRepository.js');
    const result = await syncCesmagRepository({ maxPagesPerCollection: 1, rpp: 25 });

    return res.json({
      success: true,
      message: result.totalInserted > 0
        ? `Sincronización exitosa: Se importaron ${result.totalInserted} nuevo(s) proyecto(s) desde el repositorio institucional.`
        : 'Sincronización completa: El catálogo ya se encuentra al día con el repositorio institucional.',
      data: result,
    });
  } catch (err) {
    console.error('[LibraryProjectsController] Error en sincronización:', err);
    return res.status(500).json({ error: 'Error al sincronizar con el repositorio institucional.' });
  }
};


