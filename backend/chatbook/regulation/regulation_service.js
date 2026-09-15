/**
 * SERVICIO DE CONSULTA DEL REGLAMENTO — REGLAMENTO DE TRABAJO DE GRADO Y TESIS
 * UNIVERSIDAD CESMAG
 *
 * Fuente: Acuerdo 105 de 2023 (Compilado con Acuerdo 064 de 2024)
 *
 * Capa de servicio desacoplada para proveer acceso unificado a la información normativa.
 */

import {
  REGULATION_METADATA,
  REGULATION_CHAPTERS,
  REGULATION_ARTICLES,
  REGULATION_MODALITIES,
  REGULATION_DISTINCTIONS,
  REGULATION_MODIFICATIONS_LOG,
} from './regulation_data.js';

import {
  getArticleByNumber,
  getArticlesByChapter,
  getChapterInfo,
  searchModalities,
  searchDistinctions,
  searchByKeywords,
  searchRegulation as executeSearch,
  normalizeText,
} from './regulation_search.js';

class StaticRegulationProvider {
  async getMetadata() {
    return { ...REGULATION_METADATA };
  }

  async getChapters() {
    return [...REGULATION_CHAPTERS];
  }

  async getChapter(chapterIdentifier) {
    return getChapterInfo(chapterIdentifier);
  }

  async getArticle(articleNumber) {
    return getArticleByNumber(articleNumber);
  }

  async getAllArticles() {
    return [...REGULATION_ARTICLES];
  }

  async getModalities() {
    return [...REGULATION_MODALITIES];
  }

  async getModality(nameOrLiteral) {
    const norm = normalizeText(nameOrLiteral);
    const directLiteral = REGULATION_MODALITIES.find(m => m.literal.toLowerCase() === norm);
    if (directLiteral) return directLiteral;

    const matches = searchModalities(nameOrLiteral);
    return matches.length > 0 ? matches[0] : null;
  }

  async getDistinctions() {
    return [...REGULATION_DISTINCTIONS];
  }

  async getModifications() {
    return [...REGULATION_MODIFICATIONS_LOG];
  }

  async search(query, options = {}) {
    return executeSearch(query, options);
  }
}

const defaultProvider = new StaticRegulationProvider();

export class RegulationService {
  constructor(provider = defaultProvider) {
    this.provider = provider;
  }

  async getMetadata() {
    return await this.provider.getMetadata();
  }

  async getChapters() {
    return await this.provider.getChapters();
  }

  async getChapter(chapterIdentifier) {
    return await this.provider.getChapter(chapterIdentifier);
  }

  async getArticle(articleNumber) {
    return await this.provider.getArticle(articleNumber);
  }

  async getAllArticles() {
    return await this.provider.getAllArticles();
  }

  async getModalities() {
    return await this.provider.getModalities();
  }

  async getModality(nameOrLiteral) {
    return await this.provider.getModality(nameOrLiteral);
  }

  async getDistinctions() {
    return await this.provider.getDistinctions();
  }

  async getModifications() {
    return await this.provider.getModifications();
  }

  async search(query, options = {}) {
    return await this.provider.search(query, options);
  }

  formatCitation(articleNumber, extraDetail = '') {
    const num = parseInt(articleNumber, 10);
    const art = getArticleByNumber(num);
    if (!art) return 'Reglamento de Trabajo de Grado y Tesis (Acuerdo 105 de 2023, Universidad CESMAG)';

    let citation = `${art.normative_reference} - "${art.title}" (Universidad CESMAG)`;
    if (extraDetail) {
      citation += `, ${extraDetail}`;
    }
    if (art.modification) {
      citation += ` [${art.modification.modifying_agreement}]`;
    }
    return citation;
  }
}

export const regulationService = new RegulationService();

export {
  StaticRegulationProvider,
  getArticleByNumber,
  getArticlesByChapter,
  getChapterInfo,
  searchModalities,
  searchDistinctions,
  searchByKeywords,
  executeSearch as searchRegulation
};
