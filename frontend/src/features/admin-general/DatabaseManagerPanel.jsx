import { useState, useEffect, useCallback } from 'react';
import { Database, Plus, Edit3, Trash2, X, RefreshCw } from 'lucide-react';
import api from '../../lib/api';
import { useProgramFilter } from '../../context/ProgramFilterContext';

export default function DatabaseManagerPanel({ adminUserId, lockedProgramId = null }) {
  const { selectedProgram: globalSelectedProgram, programs: filterPrograms } = useProgramFilter();
  // Cuando lockedProgramId viene definido (Administrador de Programa), el
  // panel siempre opera sobre ese programa, ignorando el selector global
  // de programa (que ese rol ni siquiera ve en pantalla).
  const selectedProgram = lockedProgramId ?? globalSelectedProgram;
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [rows, setRows] = useState([]);
  const [fkOptions, setFkOptions] = useState({}); // { fkTableKey: [rows...] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  const showFeedback = (msg, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(null), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  // Cargar el catálogo de tablas administrables
  useEffect(() => {
    (async () => {
      try {
        const res = await api.adminGeneral.dbGetTables(adminUserId);
        setTables(res.tables || []);
        if (res.tables?.length) setSelectedTable(res.tables[0].key);
      } catch (err) {
        showFeedback(err.message || 'Error al cargar el catálogo de tablas.', true);
      }
    })();
  }, [adminUserId]);

  const currentTableCfg = tables.find((t) => t.key === selectedTable);

  const loadRows = useCallback(async () => {
    if (!selectedTable) return;
    setLoading(true);
    try {
      const res = await api.adminGeneral.dbListRows(adminUserId, selectedTable, selectedProgram);
      setRows(res.rows || []);
    } catch (err) {
      showFeedback(err.message || 'Error al consultar la tabla.', true);
    } finally {
      setLoading(false);
    }
  }, [adminUserId, selectedTable, selectedProgram]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  // Cargar listas de opciones para los campos tipo "select" (relaciones FK)
  useEffect(() => {
    if (!currentTableCfg) return;
    const fkKeys = currentTableCfg.columns.filter((c) => c.fk).map((c) => c.fk);
    fkKeys.forEach(async (fkKey) => {
      if (fkOptions[fkKey]) return;
      try {
        const res = await api.adminGeneral.dbListRows(adminUserId, fkKey);
        setFkOptions((prev) => ({ ...prev, [fkKey]: res.rows || [] }));
      } catch {
        // silencioso: si falla, el select simplemente queda vacío
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTableCfg, adminUserId]);

  const handleOpenCreate = () => {
    setEditingRow(null);
    const initial = {};
    currentTableCfg?.columns.forEach((c) => {
      if (c.type === 'boolean') {
        initial[c.name] = true;
      } else if (lockedProgramId && c.name === 'program_id') {
        // Administrador de Programa: el programa siempre es el suyo, sin opción de cambiarlo.
        initial[c.name] = lockedProgramId;
      } else if (
        currentTableCfg.programScoped
        && c.name === 'program_id'
        && selectedProgram
        && selectedProgram !== 'all'
      ) {
        // Si el admin tiene un programa seleccionado en el header, precargarlo
        // (sigue pudiendo dejarlo vacío para que la opción sea global).
        initial[c.name] = selectedProgram;
      } else {
        initial[c.name] = '';
      }
    });
    setFormData(initial);
    setModalOpen(true);
  };

  const handleOpenEdit = (row) => {
    setEditingRow(row);
    const initial = {};
    currentTableCfg?.columns.forEach((c) => { initial[c.name] = row[c.name] ?? ''; });
    setFormData(initial);
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingRow) {
        await api.adminGeneral.dbUpdateRow(adminUserId, selectedTable, editingRow[currentTableCfg.pk], formData);
        showFeedback('Registro actualizado con éxito.');
      } else {
        await api.adminGeneral.dbCreateRow(adminUserId, selectedTable, formData);
        showFeedback('Registro creado con éxito.');
      }
      setModalOpen(false);
      loadRows();
    } catch (err) {
      showFeedback(err.message || 'Error al guardar el registro.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm('¿Eliminar este registro de forma permanente?')) return;
    try {
      await api.adminGeneral.dbDeleteRow(adminUserId, selectedTable, row[currentTableCfg.pk]);
      showFeedback('Registro eliminado con éxito.');
      loadRows();
    } catch (err) {
      showFeedback(err.message || 'No se pudo eliminar el registro.', true);
    }
  };

  if (!tables.length) {
    return <div className="ag-card"><p>Cargando catálogo de tablas...</p></div>;
  }

  return (
    <div className="ag-card">
      <div className="ag-toolbar">
        <h2><Database size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Gestión de Base de Datos</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            className="ag-form-input"
            value={selectedTable || ''}
            onChange={(e) => setSelectedTable(e.target.value)}
          >
            {tables.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <button className="ag-btn-secondary" onClick={loadRows}><RefreshCw size={14} /> Actualizar</button>
          <button className="ag-btn-primary" onClick={handleOpenCreate}><Plus size={16} /> Nuevo registro</button>
        </div>
      </div>

      {currentTableCfg?.programScoped && (
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#64748b' }}>
          {selectedProgram && selectedProgram !== 'all'
            ? `Mostrando registros globales + los del programa seleccionado (${
                filterPrograms?.find((p) => String(p.program_id) === String(selectedProgram))?.name || 'programa seleccionado'
              }). Cambia el filtro de programa en la parte superior para ver otro.`
            : 'Mostrando registros de todos los programas. Selecciona un programa en la parte superior para filtrar.'}
        </p>
      )}

      {error && (
        <div className="ag-audit-item" style={{ borderLeftColor: '#ef4444', background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div className="ag-audit-item" style={{ borderLeftColor: '#22c55e', background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
          {successMsg}
        </div>
      )}

      <div className="ag-table-container">
        <table className="ag-table">
          <thead>
            <tr>
              <th>ID</th>
              {currentTableCfg?.columns.map((c) => <th key={c.name}>{c.label}</th>)}
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={100}>Cargando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={100}>No hay registros en esta tabla todavía.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row[currentTableCfg.pk]}>
                  <td>{row[currentTableCfg.pk]}</td>
                  {currentTableCfg.columns.map((c) => (
                    <td key={c.name}>
                      {c.type === 'boolean'
                        ? (row[c.name] ? 'Sí' : 'No')
                        : currentTableCfg.programScoped && c.name === 'program_id' && row[c.name] == null
                          ? 'Todos los programas'
                          : (row[`${c.name}_label`] ?? String(row[c.name] ?? ''))}
                    </td>
                  ))}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="ag-btn-secondary" title="Editar" onClick={() => handleOpenEdit(row)}>
                        <Edit3 size={14} /> Editar
                      </button>
                      <button
                        className="ag-btn-secondary"
                        style={{ color: '#dc2626' }}
                        title="Eliminar"
                        onClick={() => handleDelete(row)}
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="ag-modal-overlay">
          <div className="ag-modal">
            <div className="ag-modal-header">
              <h3>{editingRow ? 'Editar registro' : 'Nuevo registro'} — {currentTableCfg?.label}</h3>
              <button className="ag-modal-close" onClick={() => setModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="ag-modal-body">
                {currentTableCfg?.columns.map((c) => (
                  <div className="ag-form-group" key={c.name}>
                    <label>{c.label}{c.required ? ' *' : ''}:</label>
                    {c.type === 'textarea' ? (
                      <textarea
                        className="ag-form-input"
                        required={c.required}
                        value={formData[c.name] ?? ''}
                        onChange={(e) => setFormData({ ...formData, [c.name]: e.target.value })}
                      />
                    ) : c.type === 'boolean' ? (
                      <select
                        className="ag-form-input"
                        value={formData[c.name] ? 'true' : 'false'}
                        onChange={(e) => setFormData({ ...formData, [c.name]: e.target.value === 'true' })}
                      >
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                      </select>
                    ) : c.type === 'select' && lockedProgramId && c.name === 'program_id' ? (
                      // Administrador de Programa: el programa no se puede cambiar.
                      <input
                        className="ag-form-input"
                        type="text"
                        disabled
                        value={
                          filterPrograms?.find((p) => String(p.program_id) === String(lockedProgramId))?.name
                          || (fkOptions.programs || []).find((p) => String(p.program_id) === String(lockedProgramId))?.name
                          || 'Tu programa académico'
                        }
                      />
                    ) : c.type === 'select' ? (
                      <select
                        className="ag-form-input"
                        required={c.required}
                        value={formData[c.name] ?? ''}
                        onChange={(e) => setFormData({ ...formData, [c.name]: e.target.value })}
                      >
                        <option value="">
                          {currentTableCfg?.programScoped && c.name === 'program_id'
                            ? 'Todos los programas'
                            : '-- Selecciona --'}
                        </option>
                        {(fkOptions[c.fk] || []).map((opt) => {
                          const fkCfg = tables.find((t) => t.key === c.fk);
                          const pkVal = opt[fkCfg?.pk];
                          const labelVal = opt.name || opt.title || opt.description || `#${pkVal}`;
                          return <option key={pkVal} value={pkVal}>{labelVal}</option>;
                        })}
                      </select>
                    ) : (
                      <input
                        type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                        className="ag-form-input"
                        required={c.required}
                        value={formData[c.name] ?? ''}
                        onChange={(e) => setFormData({ ...formData, [c.name]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="ag-modal-footer">
                <button type="button" className="ag-btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="ag-btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
