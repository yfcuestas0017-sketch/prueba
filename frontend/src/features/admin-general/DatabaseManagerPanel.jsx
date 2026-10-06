import { useState, useEffect, useCallback } from 'react';
import { Database, Plus, Edit3, Trash2, RefreshCw } from 'lucide-react';
import api from '../../lib/api';
import { useProgramFilter } from '../../context/ProgramFilterContext';
import { Modal, Button, Alert, FormField } from '../../components/ui';

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
  // Borrar una fila pedia confirmacion con el dialogo nativo del navegador:
  // no sigue el tema, no se puede traducir y en la herramienta de base de
  // datos es justo donde mas importa que se lea QUE se va a borrar.
  const [filaPorEliminar, setFilaPorEliminar] = useState(null);

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

  const handleDelete = (row) => {
    setFilaPorEliminar(row);
  };

  const confirmarEliminacion = async () => {
    if (!filaPorEliminar) return;
    setSaving(true);
    try {
      await api.adminGeneral.dbDeleteRow(adminUserId, selectedTable, filaPorEliminar[currentTableCfg.pk]);
      showFeedback('Registro eliminado con éxito.');
      setFilaPorEliminar(null);
      loadRows();
    } catch (err) {
      showFeedback(err.message || 'No se pudo eliminar el registro.', true);
    } finally {
      setSaving(false);
    }
  };

  if (!tables.length) {
    return <div className="ag-card"><p>Cargando catálogo de tablas...</p></div>;
  }

  return (
    <div className="ag-card">
      <Modal
        open={Boolean(filaPorEliminar)}
        onClose={() => setFilaPorEliminar(null)}
        title="Eliminar registro"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setFilaPorEliminar(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarEliminacion} loading={saving}>
              Eliminar definitivamente
            </Button>
          </>
        )}
      >
        <p>Esta acción no se puede deshacer.</p>
        {filaPorEliminar && currentTableCfg && (
          <p>
            Se eliminará el registro <strong>{String(filaPorEliminar[currentTableCfg.pk])}</strong>
            {' '}de la tabla <strong>{currentTableCfg.label || selectedTable}</strong>.
          </p>
        )}
      </Modal>

      <div className="ag-toolbar">
        <h2><Database size={18} className="ag-inline-icon" /> Gestión de Base de Datos</h2>
        <div className="ag-db-actions">
          {/* El selector de tabla no tenía rótulo de ningún tipo: un lector de
              pantalla anunciaba solo el valor, sin decir de qué es. */}
          <FormField label="Tabla" className="ag-db-table-picker">
            {(field) => (
              <select
                {...field}
                value={selectedTable || ''}
                onChange={(e) => setSelectedTable(e.target.value)}
              >
                {tables.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            )}
          </FormField>
          <Button variant="secondary" icon={RefreshCw} onClick={loadRows}>Actualizar</Button>
          <Button icon={Plus} onClick={handleOpenCreate}>Nuevo registro</Button>
        </div>
      </div>

      {currentTableCfg?.programScoped && (
        <p className="ag-db-scope-note">
          {selectedProgram && selectedProgram !== 'all'
            ? `Mostrando registros globales + los del programa seleccionado (${
                filterPrograms?.find((p) => String(p.program_id) === String(selectedProgram))?.name || 'programa seleccionado'
              }). Cambia el filtro de programa en la parte superior para ver otro.`
            : 'Mostrando registros de todos los programas. Selecciona un programa en la parte superior para filtrar.'}
        </p>
      )}

      {error && (
        <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
      )}
      {successMsg && (
        <Alert type="success" onDismiss={() => setSuccessMsg(null)}>{successMsg}</Alert>
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
                  <td className="ag-row-actions-cell">
                    <div className="ag-row-actions">
                      <Button variant="secondary" size="sm" icon={Edit3} onClick={() => handleOpenEdit(row)}>
                        Editar
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        className="ag-btn-danger"
                        onClick={() => handleDelete(row)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Editor de registro. Era el último modal escrito a mano de la pantalla:
          sin foco atrapado, sin Escape y sin role="dialog".

          Los rótulos de sus campos tampoco estaban asociados a ningún control,
          y no podían estarlo con un id escrito a mano: se generan dentro de un
          .map(), así que un id fijo se habría repetido en cada columna.
          FormField lo resuelve porque cada instancia pide el suyo a useId. */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`${editingRow ? 'Editar registro' : 'Nuevo registro'} — ${currentTableCfg?.label || ''}`}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" form="ag-db-row-form" loading={saving}>Guardar</Button>
          </>
        )}
      >
        <form id="ag-db-row-form" className="ag-form" onSubmit={handleSave}>
          {currentTableCfg?.columns.map((c) => (
            <FormField key={c.name} label={c.label} required={c.required}>
              {(field) => {
                if (c.type === 'textarea') {
                  return (
                    <textarea
                      {...field}
                      value={formData[c.name] ?? ''}
                      onChange={(e) => setFormData({ ...formData, [c.name]: e.target.value })}
                    />
                  );
                }
                if (c.type === 'boolean') {
                  return (
                    <select
                      {...field}
                      /* Una casilla booleana nunca es obligatoria: siempre tiene
                         uno de los dos valores. */
                      required={undefined}
                      value={formData[c.name] ? 'true' : 'false'}
                      onChange={(e) => setFormData({ ...formData, [c.name]: e.target.value === 'true' })}
                    >
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </select>
                  );
                }
                // Administrador de Programa: el programa es el suyo y no se
                // puede cambiar, así que en vez del selector se muestra su
                // nombre en un campo inhabilitado.
                if (c.type === 'select' && lockedProgramId && c.name === 'program_id') {
                  return (
                    <input
                      {...field}
                      type="text"
                      disabled
                      value={
                        filterPrograms?.find((p) => String(p.program_id) === String(lockedProgramId))?.name
                        || (fkOptions.programs || []).find((p) => String(p.program_id) === String(lockedProgramId))?.name
                        || 'Tu programa académico'
                      }
                      readOnly
                    />
                  );
                }
                if (c.type === 'select') {
                  return (
                    <select
                      {...field}
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
                  );
                }
                return (
                  <input
                    {...field}
                    type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                    value={formData[c.name] ?? ''}
                    onChange={(e) => setFormData({ ...formData, [c.name]: e.target.value })}
                  />
                );
              }}
            </FormField>
          ))}
        </form>
      </Modal>
    </div>
  );
}
