import pool from '../config/db.js';
import { REGULATION_ARTICLES } from '../chatbook/regulation/regulation_data.js';

export async function setupRegulationArticlesTable() {
  console.log('[MIGRATION] Verificando tabla public.regulation_articles...');

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS public.regulation_articles (
      article_id SERIAL PRIMARY KEY,
      article_number INTEGER UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      chapter_number VARCHAR(20) NOT NULL,
      chapter_title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      paragraphs JSONB DEFAULT '[]'::jsonb,
      literals JSONB DEFAULT '[]'::jsonb,
      modification JSONB,
      normative_reference VARCHAR(255),
      keywords TEXT[] DEFAULT '{}',
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_by VARCHAR(100)
    );
  `;

  await pool.query(createTableSql);
  console.log('[MIGRATION] Tabla public.regulation_articles lista.');

  const countRes = await pool.query('SELECT COUNT(*) FROM public.regulation_articles');
  const count = parseInt(countRes.rows[0].count, 10);

  if (count === 0 && Array.isArray(REGULATION_ARTICLES) && REGULATION_ARTICLES.length > 0) {
    console.log(`[MIGRATION] Sembrando ${REGULATION_ARTICLES.length} artículos del reglamento oficial en PostgreSQL...`);

    for (const art of REGULATION_ARTICLES) {
      await pool.query(
        `INSERT INTO public.regulation_articles 
         (article_number, title, chapter_number, chapter_title, content, paragraphs, literals, modification, normative_reference, keywords, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (article_number) DO NOTHING`,
        [
          art.article_number,
          art.title,
          art.chapter_number,
          art.chapter_title,
          art.content,
          JSON.stringify(art.paragraphs || []),
          JSON.stringify(art.literals || []),
          art.modification ? JSON.stringify(art.modification) : null,
          art.normative_reference || `Acuerdo 105 de 2023, Artículo ${art.article_number}`,
          art.keywords || [],
          'Sistema Inicial',
        ]
      );
    }
    console.log('[MIGRATION] Artículos del reglamento sembrados exitosamente.');
  }
}
