import { regulationService } from '../chatbook/regulation/regulation_service.js';
import pool from '../config/db.js';
import { parseRegulationFile } from '../utils/regulationParser.js';

export const getRegulationArticles = async (req, res) => {
  try {
    const articles = await regulationService.getAllArticles();
    const chapters = await regulationService.getChapters();
    const metadata = await regulationService.getMetadata();

    const { q, chapter } = req.query;
    let filtered = articles;

    if (chapter) {
      filtered = filtered.filter(a => String(a.chapter_number).toUpperCase() === String(chapter).toUpperCase());
    }

    if (q) {
      const term = String(q).toLowerCase().trim();
      filtered = filtered.filter(a => 
        String(a.article_number).includes(term) ||
        a.title.toLowerCase().includes(term) ||
        a.content.toLowerCase().includes(term) ||
        (a.keywords || []).some(k => k.toLowerCase().includes(term))
      );
    }

    res.json({
      success: true,
      metadata,
      chapters,
      total: filtered.length,
      articles: filtered,
    });
  } catch (err) {
    console.error('[RegulationAdminController] Error al obtener artículos:', err);
    res.status(500).json({ error: 'Error al consultar los artículos del reglamento.' });
  }
};

export const getRegulationArticle = async (req, res) => {
  try {
    const { articleNumber } = req.params;
    const article = await regulationService.getArticle(articleNumber);
    if (!article) {
      return res.status(404).json({ error: `Artículo ${articleNumber} no encontrado.` });
    }
    res.json({ success: true, article });
  } catch (err) {
    console.error('[RegulationAdminController] Error al obtener artículo:', err);
    res.status(500).json({ error: 'Error al consultar el artículo del reglamento.' });
  }
};

export const updateRegulationArticle = async (req, res) => {
  try {
    const { articleNumber } = req.params;
    const userEmail = req.user?.email || 'Administrador General';
    const updateData = req.body;

    const updated = await regulationService.updateArticle(articleNumber, updateData, userEmail);
    res.json({
      success: true,
      message: `Artículo ${articleNumber} actualizado correctamente. Los cambios ya son visibles en el Chatbot.`,
      article: updated,
    });
  } catch (err) {
    console.error('[RegulationAdminController] Error al actualizar artículo:', err);
    res.status(500).json({ error: 'Error al actualizar el artículo del reglamento.' });
  }
};

export const createRegulationArticle = async (req, res) => {
  try {
    const userEmail = req.user?.email || 'Administrador General';
    const articleData = req.body;

    if (!articleData.article_number || !articleData.title || !articleData.content) {
      return res.status(400).json({ error: 'El número de artículo, título y contenido son obligatorios.' });
    }

    const created = await regulationService.createArticle(articleData, userEmail);
    res.status(201).json({
      success: true,
      message: `Artículo ${articleData.article_number} creado exitosamente en el reglamento institucional.`,
      article: created,
    });
  } catch (err) {
    console.error('[RegulationAdminController] Error al crear artículo:', err);
    res.status(500).json({ error: err.message || 'Error al crear el artículo en el reglamento.' });
  }
};

export const resetRegulationDefaults = async (req, res) => {
  try {
    const userEmail = req.user?.email || 'Administrador General';
    const result = await regulationService.resetDefaults(userEmail);
    res.json({
      success: true,
      message: `Reglamento restablecido exitosamente a su versión base original (${result.count} artículos).`,
    });
  } catch (err) {
    console.error('[RegulationAdminController] Error al restablecer reglamento:', err);
    res.status(500).json({ error: 'Error al restablecer la normativa a valores predeterminados.' });
  }
};

export const testRegulationSearch = async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Escribe una consulta para probar.' });
    }

    const searchResult = await regulationService.search(query);
    res.json({
      success: true,
      query,
      searchResult,
    });
  } catch (err) {
    console.error('[RegulationAdminController] Error al probar búsqueda:', err);
    res.status(500).json({ error: 'Error al ejecutar la búsqueda de prueba.' });
  }
};

export const uploadRegulationFile = async (req, res) => {
  try {
    const { filename, fileContent, rawText } = req.body;
    const content = fileContent || rawText;

    if (!content) {
      return res.status(400).json({ error: 'Debes proporcionar un archivo o texto para procesar.' });
    }

    const parsedArticles = parseRegulationFile(content, filename || '');
    const userEmail = req.user?.email || 'Administrador General';

    let updatedCount = 0;
    let createdCount = 0;

    for (const art of parsedArticles) {
      const existing = await pool.query(
        'SELECT article_id FROM public.regulation_articles WHERE article_number = $1',
        [art.article_number]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE public.regulation_articles
           SET title = $1,
               chapter_number = $2,
               chapter_title = $3,
               content = $4,
               paragraphs = $5,
               literals = $6,
               modification = $7,
               normative_reference = $8,
               keywords = $9,
               updated_at = CURRENT_TIMESTAMP,
               updated_by = $10
           WHERE article_number = $11`,
          [
            art.title,
            art.chapter_number,
            art.chapter_title,
            art.content,
            JSON.stringify(art.paragraphs || []),
            JSON.stringify(art.literals || []),
            art.modification ? JSON.stringify(art.modification) : null,
            art.normative_reference,
            art.keywords || [],
            userEmail,
            art.article_number,
          ]
        );
        updatedCount++;
      } else {
        await pool.query(
          `INSERT INTO public.regulation_articles
           (article_number, title, chapter_number, chapter_title, content, paragraphs, literals, modification, normative_reference, keywords, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            art.article_number,
            art.title,
            art.chapter_number,
            art.chapter_title,
            art.content,
            JSON.stringify(art.paragraphs || []),
            JSON.stringify(art.literals || []),
            art.modification ? JSON.stringify(art.modification) : null,
            art.normative_reference,
            art.keywords || [],
            userEmail,
          ]
        );
        createdCount++;
      }
    }

    regulationService.invalidateCache();

    res.json({
      success: true,
      message: `Reglamento actualizado exitosamente: ${updatedCount} artículos modificados, ${createdCount} artículos nuevos creados. Ya están activos en el Chatbot.`,
      totalProcessed: parsedArticles.length,
      updatedCount,
      createdCount,
    });
  } catch (err) {
    console.error('[RegulationAdminController] Error al subir archivo de reglamento:', err);
    res.status(400).json({ error: err.message || 'Error al procesar el archivo del reglamento.' });
  }
};
