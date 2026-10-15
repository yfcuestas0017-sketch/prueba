import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  Edit3,
  RotateCcw,
  Bot,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
} from 'lucide-react';
import api from '../../lib/api';
import { Modal, Button, Alert, FormField } from '../../components/ui';
import './RegulationChatbookManagerPanel.css';

export default function RegulationChatbookManagerPanel({ adminUserId }) {
  const [articles, setArticles] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('all');

  // Modal Edición / Creación
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    article_number: '',
    title: '',
    chapter_number: 'I',
    chapter_title: 'GENERALIDADES',
    content: '',
    normative_reference: '',
    modifying_agreement: '',
    keywords: '',
  });

  // Modal Restablecer
  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Simulador Chatbook
  const [simQuery, setSimQuery] = useState('');
  const [simResult, setSimResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const showFeedback = (msg, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(null), 5000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 5000);
    }
  };

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.regulation.getArticles();
      setArticles(res.articles || []);
      setChapters(res.chapters || []);
      setMetadata(res.metadata || null);
    } catch (err) {
      showFeedback(err.message || 'Error al cargar los artículos del reglamento.', true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  const filteredArticles = useMemo(() => {
    return articles.filter((art) => {
      const matchChapter =
        selectedChapter === 'all' ||
        String(art.chapter_number).toUpperCase() === String(selectedChapter).toUpperCase();

      if (!matchChapter) return false;

      if (!searchTerm.trim()) return true;

      const q = searchTerm.toLowerCase().trim();
      return (
        String(art.article_number).includes(q) ||
        art.title?.toLowerCase().includes(q) ||
        art.content?.toLowerCase().includes(q) ||
        art.normative_reference?.toLowerCase().includes(q) ||
        (art.keywords || []).some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [articles, selectedChapter, searchTerm]);

  const handleOpenEdit = (art) => {
    setIsEditing(true);
    setFormData({
      article_number: art.article_number,
      title: art.title || '',
      chapter_number: art.chapter_number || 'I',
      chapter_title: art.chapter_title || 'GENERALIDADES',
      content: art.content || '',
      normative_reference: art.normative_reference || `Acuerdo 105 de 2023, Artículo ${art.article_number}`,
      modifying_agreement: art.modification?.modifying_agreement || '',
      keywords: Array.isArray(art.keywords) ? art.keywords.join(', ') : '',
    });
    setModalOpen(true);
  };

  const handleOpenCreate = () => {
    setIsEditing(false);
    const nextNum = articles.length > 0 ? Math.max(...articles.map((a) => a.article_number)) + 1 : 1;
    setFormData({
      article_number: nextNum,
      title: '',
      chapter_number: 'VIII',
      chapter_title: 'DISPOSICIONES FINALES',
      content: '',
      normative_reference: 'Acuerdo Consejo Académico',
      modifying_agreement: '',
      keywords: '',
    });
    setModalOpen(true);
  };

  const handleSaveArticle = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const keywordsArr = formData.keywords
        ? formData.keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : [];

      const payload = {
        article_number: parseInt(formData.article_number, 10),
        title: formData.title.trim(),
        chapter_number: formData.chapter_number,
        chapter_title: formData.chapter_title,
        content: formData.content.trim(),
        normative_reference: formData.normative_reference.trim(),
        modification: formData.modifying_agreement.trim()
          ? {
              modifying_agreement: formData.modifying_agreement.trim(),
              modified_date: new Date().toISOString().split('T')[0],
              scope: 'Modificación normativa registrada desde el panel de Administración General.',
            }
          : null,
        keywords: keywordsArr,
      };

      if (isEditing) {
        await api.regulation.updateArticle(formData.article_number, payload);
        showFeedback(`Artículo ${formData.article_number} actualizado con éxito. El Chatbot ya utiliza la nueva versión.`);
      } else {
        await api.regulation.createArticle(payload);
        showFeedback(`Artículo ${formData.article_number} creado con éxito y publicado en el Chatbot.`);
      }

      setModalOpen(false);
      loadArticles();
    } catch (err) {
      showFeedback(err.message || 'Error al guardar el artículo.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setSaving(true);
    try {
      await api.regulation.resetDefaults();
      showFeedback('El reglamento se ha restablecido exitosamente a su versión base original (Acuerdo 105 compilado).');
      setResetModalOpen(false);
      loadArticles();
    } catch (err) {
      showFeedback(err.message || 'Error al restablecer el reglamento.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleSimulateChatbook = async (e) => {
    e.preventDefault();
    if (!simQuery.trim()) return;
    setSimulating(true);
    try {
      const res = await api.regulation.testSearch(simQuery.trim());
      setSimResult(res.searchResult);
    } catch (err) {
      showFeedback(err.message || 'Error al probar consulta en el simulador.', true);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="rcm-container">
      {/* Encabezado */}
      <div className="rcm-header">
        <div className="rcm-header-info">
          <div className="rcm-header-icon">
            <BookOpen size={24} />
          </div>
          <div>
            <h2>Control del Reglamento y Asistente Virtual Chatbot</h2>
            <p>
              Administra la normativa oficial institucional (Acuerdos 105 de 2023 / 064 de 2024 y reformas vigentes).
              Cualquier actualización aquí se refleja de forma inmediata en las respuestas del Chatbot.
            </p>
          </div>
        </div>

        <div className="rcm-actions">
          <Button variant="secondary" icon={RotateCcw} onClick={() => setResetModalOpen(true)}>
            Restablecer Valores Base
          </Button>
          <Button icon={Plus} onClick={handleOpenCreate}>
            Agregar Artículo Normativo
          </Button>
        </div>
      </div>

      {error && <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {successMsg && <Alert type="success" onDismiss={() => setSuccessMsg(null)}>{successMsg}</Alert>}

      {/* Simulador de Chatbot */}
      <div className="rcm-simulator-card">
        <div className="rcm-simulator-head">
          <div className="rcm-sim-title">
            <Bot size={20} className="rcm-sim-icon" />
            <strong>Simulador de Consulta Normativa en Tiempo Real</strong>
          </div>
          <span className="rcm-sim-badge">Prueba cómo responderá el Chatbot a tus cambios</span>
        </div>

        <form onSubmit={handleSimulateChatbook} className="rcm-simulator-form">
          <input
            type="text"
            className="rcm-sim-input"
            placeholder="Ej: ¿Cuáles son los requisitos para sustentar? o ¿Cómo son las distinciones?"
            value={simQuery}
            onChange={(e) => setSimQuery(e.target.value)}
          />
          <Button type="submit" loading={simulating} icon={Sparkles}>
            Simular Búsqueda
          </Button>
        </form>

        {simResult && (
          <div className="rcm-sim-result">
            <div className="rcm-sim-res-header">
              <span><b>Resultado:</b> {simResult.message}</span>
              <span><b>Total coincidencias:</b> {simResult.count || 0}</span>
            </div>
            {simResult.results?.length > 0 ? (
              <div className="rcm-sim-res-items">
                {simResult.results.map((r, i) => (
                  <div key={i} className="rcm-sim-item">
                    <div className="rcm-sim-item-header">
                      <span className="rcm-sim-tag">Capítulo {r.chapter_number} · Artículo {r.article_number}</span>
                      <strong className="rcm-sim-item-title">{r.title}</strong>
                      <span className="rcm-sim-score">Relevancia: {r.relevance_score} pts</span>
                    </div>
                    <p className="rcm-sim-item-text">{r.content?.slice(0, 240)}...</p>
                    <span className="rcm-sim-item-ref">{r.normative_reference}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rcm-sim-empty">No hubo coincidencias normativas para esta consulta.</p>
            )}
          </div>
        )}
      </div>

      {/* Filtros de Artículos */}
      <div className="rcm-filter-bar">
        <div className="rcm-search-wrap">
          <Search size={18} className="rcm-search-icon" />
          <input
            type="text"
            className="rcm-search-input"
            placeholder="Buscar por número, título, palabra clave o texto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="rcm-chapter-filter">
          <label htmlFor="chapter-select">Capítulo:</label>
          <select
            id="chapter-select"
            className="rcm-select"
            value={selectedChapter}
            onChange={(e) => setSelectedChapter(e.target.value)}
          >
            <option value="all">📚 Todos los Capítulos ({articles.length} artículos)</option>
            {chapters.map((ch) => (
              <option key={ch.number} value={ch.number}>
                Capítulo {ch.number}: {ch.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Listado de Artículos */}
      {loading ? (
        <div className="rcm-loading">Cargando base normativa de la Universidad CESMAG...</div>
      ) : filteredArticles.length === 0 ? (
        <div className="rcm-empty">
          <FileText size={40} />
          <p>No se encontraron artículos con los criterios seleccionados.</p>
        </div>
      ) : (
        <div className="rcm-articles-grid">
          {filteredArticles.map((art) => (
            <article key={art.article_number} className="rcm-article-card">
              <div className="rcm-art-top">
                <div className="rcm-art-meta">
                  <span className="rcm-art-badge">
                    Cap. {art.chapter_number} · Artículo {art.article_number}
                  </span>
                  {art.modification?.modifying_agreement && (
                    <span className="rcm-art-mod-badge" title={art.modification.modifying_agreement}>
                      Modificado ({art.modification.modifying_agreement.slice(0, 22)}...)
                    </span>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Edit3}
                  onClick={() => handleOpenEdit(art)}
                >
                  Editar
                </Button>
              </div>

              <h3 className="rcm-art-title">{art.title}</h3>

              <div className="rcm-art-body">
                <p>{art.content}</p>
              </div>

              <div className="rcm-art-footer">
                <span className="rcm-art-ref">{art.normative_reference}</span>
                {art.keywords?.length > 0 && (
                  <div className="rcm-art-keywords">
                    {art.keywords.slice(0, 5).map((k, i) => (
                      <span key={i} className="rcm-kw-tag">#{k}</span>
                    ))}
                    {art.keywords.length > 5 && (
                      <span className="rcm-kw-tag">+{art.keywords.length - 5}</span>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Modal para Editar o Crear Artículo */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isEditing ? `Editar Artículo ${formData.article_number}` : 'Agregar Nuevo Artículo al Reglamento'}
        description="Los cambios se aplicarán inmediatamente en la base de datos y en las respuestas del Chatbot."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" form="rcm-art-form" loading={saving}>
              {isEditing ? 'Guardar Cambios' : 'Crear Artículo'}
            </Button>
          </>
        }
      >
        <form id="rcm-art-form" onSubmit={handleSaveArticle} className="rcm-form">
          <div className="rcm-form-row">
            <FormField label="Número de Artículo" required>
              <input
                type="number"
                min="1"
                required
                disabled={isEditing}
                className="rcm-input"
                value={formData.article_number}
                onChange={(e) => setFormData({ ...formData, article_number: e.target.value })}
              />
            </FormField>

            <FormField label="Capítulo (Número Romano)" required>
              <input
                type="text"
                required
                className="rcm-input"
                placeholder="Ej: VI"
                value={formData.chapter_number}
                onChange={(e) => setFormData({ ...formData, chapter_number: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Título del Capítulo" required>
            <input
              type="text"
              required
              className="rcm-input"
              placeholder="Ej: TIPOS Y CRITERIOS DE DISTINCIONES"
              value={formData.chapter_title}
              onChange={(e) => setFormData({ ...formData, chapter_title: e.target.value })}
            />
          </FormField>

          <FormField label="Título del Artículo" required>
            <input
              type="text"
              required
              className="rcm-input"
              placeholder="Ej: DEFINICIÓN DE TRABAJO DE GRADO"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </FormField>

          <FormField label="Contenido Oficial del Artículo" required>
            <textarea
              required
              rows={8}
              className="rcm-textarea"
              placeholder="Texto completo del artículo, incluyendo parágrafos o literales normativos..."
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            />
          </FormField>

          <div className="rcm-form-row">
            <FormField label="Referencia Normativa Principal">
              <input
                type="text"
                className="rcm-input"
                placeholder="Ej: Acuerdo 105 de 2023, Artículo 1"
                value={formData.normative_reference}
                onChange={(e) => setFormData({ ...formData, normative_reference: e.target.value })}
              />
            </FormField>

            <FormField label="Acuerdo Modificador (Opcional si aplica)">
              <input
                type="text"
                className="rcm-input"
                placeholder="Ej: Acuerdo 064 de 2024 (Consejo Académico)"
                value={formData.modifying_agreement}
                onChange={(e) => setFormData({ ...formData, modifying_agreement: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Palabras Clave (Separadas por comas, para potenciar el Chatbot)">
            <input
              type="text"
              className="rcm-input"
              placeholder="Ej: sustentacion, jurados, requisitos, nota minima, reprobado"
              value={formData.keywords}
              onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
            />
          </FormField>
        </form>
      </Modal>

      {/* Modal Confirmar Restablecer */}
      <Modal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title="¿Restablecer reglamento oficial base?"
        description="Esta acción reemplazará los artículos actuales con la versión base oficial (Acuerdo 105 de 2023 compilado con Acuerdo 064 de 2024)."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" loading={saving} onClick={handleResetDefaults}>
              Sí, Restablecer Versión Base
            </Button>
          </>
        }
      >
        <p className="rcm-reset-warning">
          Ten en cuenta que se perderán los artículos personalizados o adiciones que no pertenezcan al documento oficial base.
        </p>
      </Modal>
    </div>
  );
}
