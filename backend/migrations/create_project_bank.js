import pool from '../config/db.js';

export async function setupProjectBankTable() {
  console.log('[MIGRATION] Verificando tabla public.project_bank...');
  
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS public.project_bank (
      project_bank_id SERIAL PRIMARY KEY,
      title VARCHAR(300) NOT NULL,
      description TEXT NOT NULL,
      general_objective TEXT,
      specific_objectives TEXT,
      research_line_id INTEGER REFERENCES public.research_lines(research_line_id),
      research_subline_id INTEGER REFERENCES public.research_sublines(research_subline_id),
      program_id INTEGER REFERENCES public.programs(program_id),
      keywords VARCHAR(300),
      observations TEXT,
      proposer_id VARCHAR(50) NOT NULL REFERENCES public.users(user_id),
      proposer_role VARCHAR(50) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'Disponible',
      assigned_student_id VARCHAR(50) REFERENCES public.users(user_id),
      assigned_at TIMESTAMP WITHOUT TIME ZONE,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await pool.query(createTableSql);
  console.log('[MIGRATION] Tabla public.project_bank lista.');

  const countRes = await pool.query('SELECT COUNT(*) FROM public.project_bank');
  const count = parseInt(countRes.rows[0].count, 10);

  if (count === 0) {
    console.log('[MIGRATION] Insertando ideas iniciales para el Banco de Proyectos...');

    const sampleProjects = [
      {
        title: 'Plataforma IoT y Visión Artificial para Monitoreo de Cultivos en Nariño',
        description: 'Diseño e implementación de una solución tecnológica integrada que combine sensores ambientales IoT y modelos de visión por computador para detectar plagas tempranas y optimizar el riego en cultivos agrícolas de minifundios en el departamento de Nariño.',
        general_objective: 'Desarrollar una plataforma inteligente de monitoreo agrícola basada en IoT y visión artificial adaptada a las condiciones agroecológicas de Nariño.',
        specific_objectives: '1. Diseñar la arquitectura de nodos sensores de bajo costo para medición de variables ambientales.\n2. Entrenar un modelo de clasificación convolucional para detección de plagas foliares.\n3. Implementar un dashboard web progresivo accesible para asociaciones campesinas.',
        research_line_id: 2,
        research_subline_id: 6,
        program_id: 1,
        keywords: 'IoT, Visión Artificial, Redes Neuronales, Agricultura de Precisión, Nariño',
        observations: 'Proyecto con posibilidad de articulación con convocatorias del MinCiencias y asociaciones agrícolas de Pasto.',
        proposer_id: 'doc001',
        proposer_role: 'Docente',
        status: 'Disponible',
      },
      {
        title: 'Sistema Inteligente de Apoyo al Diagnóstico Temprano de Ansiedad y Depresión en Jóvenes Universitarios',
        description: 'Construcción de un modelo predictivo basado en analítica de datos y procesamiento de lenguaje natural (PLN) para la identificación oportuna de factores de riesgo asociados a trastornos del ánimo en estudiantes de educación superior.',
        general_objective: 'Implementar una herramienta digital de tamizaje cognitivo-conductual que apoye a las unidades de bienestar universitario en la detección temprana de vulnerabilidades en salud mental.',
        specific_objectives: '1. Recopilar y anonimizar corpus psicométricos validados en contexto universitario latinoamericano.\n2. Desarrollar algoritmos de PLN para análisis de sentimiento e indicadores semánticos de riesgo.\n3. Integrar la solución con protocolos institucionales de atención psicosocial.',
        research_line_id: 5,
        research_subline_id: 12,
        program_id: 2,
        keywords: 'Salud Mental, Psicología Clínica, Procesamiento de Lenguaje Natural, Tamizaje Cognitivo, Bienestar Universitario',
        observations: 'Propuesta interdisciplinar orientada al programa de Psicología con soporte del Laboratorio de Psicometría.',
        proposer_id: 'doc002',
        proposer_role: 'Docente',
        status: 'Disponible',
      },
      {
        title: 'Arquitectura Microservicios e Inteligencia de Negocios para la Gestión de Trabajos de Grado',
        description: 'Desarrollo de un ecosistema de software escalable basado en microservicios, trazabilidad documental y módulos analíticos predictivos para optimizar el flujo académico de propuestas, revisiones y sustentaciones en la Universidad CESMAG.',
        general_objective: 'Modernizar la infraestructura digital del sistema institucional de gestión de trabajos de grado mediante patrones de diseño orientados a eventos y analítica avanzada.',
        specific_objectives: '1. Definir la arquitectura de microservicios e interfaces API RESTful con alta disponibilidad.\n2. Implementar un motor de búsqueda semántica y recomendación de jurados calificadores.\n3. Diseñar cuadros de mando analíticos con indicadores clave de gestión (KPIs) para coordinaciones de programa.',
        research_line_id: 1,
        research_subline_id: 1,
        program_id: 1,
        keywords: 'Microservicios, API REST, Inteligencia de Negocios, Gobernanza de Datos, Gestión Académica',
        observations: 'Proyecto de desarrollo aplicado alineado con el plan de transformación digital de la Universidad CESMAG.',
        proposer_id: 'admgeneral',
        proposer_role: 'Administrador',
        status: 'Disponible',
      },
    ];

    for (const proj of sampleProjects) {
      await pool.query(
        `INSERT INTO public.project_bank (
          title, description, general_objective, specific_objectives,
          research_line_id, research_subline_id, program_id, keywords,
          observations, proposer_id, proposer_role, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          proj.title,
          proj.description,
          proj.general_objective,
          proj.specific_objectives,
          proj.research_line_id,
          proj.research_subline_id,
          proj.program_id,
          proj.keywords,
          proj.observations,
          proj.proposer_id,
          proj.proposer_role,
          proj.status,
        ]
      );
    }
    console.log('[MIGRATION] Ideas iniciales del Banco de Proyectos insertadas correctamente.');
  }
}
