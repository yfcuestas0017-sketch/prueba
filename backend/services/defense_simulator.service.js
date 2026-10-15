/**
 * SERVICIO SIMULADOR DE SUSTENTACIÓN DE GRADO ("JURADO IA EXIGENTE")
 * UNIVERSIDAD CESMAG
 *
 * Prepara a los estudiantes para la defensa oral ante jurados calificadores:
 * - Genera preguntas inquisitivas por criterios de evaluación oficiales (Metodología, Rigor/Limitaciones, Impacto).
 * - Evalúa respuestas en escala 0.0 - 5.0 (calificación mínima aprobatoria: 3.5 según Acuerdo CESMAG).
 * - Brinda retroalimentación inmediata, fortalezas, puntos débiles y consejos tácticos de oratoria y defensa.
 */

export async function startDefenseSimulation({ topic, programName = 'Universidad CESMAG', facultyName = '' }) {
  const cleanTopic = String(topic || 'Trabajo de Grado').trim();

  // Preguntas base de evaluación institucional
  const questions = [
    {
      id: 1,
      category: 'Enfoque Metodológico y Justificación',
      question: `Respecto a su propuesta "${cleanTopic}": ¿Por qué seleccionó este enfoque metodológico y qué sustento teórico o empírico demuestra que es la mejor vía para resolver el problema frente a otras alternativas?`,
      hint: 'Mencione el paradigma de investigación, la justificación de la población/muestra o arquitectura técnica, y cómo asegura la validez de los datos.',
    },
    {
      id: 2,
      category: 'Rigor Técnico, Limitaciones y Sesgos',
      question: `Durante el desarrollo de "${cleanTopic}", ¿cuáles fueron las principales limitaciones técnicas, metodológicas o éticas que enfrentó, y cómo mitigó posibles desviaciones en los resultados?`,
      hint: 'Un jurado valora la autocrítica honesta. Reconozca las fronteras de su alcance y explique sus controles de calidad.',
    },
    {
      id: 3,
      category: 'Aporte al Estado del Arte y Transferencia',
      question: `¿Cuál es el valor agregado o impacto diferenciador que su trabajo entrega a la comunidad o sector en Nariño frente a las investigaciones ya existentes en la Biblioteca CESMAG, y qué se requiere para que sea sostenible en el tiempo?`,
      hint: 'Enfoque su respuesta en la aplicabilidad real, el beneficio tangible para los usuarios y la viabilidad técnica o económica post-grado.',
    },
  ];

  return {
    success: true,
    topic: cleanTopic,
    programName,
    facultyName,
    status: 'in_progress',
    totalQuestions: questions.length,
    currentQuestionIndex: 0,
    questions,
    currentQuestion: questions[0],
    instructions: 'Lee con atención la pregunta formulada por el Jurado Evaluador. Responde con solidez y terminología técnica como si estuvieras en el auditorio de sustentaciones.',
  };
}

export async function evaluateDefenseAnswer({ questionIndex = 0, question = '', studentAnswer = '', topic = '', programName = '' }) {
  const cleanAnswer = String(studentAnswer || '').trim();

  if (!cleanAnswer || cleanAnswer.length < 15) {
    return {
      success: false,
      error: 'Tu respuesta es demasiado breve. En una sustentación real de la Universidad CESMAG, el jurado espera una argumentación profunda y estructurada (mínimo 2-3 frases explicativas).',
    };
  }

  // 1. Si Gemini está disponible, evaluar con IA generativa
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiEvaluation = await callGeminiEvaluation({ question, cleanAnswer, topic, programName });
      if (geminiEvaluation) {
        return {
          success: true,
          ...geminiEvaluation,
          aiPowered: true,
        };
      }
    } catch (e) {
      console.warn('[DefenseSimulator] Gemini no disponible, usando rúbrica institucional local:', e.message);
    }
  }

  // 2. Rúbrica de Evaluación Heurística Local
  const wordCount = cleanAnswer.split(/\s+/).length;
  let score = 3.2; // Base de partida
  const strengths = [];
  const improvements = [];

  // Análisis de extensión y profundidad
  if (wordCount >= 60) {
    score += 0.8;
    strengths.push('Excelente desarrollo argumentativo y respuesta con suficiente contexto y nivel de detalle.');
  } else if (wordCount >= 30) {
    score += 0.5;
    strengths.push('Respuesta concisa y directa al grano.');
  } else {
    improvements.push('La respuesta es algo corta; profundiza más en las decisiones técnicas y en el por qué de tus elecciones.');
  }

  // Vocabulario técnico y académico
  const academicTerms = /\b(metodología|variable|instrumento|arquitectura|validación|indicador|muestra|diseño|criterio|proceso|fase|impacto|análisis|datos|marco|teoría|estándar|protocolo|resultado)\b/i;
  if (academicTerms.test(cleanAnswer)) {
    score += 0.5;
    strengths.push('Apropiación correcta del léxico técnico y metodológico de tu disciplina.');
  } else {
    improvements.push('Incorpora más conceptos formales de tu carrera para transmitir mayor seguridad y autoridad técnica ante los jurados.');
  }

  // Coherencia y justificación
  const justificationWords = /\b(porque|debido a|ya que|con el fin de|demuestra|garantiza|permitió|evidencia|fundamentado en)\b/i;
  if (justificationWords.test(cleanAnswer)) {
    score += 0.4;
    strengths.push('Buena articulación causa-efecto: fundamentas tus aseveraciones con razones claras.');
  } else {
    improvements.push('Justifica siempre tus afirmaciones indicando en qué te basas o qué evidencia respalda lo que dices.');
  }

  // Calibrar nota en rango 1.0 - 5.0
  score = Math.min(5.0, Math.max(1.5, Math.round(score * 10) / 10));

  let verdict = 'Aprobado (Defensa Sólida)';
  let verdictBadge = 'success';
  if (score >= 4.6) {
    verdict = 'Aprobado Sobresaliente (Candidato a Meritorio)';
    verdictBadge = 'laureado';
  } else if (score >= 3.5) {
    verdict = 'Aprobado según Acuerdo CESMAG (Cumple requisitos)';
    verdictBadge = 'success';
  } else {
    verdict = 'Observaciones Graves (Riesgo en Sustentación Real)';
    verdictBadge = 'warning';
  }

  const proTips = [
    'Regla de Oro: Nunca respondas con un simple "sí" o "no". Inicia siempre validando la pregunta: "Es un punto fundamental, la decisión se tomó en base a..."',
    'Si un jurado te señala un punto débil, no te pongas a la defensiva. Di: "Efectivamente es una limitación del alcance actual y queda formulada como trabajo futuro..."',
    'Cita autores o normativas: nombrar referentes del CRAI CESMAG o autores canónicos de tu área impresiona positivamente al comité evaluador.',
  ];
  const proTip = proTips[questionIndex % proTips.length];

  return {
    success: true,
    score,
    verdict,
    verdictBadge,
    feedback: score >= 3.5 
      ? 'El jurado considera que tu defensa tiene solidez. Demuestras apropiación del tema y capacidad de sustentación oral.'
      : 'El jurado considera que tu respuesta deja vacíos metodológicos que pueden comprometer la calificación final. Revisa los puntos de mejora antes del día oficial.',
    strengths,
    improvements: improvements.length > 0 ? improvements : ['Continúa manteniendo este nivel de precisión en las demás preguntas.'],
    proTip,
    aiPowered: false,
  };
}

async function callGeminiEvaluation({ question, cleanAnswer, topic, programName }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;

  const prompt = `
Eres un Jurado Evaluador muy estricto pero constructivo de Trabajos de Grado en la Universidad CESMAG (Pasto, Colombia).
Programa: "${programName}".
Tema o proyecto: "${topic}".

Pregunta formulada al estudiante:
"${question}"

Respuesta dada por el estudiante:
"${cleanAnswer}"

Evalúa la respuesta según la escala de calificación oficial de 0.0 a 5.0 (aprobación mínima: 3.5).
Genera un JSON estricto con los siguientes campos:
{
  "score": 4.2,
  "verdict": "Aprobado (Defensa Sólida)",
  "verdictBadge": "success",
  "feedback": "Evaluación general del jurado sobre la claridad, dominio del tema y rigor...",
  "strengths": ["Punto fuerte 1", "Punto fuerte 2"],
  "improvements": ["Aspecto a mejorar 1", "Aspecto a mejorar 2"],
  "proTip": "Un consejo táctico de oratoria y defensa para la sustentación presencial"
}
Solo devuelve el JSON sin comillas adicionales ni texto explicativo.
`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.25,
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
