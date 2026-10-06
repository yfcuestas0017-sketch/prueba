import { useState, useMemo } from 'react';
import { X, ChevronDown, Save, Loader2, Plus, Trash2, Users, History } from 'lucide-react';
import api from '../../lib/api';
import './EditProjectModal.css';

const ROLE_LABELS = { autor: 'Autor', coautor: 'Co-autor', asesor: 'Asesor', jurado: 'Jurado' };
const ROLE_LABELS_PLURAL = { autor: 'Autores', coautor: 'Co-autores', asesor: 'Asesor(es)', jurado: 'Jurados' };
const ROLE_ORDER = ['autor', 'coautor', 'asesor', 'jurado'];

function Avatar({ name, size = 30 }) {
  const initials = (name || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'color-mix(in srgb, var(--accent-primary) 18%, transparent)',
      color: 'var(--accent-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

export default function EditProjectModal({ project, statuses, modalities, lines, sublines, degreeOptions = [], user, onClose, onSaved, onOpenHistory }) {
  const roleLower = String(user?.role || '').toLowerCase();
  const isAdmin = roleLower === 'administrador' || roleLower === 'administrador general' || roleLower.includes('admin');
  const isAdvisor = (project.advisorsList || []).some(a => String(a.id) === String(user?.id)) || project.myRole === 'asesor';
  const isApprovedOrFinished = ['finalizado', 'terminado', 'completado', 'aprobado', 'sustentado'].some(w => String(project.statusName || project.status || '').toLowerCase().includes(w));
  const canEditProject = (isAdmin || isAdvisor) && (!isApprovedOrFinished || isAdmin);
  const isOwnerAuthor = (project.isOwned || project.myRole === 'autor') && !isAdmin && !isAdvisor;
  const canManageTeam = isAdmin || (isOwnerAuthor && !isApprovedOrFinished);

  const [form, setForm] = useState({
    title: project.title || '',
    code: project.code || '',
    generalObjective: project.generalObjective || project.general_objective || '',
    specificObjectives: project.specificObjectives || project.specific_objectives || '',
    statusId: project.statusId || '',
    modalityId: project.modalityId || '',
    lineId: project.lineId || '',
    sublineId: project.sublineId || '',
    degreeOptionId: project.degreeOptionId ?? project.degree_option_id ?? '',
    letterLink: project.letterLink || '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

<<<<<<< HEAD
  // ── Equipo del proyecto ──────────────────────────────────
=======
  // ── Equipo del proyecto (solo admin) ──────────────────────────────────
>>>>>>> 6c454da91d496ca4d0f82346ad689b4f8393c8ac
  const initialTeam = [
    ...(project.authorsList || []).map(p => ({ id: p.id, name: p.name, email: p.email, role: p.role || 'autor' })),
    ...(project.advisorsList || []).map(p => ({ id: p.id, name: p.name, email: p.email, role: 'asesor' })),
    ...(project.jurorsList || []).map(p => ({ id: p.id, name: p.name, email: p.email, role: 'jurado' })),
  ];
  const [team, setTeam] = useState(initialTeam);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState(isAdmin ? 'asesor' : 'coautor');
  const [verifying, setVerifying] = useState(false);
  const [teamError, setTeamError] = useState('');

  const targetProgramId = project?.programId ?? user?.programId ?? user?.program_id ?? null;
  const targetProgramName = String(project?.programName ?? user?.programName ?? user?.program_name ?? '').toLowerCase();
  const activeProgramId = (targetProgramId && targetProgramId !== 'all') ? String(targetProgramId) : null;
  const isPsicologia = activeProgramId === '2' || targetProgramName.includes('psicolog');
  const isSistemas = activeProgramId === '1' || targetProgramName.includes('sistema');

  const filteredLines = useMemo(() => {
    const allLines = lines || [];
    if (!allLines.length) return [];

    return allLines.filter(line => {
      if (activeProgramId && line.program_id !== undefined && line.program_id !== null) {
        return String(line.program_id) === activeProgramId;
      }
      const name = (line.name || '').toLowerCase();
      if (isPsicologia) {
        return [5, 6, 7].includes(line.research_line_id) || name.includes('psicolog');
      }
      if (isSistemas) {
        return [1, 2, 3, 4].includes(line.research_line_id) || (!name.includes('psicolog') && !name.includes('salud') && !name.includes('comunitaria'));
      }
      return true;
    });
  }, [lines, targetProgramId, isPsicologia, isSistemas]);

  const filteredSublines = useMemo(() => {
    if (!form.lineId) return [];

    return (sublines || []).filter(
      s => String(s.research_line_id) === String(form.lineId)
    );
  }, [sublines, form.lineId]);

  const handleAddTeamMember = async () => {
    const email = newEmail.trim();
    if (!email) return;
    setVerifying(true);
    setTeamError('');
    try {
      const res = await api.checkCoauthor(email);
      const found = res.user;
      if (!found) {
        setTeamError('Usuario no encontrado en el sistema.');
        return;
      }
      const roleToAdd = isAdmin ? newRole : 'coautor';
      const exists = team.find(p => String(p.id) === String(found.user_id));
      if (exists) {
        setTeamError('Esta persona ya forma parte del equipo del proyecto.');
        return;
      }
      setTeam(prev => [...prev, { id: found.user_id, name: found.full_name, email: found.email, role: roleToAdd }]);
      setNewEmail('');
    } catch (err) {
      setTeamError(err.message || 'Usuario no encontrado.');
    } finally {
      setVerifying(false);
    }
  };

  const handleRemoveTeamMember = (id, role) => {
    if (!isAdmin && role === 'autor') {
      setTeamError('No puedes removerte a ti mismo como autor principal.');
      return;
    }
    setTeam(prev => prev.filter(p => !(String(p.id) === String(id) && p.role === role)));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canEditProject && !isOwnerAuthor) {
      setFormError('No tienes permisos para modificar este proyecto.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      if (canEditProject) {
        if (!form.title.trim()) { setFormError('El título es obligatorio.'); setSaving(false); return; }
        const payload = {
          title: form.title.trim(),
          code: form.code.trim() || null,
          generalObjective: form.generalObjective.trim() || null,
          specificObjectives: form.specificObjectives.trim() || null,
          statusId: form.statusId ? Number(form.statusId) : null,
          modalityId: form.modalityId ? Number(form.modalityId) : null,
          lineId: form.lineId ? Number(form.lineId) : null,
          sublineId: form.sublineId ? Number(form.sublineId) : null,
          degreeOptionId: form.degreeOptionId ? Number(form.degreeOptionId) : null,
          letterLink: form.letterLink.trim() || null,
        };

        await api.updateProject(project.id, payload, user?.id);
      }

      if (isAdmin || isAdvisor || isOwnerAuthor) {
        await api.updateProjectParticipants(project.id, team.map(p => ({ id: p.id, role: p.role })), user?.id);
      }

      setFormSuccess('¡Proyecto actualizado correctamente!');
      setTimeout(() => { onSaved?.(); }, 1200);
    } catch (err) {
      setFormError(`No fue posible actualizar el proyecto: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="epm-backdrop" onClick={onClose}>
      <div className="epm-modal" onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div className="epm-header">
          <div>
            <span className="epm-eyebrow">
              {canEditProject ? `Editar proyecto #${project.id}` : `Ficha del proyecto #${project.id}`}
            </span>
            <h2 className="epm-title">{project.title}</h2>
            <span className="epm-code">{project.code || 'Sin código'}</span>
          </div>
          <div className="epm-header-actions">
            <button className="epm-history-btn" type="button" onClick={onOpenHistory} title="Ver historial del proyecto">
              <History size={15} /> Historial
            </button>
            <button className="epm-close-btn" type="button" onClick={onClose} title="Cerrar"><X size={16} /></button>
          </div>
        </div>

        {/* BODY */}
        <div className="epm-body">
          <div className="epm-left">
            {isApprovedOrFinished ? (
              <div style={{ marginBottom: 14, background: 'color-mix(in srgb, #22c55e 12%, transparent)', border: '1px solid #22c55e', color: 'var(--text-primary)', padding: '12px 14px', borderRadius: 8, fontSize: '0.84rem' }}>
                🎓 <strong>Proyecto Aprobado y Culminado:</strong> Este trabajo de grado ha completado todas sus fases investigativas y ha sido aprobado satisfactoriamente. Se encuentra en modo de solo lectura.
              </div>
            ) : !canEditProject && (
              <div style={{ marginBottom: 14, background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)', border: '1px solid var(--accent-primary)', color: 'var(--text-primary)', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
                📌 <strong>Modo de solo lectura:</strong> Como estudiante, los datos y objetivos del proyecto solo pueden ser editados y guardados por el <strong>Docente Asesor</strong> asignado o los <strong>Administradores</strong>.
              </div>
            )}

            {(formError || formSuccess) && (
              <div className={`epm-alert ${formError ? 'epm-alert--error' : 'epm-alert--success'}`}>
                {formError || formSuccess}
              </div>
            )}

            <form onSubmit={handleSave}>
              <div className="epm-section-title">Información del proyecto</div>

              <div className="epm-grid2">
                <div className="epm-field epm-span2">
<<<<<<< HEAD
                  <label htmlFor="edit-project-modal-campo-1">Título {canEditProject && '*'}</label>
=======
                  <label htmlFor="edit-project-modal-campo-1">Título *</label>
>>>>>>> 6c454da91d496ca4d0f82346ad689b4f8393c8ac
                  <input id="edit-project-modal-campo-1"
                    value={form.title}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    disabled={!canEditProject}
                    readOnly={!canEditProject}
                    required={canEditProject}
                  />
                </div>

                <div className="epm-field epm-span2">
                  <label htmlFor="edit-project-general-obj">Objetivo general</label>
                  <textarea
                    id="edit-project-general-obj"
                    rows={3}
                    value={form.generalObjective}
                    onChange={e => setForm(p => ({ ...p, generalObjective: e.target.value }))}
                    placeholder={canEditProject ? "Define el propósito principal de la investigación..." : "Sin objetivo general registrado"}
                    disabled={!canEditProject}
                    readOnly={!canEditProject}
                    style={{ width: '100%', resize: 'vertical', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border-color)', background: canEditProject ? 'var(--bg-secondary)' : 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.86rem' }}
                  />
                </div>

                <div className="epm-field epm-span2">
                  <label htmlFor="edit-project-specific-objs">Objetivos específicos</label>
                  <textarea
                    id="edit-project-specific-objs"
                    rows={4}
                    value={form.specificObjectives}
                    onChange={e => setForm(p => ({ ...p, specificObjectives: e.target.value }))}
                    placeholder={canEditProject ? "1. Diagnosticar... 2. Diseñar... 3. Implementar..." : "Sin objetivos específicos registrados"}
                    disabled={!canEditProject}
                    readOnly={!canEditProject}
                    style={{ width: '100%', resize: 'vertical', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border-color)', background: canEditProject ? 'var(--bg-secondary)' : 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.86rem' }}
                  />
                </div>

                <div className="epm-field">
                  <label htmlFor="edit-project-modal-campo-2">Estado</label>
<<<<<<< HEAD
                  {isAdmin ? (
                    <div className="epm-select-wrap">
                      <select id="edit-project-modal-campo-2" value={form.statusId} onChange={e => setForm(p => ({ ...p, statusId: e.target.value }))}>
                        <option value="">— Selecciona —</option>
                        {statuses.map(s => <option key={s.status_id} value={s.status_id}>{s.name}</option>)}
                      </select>
                      <ChevronDown size={13} className="epm-chevron" />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={statuses.find(s => String(s.status_id) === String(form.statusId))?.name || project.statusName || 'En Formulación'}
                      readOnly
                      disabled
                    />
                  )}
                </div>

                <div className="epm-field">
                  <label htmlFor="edit-project-modal-campo-3">Modalidad</label>
                  {canEditProject ? (
                    <div className="epm-select-wrap">
                      <select id="edit-project-modal-campo-3" value={form.modalityId} onChange={e => setForm(p => ({ ...p, modalityId: e.target.value }))}>
                        <option value="">— Selecciona —</option>
                        {modalities.map(m => <option key={m.modality_id} value={m.modality_id}>{m.name}</option>)}
                      </select>
                      <ChevronDown size={13} className="epm-chevron" />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={modalities.find(m => String(m.modality_id) === String(form.modalityId))?.name || project.modality || 'Sin modalidad'}
                      readOnly
                      disabled
                    />
                  )}
                </div>

                <div className="epm-field">
                  <label htmlFor="edit-project-modal-campo-4">Opción de grado</label>
                  {isAdmin ? (
                    <div className="epm-select-wrap">
=======
                  <div className="epm-select-wrap">
                    <select id="edit-project-modal-campo-2" value={form.statusId} onChange={e => setForm(p => ({ ...p, statusId: e.target.value }))}>
                      <option value="">— Selecciona —</option>
                      {statuses.map(s => <option key={s.status_id} value={s.status_id}>{s.name}</option>)}
                    </select>
                    <ChevronDown size={13} className="epm-chevron" />
                  </div>
                </div>

                <div className="epm-field">
                  <label htmlFor="edit-project-modal-campo-3">Modalidad</label>
                  <div className="epm-select-wrap">
                    <select id="edit-project-modal-campo-3" value={form.modalityId} onChange={e => setForm(p => ({ ...p, modalityId: e.target.value }))}>
                      <option value="">— Selecciona —</option>
                      {modalities.map(m => <option key={m.modality_id} value={m.modality_id}>{m.name}</option>)}
                    </select>
                    <ChevronDown size={13} className="epm-chevron" />
                  </div>
                </div>

                <div className="epm-field">
                  <label htmlFor="edit-project-modal-campo-4">Opción de grado</label>
                  {isAdmin ? (
                    <div className="epm-select-wrap">
>>>>>>> 6c454da91d496ca4d0f82346ad689b4f8393c8ac
                      <select id="edit-project-modal-campo-4"
                        value={form.degreeOptionId || ''}
                        onChange={e => setForm(p => ({ ...p, degreeOptionId: e.target.value }))}
                      >
                        <option value="">— Seleccione una opción —</option>
                        {(degreeOptions || []).map(opt => (
                          <option key={opt.degree_option_id} value={opt.degree_option_id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={13} className="epm-chevron" />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={
                        (degreeOptions || []).find(opt => String(opt.degree_option_id) === String(form.degreeOptionId))?.name
                        || project.degreeOptionName
                        || 'Opción de grado pendiente'
                      }
                      readOnly
                      disabled
                    />
                  )}
                </div>

                <div className="epm-field">
                  <label htmlFor="edit-project-modal-campo-5">Línea</label>
<<<<<<< HEAD
                  {canEditProject ? (
                    <div className="epm-select-wrap">
                      <select id="edit-project-modal-campo-5" value={form.lineId} onChange={e => setForm(p => ({ ...p, lineId: e.target.value, sublineId: '' }))}>
                        <option value="">— Selecciona —</option>
                        {filteredLines.map(l => <option key={l.research_line_id} value={l.research_line_id}>{l.name}</option>)}
                      </select>
                      <ChevronDown size={13} className="epm-chevron" />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={lines.find(l => String(l.research_line_id) === String(form.lineId))?.name || project.line || 'Sin línea'}
                      readOnly
                      disabled
                    />
                  )}
=======
                  <div className="epm-select-wrap">
                    <select id="edit-project-modal-campo-5" value={form.lineId} onChange={e => setForm(p => ({ ...p, lineId: e.target.value, sublineId: '' }))}>
                      <option value="">— Selecciona —</option>
                      {filteredLines.map(l => <option key={l.research_line_id} value={l.research_line_id}>{l.name}</option>)}
                    </select>
                    <ChevronDown size={13} className="epm-chevron" />
                  </div>
>>>>>>> 6c454da91d496ca4d0f82346ad689b4f8393c8ac
                </div>

                <div className="epm-field">
                  <label htmlFor="edit-project-modal-campo-6">Sublínea</label>
<<<<<<< HEAD
                  {canEditProject ? (
                    <div className="epm-select-wrap">
                      <select id="edit-project-modal-campo-6" value={form.sublineId} onChange={e => setForm(p => ({ ...p, sublineId: e.target.value }))} disabled={!form.lineId}>
                        <option value="">— Selecciona —</option>
                        {filteredSublines.map(s => <option key={s.research_subline_id} value={s.research_subline_id}>{s.name}</option>)}
                      </select>
                      <ChevronDown size={13} className="epm-chevron" />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={sublines.find(s => String(s.research_subline_id) === String(form.sublineId))?.name || project.subline || 'Sin sublínea'}
                      readOnly
                      disabled
                    />
                  )}
=======
                  <div className="epm-select-wrap">
                    <select id="edit-project-modal-campo-6" value={form.sublineId} onChange={e => setForm(p => ({ ...p, sublineId: e.target.value }))} disabled={!form.lineId}>
                      <option value="">— Selecciona —</option>
                      {filteredSublines.map(s => <option key={s.research_subline_id} value={s.research_subline_id}>{s.name}</option>)}
                    </select>
                    <ChevronDown size={13} className="epm-chevron" />
                  </div>
>>>>>>> 6c454da91d496ca4d0f82346ad689b4f8393c8ac
                </div>

                <div className="epm-field epm-span2">
                  <label htmlFor="edit-project-modal-campo-7">Carta / link</label>
                  <input id="edit-project-modal-campo-7"
                    type="url"
                    value={form.letterLink}
                    onChange={e => setForm(p => ({ ...p, letterLink: e.target.value }))}
                    disabled={!canEditProject}
                    readOnly={!canEditProject}
                  />
                </div>
              </div>

              {/* ── EQUIPO DEL PROYECTO ───────────────── */}
              {(isAdmin || isAdvisor || isOwnerAuthor) && (
                <>
                  <div className="epm-section-title" style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={14} /> {isAdmin || isAdvisor ? 'Equipo del proyecto' : 'Integrantes del proyecto (Co-autores)'}
                  </div>

                  {isOwnerAuthor && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10, marginTop: -4 }}>
                      Puedes agregar a otros estudiantes como co-autores ingresando su correo institucional.
                    </p>
                  )}

                  {teamError && <p className="epm-inline-error" style={{ marginBottom: 8 }}>{teamError}</p>}

                  {ROLE_ORDER.map(role => {
                    const members = team.filter(p => p.role === role);
                    if (isOwnerAuthor && (role === 'asesor' || role === 'jurado') && members.length === 0) {
                      return null;
                    }
                    return (
                      <div key={role} style={{ marginBottom: 12 }}>
                        <span style={{
                          fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '.06em', color: 'var(--text-muted)',
                        }}>
                          {ROLE_LABELS_PLURAL[role]}
                        </span>
                        {members.length === 0 ? (
                          <div className="epm-empty" style={{ padding: '8px 0' }}>Sin {ROLE_LABELS[role].toLowerCase()}(es) asignado(s).</div>
                        ) : (
                          members.map(p => {
                            const canDelete = isAdmin || (isOwnerAuthor && !isApprovedOrFinished && role === 'coautor');
                            return (
                              <div key={`${role}-${p.id}`} className="epm-person-row">
                                <Avatar name={p.name} />
                                <div className="epm-person-info">
                                  <span className="epm-person-name">
                                    {p.name} {(!isAdmin && role === 'autor') && <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 600 }}>(Autor Principal)</span>}
                                  </span>
                                  <span className="epm-person-role">{p.email}</span>
                                </div>
                                <div className="epm-person-actions">
                                  {canDelete ? (
                                    <button
                                      type="button"
                                      className="epm-icon-btn epm-icon-btn--danger"
                                      title={`Quitar como ${ROLE_LABELS[role].toLowerCase()}`}
                                      onClick={() => handleRemoveTeamMember(p.id, role)}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', paddingRight: 6 }}>Asignado</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })}

                  {canManageTeam && (
                    <div className="epm-add-row" style={{ alignItems: 'center' }}>
                      <Plus size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                      <input
                        className="epm-inline-input"
                        placeholder={isAdmin ? "Correo de la persona a agregar" : "Correo institucional del co-autor a agregar"}
                        value={newEmail}
                        onChange={e => { setNewEmail(e.target.value); setTeamError(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTeamMember(); } }}
                      />
                      {isAdmin ? (
                        <select
                          value={newRole}
                          onChange={e => setNewRole(e.target.value)}
                          style={{
                            fontSize: '.78rem', padding: '6px 8px', borderRadius: 6,
                            border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                          }}
                        >
                          <option value="autor">Autor</option>
                          <option value="coautor">Co-autor</option>
                          <option value="asesor">Asesor</option>
                          <option value="jurado">Jurado</option>
                        </select>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, padding: '0 4px' }}>
                          Co-autor
                        </span>
                      )}
                      <button type="button" className="epm-add-btn" onClick={handleAddTeamMember} disabled={verifying}>
                        {verifying ? <Loader2 size={12} className="epm-spin" /> : (isAdmin ? 'Agregar' : 'Agregar Co-autor')}
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="epm-form-actions">
                <button type="button" className="epm-btn-ghost" onClick={onClose}>
                  {canEditProject || (isOwnerAuthor && !isApprovedOrFinished) ? 'Cancelar' : 'Cerrar'}
                </button>
                {(canEditProject || (isOwnerAuthor && !isApprovedOrFinished)) && (
                  <button type="submit" className="epm-btn-primary" disabled={saving}>
                    {saving
                      ? <><Loader2 size={14} className="epm-spin" /> Guardando...</>
                      : <><Save size={14} /> {canEditProject ? 'Guardar cambios' : 'Guardar equipo'}</>
                    }
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
