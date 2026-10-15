/**
 * SERVICIO GENERADOR Y ESTRUCTURADOR DE PROPUESTAS DE GRADO CON IA
 * UNIVERSIDAD CESMAG
 *
 * Transforma ideas preliminares en propuestas académicas completas y rigurosas:
 * - Título normalizado según estándares CESMAG
 * - Planteamiento del problema (contexto, síntomas, formulación)
 * - Objetivo General con taxonomía de Bloom
 * - 3 Objetivos Específicos cronológicos (Diagnóstico, Desarrollo, Validación)
 * - Metodología recomendada
 * - Línea y sublínea de investigación institucional asociada
 * - Antecedentes reales encontrados en la biblioteca CESMAG citados en APA 7
 */

import { tokenizeQuery } from '../chatbook/regulation/regulation_search.js';

export async function generateAcademicProposal({ idea, programName = 'Universidad CESMAG', facultyName = '', pool }) {
  const cleanIdea = String(idea || '').trim();
  if (!cleanIdea) {
    throw new Error('Debes proporcionar una idea o tema para estructurar la propuesta.');
  }

  // 1. Buscar antecedentes reales en la biblioteca institucional CESMAG
  let antecedents = [];
  try {
    const tokens = tokenizeQuery(cleanIdea).filter(
      (t) => !['quiero', 'hacer', 'sistema', 'proyecto', 'trabajo', 'grado', 'tesis', 'sobre', 'para', 'como', 'ayuda'].includes(t)
    );
    const searchTerms = tokens.slice(0, 4);

    if (searchTerms.length > 0 && pool) {
      const conditions = searchTerms.map((_, i) => `(title ILIKE $${i + 1} OR abstract ILIKE $${i + 1} OR array_to_string(keywords, ' ') ILIKE $${i + 1})`);
      const params = searchTerms.map((t) => `%${t}%`);

      const query = `
        SELECT project_id, title, authors, advisor, academic_year, program_name, faculty_name, distinction, repository_url, call_number, general_objective
        FROM public.cesmag_library_projects
        WHERE (${conditions.join(' OR ')})
        ORDER BY 
          CASE WHEN faculty_name ILIKE $${params.length + 1} THEN 1 ELSE 2 END,
          academic_year DESC
        LIMIT 3
      `;
      const result = await pool.query(query, [...params, `%${facultyName || ''}%`]);
      antecedents = result.rows.map((row) => ({
        id: row.project_id,
        title: row.title,
        authors: row.authors,
        advisor: row.advisor,
        year: row.academic_year,
        program: row.program_name,
        faculty: row.faculty_name,
        distinction: row.distinction,
        repositoryUrl: row.repository_url,
        callNumber: row.call_number,
        objective: row.general_objective,
        apaCitation: `${row.authors || 'Autor institucional'} (${row.academic_year || 's.f.'}). ${row.title} [Trabajo de grado, Universidad CESMAG - ${row.program_name}]. Repositorio Institucional CRAI.${row.repository_url ? ' ' + row.repository_url : ''}`,
      }));
    }
  } catch (err) {
    console.warn('[AcademicProposal] Error buscando antecedentes:', err.message);
  }

  // 2. Determinar línea de investigación de la base de datos
  let researchLine = 'Innovación y Desarrollo Tecnológico';
  let researchSubline = 'Sistemas de Información y Aplicaciones';
  try {
    if (pool) {
      const linesRes = await pool.query(
        `SELECT rl.name as line_name, pr.name as prog_name 
         FROM public.research_lines rl 
         LEFT JOIN public.programs pr ON rl.program_id = pr.program_id 
         WHERE pr.name ILIKE $1 OR rl.name ILIKE $1
         LIMIT 1`,
        [`%${programName}%`]
      );
      if (linesRes.rows.length > 0) {
        researchLine = linesRes.rows[0].line_name;
      }
    }
  } catch (e) {
    // Línea por defecto según facultad
    if (/derecho|psicolog/i.test(programName)) researchLine = 'Sociedad, Justicia y Comportamiento Humano';
    else if (/educaci/i.test(programName)) researchLine = 'Pedagogía, Didáctica y Formación Integral';
    else if (/administra|conta/i.test(programName)) researchLine = 'Gestión Organizacional, Finanzas y Competitividad';
    else if (/arquitec|dise/i.test(programName)) researchLine = 'Hábitat, Territorio y Comunicación Visual';
  }

  // 3. Si Gemini AI está configurado, intentar generación con modelo LLM
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiResult = await callGeminiProposal({ cleanIdea, programName, facultyName, researchLine, antecedents });
      if (geminiResult) {
        return {
          ...geminiResult,
          antecedents,
          researchLine,
          researchSubline,
          aiPowered: true,
        };
      }
    } catch (llmErr) {
      console.warn('[AcademicProposal] Gemini no disponible, usando motor semántico local:', llmErr.message);
    }
  }

  // 4. Motor de Inferencia Académica Heurística Local (CESMAG Bloom Engine)
  const structured = buildHeuristicProposal(cleanIdea, programName, facultyName, researchLine, antecedents);
  return {
    ...structured,
    antecedents,
    researchLine,
    researchSubline,
    aiPowered: false,
  };
}

async function callGeminiProposal({ cleanIdea, programName, facultyName, researchLine, antecedents }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;

  const prompt = `
Eres el Director Metodológico de Trabajos de Grado de la Universidad CESMAG (Pasto, Colombia).
El estudiante del programa "${programName}" (${facultyName}) tiene la siguiente idea inicial de trabajo de grado:
"${cleanIdea}"

Línea de investigación institucional: "${researchLine}".
${antecedents.length > 0 ? `Antecedentes del CRAI CESMAG relacionados: ${antecedents.map((a) => a.title).join(', ')}` : ''}

Genera una estructura de propuesta académica formal en formato JSON estricto con los siguientes campos exactos:
{
  "suggestedTitle": "Título formal y conciso para trabajo de grado según normas CESMAG",
  "problemStatement": "Descripción del problema en 2 párrafos: contexto/causas y formulación de la pregunta central de investigación",
  "generalObjective": "Objetivo General con verbo en infinitivo de orden superior de Bloom (Desarrollar, Diseñar, Implementar, Evaluar, etc.)",
  "specificObjectives": [
    "Fase 1 (Diagnóstico o requerimientos)",
    "Fase 2 (Diseño, desarrollo o construcción técnica/metodológica)",
    "Fase 3 (Validación, pruebas o evaluación de resultados)"
  ],
  "methodology": "Enfoque metodológico recomendado (fases, técnicas de recolección y herramientas clave)",
  "justification": "Justificación del impacto institucional, social o tecnológico para la región"
}
Solo devuelve el JSON sin comillas adicionales ni texto explicativo.
`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  return JSON.parse(text);
}

function buildHeuristicProposal(idea, programName, facultyName, researchLine, antecedents) {
  // Extraer el núcleo de la idea
  const cleaned = idea
    .replace(/^(quiero hacer|me gustaria hacer|deseo desarrollar|mi idea es|hacer un|un proyecto de|una tesis sobre)\s+/i, '')
    .trim();

  const capitalizedIdea = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  // Determinar verbo principal según disciplina
  let actionVerb = 'Desarrollar';
  let designVerb = 'Diseñar';
  let diagVerb = 'Diagnosticar';
  let validVerb = 'Validar';

  if (/psicolog|derecho|social/i.test(programName)) {
    actionVerb = 'Analizar';
    designVerb = 'Formular';
    diagVerb = 'Caracterizar';
    validVerb = 'Evaluar';
  } else if (/educaci/i.test(programName)) {
    actionVerb = 'Implementar';
    designVerb = 'Estructurar';
    diagVerb = 'Identificar';
    validVerb = 'Valorar';
  } else if (/administra|conta/i.test(programName)) {
    actionVerb = 'Formular';
    designVerb = 'Diseñar';
    diagVerb = 'Diagnosticar';
    validVerb = 'Determinar';
  } else if (/arquitec|dise/i.test(programName)) {
    actionVerb = 'Diseñar';
    designVerb = 'Proyectar';
    diagVerb = 'Reconocer';
    validVerb = 'Comprobar';
  }

  const titleNoun = (
    designVerb === 'Diseñar' ? 'Diseño' :
    designVerb === 'Formular' ? 'Formulación' :
    designVerb === 'Estructurar' ? 'Estructuración' :
    designVerb === 'Proyectar' ? 'Proyección' : 'Desarrollo'
  );

  // Título formal
  const suggestedTitle = `${titleNoun} e implementación de una propuesta orientada a ${cleaned} en el ámbito de la Universidad CESMAG`;

  // Planteamiento del problema
  const problemStatement = `En la actualidad, el abordaje de ${cleaned} representa un desafío prioritario en el ejercicio profesional de ${programName}. Existen vacíos metodológicos y tecnológicos que limitan una atención oportuna y eficiente en el entorno local y regional de Nariño.\n\nPor tanto, surge la necesidad de formular una respuesta estructurada que permita resolver la problemática identificada, formulando la siguiente pregunta central: ¿De qué manera la articulación de metodologías innovadoras y rigurosas permite optimizar y dar solución viable a ${cleaned} bajo los estándares de calidad de la Universidad CESMAG?`;

  // Objetivo General
  const generalObjective = `${actionVerb} ${cleaned} mediante un enfoque metodológico riguroso y articulado a las necesidades del entorno en el marco de ${programName} de la Universidad CESMAG.`;

  // 3 Objetivos Específicos
  const specificObjectives = [
    `${diagVerb} las necesidades, requerimientos técnicos y antecedentes teóricos indispensables para el tratamiento de ${cleaned} en el contexto de aplicación.`,
    `${designVerb} los componentes conceptuales, funcionales y metodológicos que estructuran la propuesta orientada a dar solución a ${cleaned}.`,
    `${validVerb} la efectividad, aplicabilidad y grado de satisfacción de la solución propuesta a través de pruebas piloto y criterios de evaluación formal.`,
  ];

  // Metodología
  const methodology = `Investigación aplicada con enfoque mixto (cualitativo y cuantitativo), estructurada en tres etapas secuenciales: Fase de Diagnóstico y Levantamiento de Información, Fase de Diseño y Construcción, y Fase de Evaluación de Resultados con usuarios clave.`;

  // Justificación
  const justification = `Este proyecto contribuye significativamente a la línea institucional de "${researchLine}", generando valor transferible y aportando nuevo conocimiento práctico que fortalece la formación profesional y el impacto social de la Universidad CESMAG en el departamento de Nariño.`;

  return {
    suggestedTitle,
    problemStatement,
    generalObjective,
    specificObjectives,
    methodology,
    justification,
  };
}
