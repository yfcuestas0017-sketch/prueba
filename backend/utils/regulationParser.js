/**
 * PARSEADOR DE DOCUMENTOS Y ARCHIVOS DE REGLAMENTO
 * UNIVERSIDAD CESMAG
 *
 * Permite al Administrador General subir archivos (.txt, .json, .md) con reformas
 * o nuevas versiones del reglamento institucional, extrayendo automáticamente
 * artículos, títulos, capítulos, parágrafos y referencias normativas.
 */

export function parseRegulationFile(rawContent, filename = '') {
  const contentStr = String(rawContent || '').trim();
  if (!contentStr) {
    throw new Error('El archivo está vacío.');
  }

  // 1. Si es formato JSON
  if (filename.endsWith('.json') || contentStr.startsWith('[') || contentStr.startsWith('{')) {
    try {
      const parsed = JSON.parse(contentStr);
      const list = Array.isArray(parsed) ? parsed : (parsed.articles || parsed.articulos || []);
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error('El archivo JSON no contiene una lista válida de artículos.');
      }

      return list.map((item, index) => ({
        article_number: parseInt(item.article_number || item.numero || index + 1, 10),
        title: String(item.title || item.titulo || `Artículo ${item.article_number || index + 1}`).trim(),
        chapter_number: String(item.chapter_number || item.capitulo || 'I').trim(),
        chapter_title: String(item.chapter_title || item.titulo_capitulo || 'GENERALIDADES').trim(),
        content: String(item.content || item.contenido || item.texto || '').trim(),
        paragraphs: Array.isArray(item.paragraphs) ? item.paragraphs : [],
        literals: Array.isArray(item.literals) ? item.literals : [],
        normative_reference: item.normative_reference || `Reglamento Institucional CESMAG (${filename || 'Archivo subido'})`,
        modification: item.modification || null,
        keywords: Array.isArray(item.keywords) ? item.keywords : (item.keywords ? String(item.keywords).split(',').map(s => s.trim()) : []),
      }));
    } catch (err) {
      if (filename.endsWith('.json')) {
        throw new Error(`Error de formato JSON: ${err.message}`);
      }
    }
  }

  // 2. Si es formato Texto (.txt, .md)
  let currentChapterNumber = 'I';
  let currentChapterTitle = 'GENERALIDADES';

  // Detectar acuerdo si viene en las primeras líneas
  const agreementMatch = contentStr.match(/(?:ACUERDO\s*(?:N[UÚ]MERO)?\s*[\w\d\s-]+(?:DE\s*\d{4})?)/i);
  const detectedAgreement = agreementMatch ? agreementMatch[0].trim() : `Actualización ${new Date().getFullYear()}`;

  // Separar el texto por capítulos y artículos
  const lines = contentStr.split(/\r?\n/);
  const articles = [];
  let currentArticle = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detección de Capítulo
    const chapterMatch = line.match(/^CAP[ÍI]TULO\s+([IVXLCDM\d]+)(?:\s*[:.\-]\s*(.*))?$/i);
    if (chapterMatch) {
      currentChapterNumber = chapterMatch[1].toUpperCase();
      currentChapterTitle = (chapterMatch[2] || lines[i + 1] || 'GENERALIDADES').trim().toUpperCase();
      continue;
    }

    // Detección de inicio de Artículo
    const articleMatch = line.match(/^ART[ÍI]CULO\s+(\d+)(?:[.:\-\s]+(.*))?$/i);
    if (articleMatch) {
      if (currentArticle) {
        articles.push(finalizeArticle(currentArticle));
      }

      const num = parseInt(articleMatch[1], 10);
      let title = articleMatch[2]?.trim() || '';
      
      // Si el título viene en la línea siguiente en mayúsculas
      if (!title && lines[i + 1] && lines[i + 1].trim().length < 100 && !lines[i + 1].trim().startsWith('ARTÍ')) {
        title = lines[i + 1].trim();
        i++;
      }

      currentArticle = {
        article_number: num,
        title: title || `Artículo ${num}`,
        chapter_number: currentChapterNumber,
        chapter_title: currentChapterTitle,
        lines: [line],
        normative_reference: `${detectedAgreement}, Artículo ${num}`,
        modifying_agreement: detectedAgreement,
      };
      continue;
    }

    if (currentArticle) {
      currentArticle.lines.push(lines[i]);
    }
  }

  if (currentArticle) {
    articles.push(finalizeArticle(currentArticle));
  }

  if (articles.length === 0) {
    throw new Error(
      'No se pudieron identificar artículos en el archivo. Asegúrate de que use el formato estándar: "ARTÍCULO 1. TÍTULO" seguido del contenido normativo.'
    );
  }

  return articles;
}

function finalizeArticle(art) {
  const fullText = art.lines.join('\n').trim();

  // Extraer parágrafos
  const paragraphs = [];
  const paraMatches = fullText.matchAll(/Par[áa]grafo\s*(?:\d+)?\.?\s*([^\n]+(?:\n(?!(?:Par[áa]grafo|ART[ÍI]CULO|\w+\.))[^\n]+)*)/gi);
  for (const m of paraMatches) {
    paragraphs.push({
      label: m[0].split('.')[0] + '.',
      content: m[1]?.trim() || m[0].trim(),
    });
  }

  // Generar palabras clave simples a partir del título
  const keywords = art.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['para', 'como', 'sobre', 'este', 'esta', 'articulo', 'definicion'].includes(w));

  return {
    article_number: art.article_number,
    title: art.title,
    chapter_number: art.chapter_number,
    chapter_title: art.chapter_title,
    content: fullText,
    paragraphs,
    literals: [],
    normative_reference: art.normative_reference,
    modification: {
      modifying_agreement: art.modifying_agreement,
      modified_date: new Date().toISOString().split('T')[0],
      scope: 'Actualización cargada por el Administrador General.',
    },
    keywords,
  };
}
