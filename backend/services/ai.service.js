/**
 * SERVICIO DE INTELIGENCIA ARTIFICIAL GENERATIVA (GEMINI AI / RAG)
 * UNIVERSIDAD CESMAG
 *
 * Integra modelos generativos de Google Gemini con la base de conocimiento
 * institucional (Reglamento de Grado Acuerdo 105 compilado y Trabajos de Grado
 * de la Biblioteca CESMAG).
 *
 * Si se define GEMINI_API_KEY en .env.local, las respuestas se potencian con IA generativa.
 * Si no está definida, el sistema opera con el motor de inferencia semántica local.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function askGeminiAI({ userQuery, regulationContext = [], libraryContext = [], userProfile = {} }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  if (!apiKey || !apiKey.trim()) {
    return {
      enabled: false,
      response: null,
      note: 'Configura GEMINI_API_KEY en tu archivo .env.local para habilitar respuestas con Inteligencia Artificial Generativa.',
    };
  }

  const systemInstruction = `
Eres Chatbot AI, el asistente inteligente oficial de la Universidad CESMAG (Pasto, Nariño, Colombia) para la gestión, orientación y desarrollo de Trabajos de Grado y Tesis.
Tu misión es orientar con calidez, rigor metodológico y precisión normativa a estudiantes, docentes y administradores.

Reglas institucionales:
1. Basas tus respuestas normativas en el Reglamento Oficial de la Universidad CESMAG (Acuerdo 105 de 2023, compilado con el Acuerdo 064 de 2024).
2. Si se mencionan trabajos de grado de la biblioteca CESMAG, resalta cómo pueden servir de antecedente, estado del arte o inspiración de objetivos.
3. Cita siempre el artículo o acuerdo correspondiente cuando expliques normas o distinciones (Meritorio, Laureado).
4. Sé conciso, claro, estructurado (usa viñetas o pasos si es necesario) y profesional.
5. El usuario actual tiene el rol de "${userProfile.role || 'estudiante'}" en el programa "${userProfile.programName || 'Universidad CESMAG'}".
`;

  let prompt = `Consulta del usuario: "${userQuery}"\n\n`;

  if (regulationContext.length > 0) {
    prompt += `CONTEXTO NORMATIVO VIGENTE DISPONIBLE (Universidad CESMAG):\n`;
    for (const art of regulationContext.slice(0, 3)) {
      prompt += `--- ${art.normative_reference} - "${art.title}" ---\n${art.content?.slice(0, 800)}\n\n`;
    }
  }

  if (libraryContext.length > 0) {
    prompt += `TRABAJOS DE GRADO EN BIBLIOTECA CESMAG RELACIONADOS:\n`;
    for (const proj of libraryContext.slice(0, 3)) {
      prompt += `- Título: "${proj.title}" (${proj.year || proj.academic_year})\n`;
      prompt += `  Autores: ${proj.authors} | Director: ${proj.advisor} | Distinción: ${proj.distinction}\n`;
      if (proj.general_objective) prompt += `  Objetivo General: ${proj.general_objective}\n`;
      prompt += `  Resumen: ${proj.abstract?.slice(0, 300)}...\n\n`;
    }
  }

  prompt += `Por favor, genera una respuesta orientadora, institucional y útil basada en este contexto.`;

  try {
    const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey.trim()}`;
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 900,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('[Gemini AI] Error HTTP de la API de Gemini:', response.status, errText);
      return { enabled: false, response: null, error: `Error API Gemini: ${response.status}` };
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (generatedText) {
      return {
        enabled: true,
        response: generatedText,
        model,
      };
    }

    return { enabled: false, response: null };
  } catch (err) {
    console.error('[Gemini AI] Error al conectar con Google Gemini:', err.message);
    return { enabled: false, response: null, error: err.message };
  }
}
