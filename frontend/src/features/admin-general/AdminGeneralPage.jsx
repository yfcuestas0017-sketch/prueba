import { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Users,
  UserCheck,
  Key,
  Award,
  Filter,
  History,
  Building,
  Database,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProgramFilter } from '../../context/ProgramFilterContext';
import api from '../../lib/api';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { Modal, Button, Alert, FormField } from '../../components/ui';
import DatabaseManagerPanel from './DatabaseManagerPanel';
import { userIsGeneralAdmin, userIsProgramAdmin } from '../../lib/roles';
import './AdminGeneralPage.css';

export default function AdminGeneralPage() {
  const { user } = useAuth();
  const { selectedProgram, setSelectedProgram } = useProgramFilter();
  const adminUserId = user?.id || user?.user_id || 'admgeneral';

  // El Administrador de Programa (un Docente que además tiene el rol
  // "Administrador") también puede entrar a esta pantalla, pero solo debe
  // poder crear, editar, actualizar y eliminar las Líneas y Sublíneas de
  // Investigación de SU programa académico. Todo lo demás (usuarios, roles,
  // permisos, programas, auditoría) sigue siendo exclusivo del
  // Administrador General del Sistema.
  const isGeneralAdminUser = userIsGeneralAdmin(user);
  const isProgramAdminOnly = !isGeneralAdminUser && userIsProgramAdmin(user);
  const ownProgramId = user?.programId ? String(user.programId) : null;

  // Navegación por pestañas
  const [activeTab, setActiveTab] = useState('users');

  // Estados de datos
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  // Contraseña temporal generada por el servidor al crear un usuario sin
  // indicar contraseña. Se muestra una sola vez y no se oculta sola: es el
  // único momento en que se puede leer, porque en la base de datos solo
  // queda su hash.
  const [credencialTemporal, setCredencialTemporal] = useState(null);

  const [usersList, setUsersList] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [permissionsList, setPermissionsList] = useState([]);
  const [programsList, setProgramsList] = useState([]);
  const [facultiesList, setFacultiesList] = useState([]);
  const [modalitiesList, setModalitiesList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Estados de Búsqueda y Filtros de Tabla
  const [searchUser, setSearchUser] = useState('');
  const [searchRole, setSearchRole] = useState('');
  const [searchPerm, setSearchPerm] = useState('');

  // Modales
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  // 'user' = formulario genérico con checklist de roles (el de siempre)
  // 'admin-general' / 'admin-program' = formularios dedicados y simplificados
  const [userFormMode, setUserFormMode] = useState('user');
  const [userFormData, setUserFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    program_id: '',
    role_ids: [],
  });

  // MODAL: convertir un docente YA existente en Administrador de Programa
  // (en vez de crear un usuario nuevo desde cero)
  const [programAdminModalOpen, setProgramAdminModalOpen] = useState(false);
  const [programAdminProgramId, setProgramAdminProgramId] = useState('');
  const [programAdminUserId, setProgramAdminUserId] = useState('');

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleFormData, setRoleFormData] = useState({
    name: '',
    description: '',
    is_active: true,
  });

  const [permModalOpen, setPermModalOpen] = useState(false);
  const [editingPerm, setEditingPerm] = useState(null);
  const [permFormData, setPermFormData] = useState({
    name: '',
    description: '',
    is_active: true,
  });

  const [progModalOpen, setProgModalOpen] = useState(false);
  const [editingProg, setEditingProg] = useState(null);
  const [progFormData, setProgFormData] = useState({
    name: '',
    faculty_id: '',
    modality_id: '',
  });

  const [assignRoleModalUser, setAssignRoleModalUser] = useState(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);

  const [assignPermRole, setAssignPermRole] = useState(null);
  const [selectedRolePermIds, setSelectedRolePermIds] = useState([]);

  // Carga inicial y actualización al cambiar programa
  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      // El Administrador de Programa no tiene permiso para consultar
      // usuarios/roles/permisos/programas/auditoría (son exclusivos del
      // Administrador General), así que solo se usa el catálogo público
      // para mostrar el nombre de su propio programa académico.
      if (isProgramAdminOnly) {
        const catalogs = await api.getCatalogs().catch(() => ({ programs: [] }));
        setUsersList([]);
        setRolesList([]);
        setPermissionsList([]);
        setProgramsList(catalogs.programs || []);
        setFacultiesList([]);
        setModalitiesList([]);
        setAuditLogs([]);
        return;
      }

      const [uRes, rRes, pRes, prgRes, aRes] = await Promise.all([
        api.adminGeneral.getUsers(adminUserId, selectedProgram),
        api.adminGeneral.getRoles(adminUserId),
        api.adminGeneral.getPermissions(adminUserId),
        api.adminGeneral.getPrograms(adminUserId),
        api.adminGeneral.getAuditHistory(adminUserId, selectedProgram),
      ]);

      setUsersList(uRes.users || []);
      setRolesList(rRes.roles || []);
      setPermissionsList(pRes.permissions || []);
      setProgramsList(prgRes.programs || []);
      setFacultiesList(prgRes.faculties || []);
      setModalitiesList(prgRes.modalities || []);
      setAuditLogs(aRes.history || []);
    } catch (err) {
      console.error('Error loading admin general data:', err);
      setError(err.message || 'Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProgram, isProgramAdminOnly]);

  // Alert dismiss
  const showFeedback = (msg, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(null), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  // 1. USUARIOS ACTIONS
  const handleOpenCreateUser = () => {
    setEditingUser(null);
    setUserFormMode('user');
    setUserFormData({
      full_name: '',
      email: '',
      password: '',
      program_id: selectedProgram !== 'all' ? selectedProgram : '',
      role_ids: [3], // Estudiante por defecto
    });
    setUserModalOpen(true);
  };

  // Busca el ID de un rol por coincidencia de nombre (case-insensitive).
  // matchGeneral=true busca "administrador general"; false busca "administrador"
  // pero EXCLUYENDO los que contengan "general".
  const findRoleId = (matchGeneral) => {
    const found = rolesList.find((r) => {
      const n = (r.name || '').toLowerCase();
      return matchGeneral ? n.includes('administrador general') : (n.includes('administrador') && !n.includes('general'));
    });
    return found?.role_id ?? null;
  };

  const handleOpenCreateAdminGeneral = () => {
    const roleId = findRoleId(true);
    if (!roleId) {
      showFeedback('No se encontró el rol "Administrador General" en la base de datos. Reinicia el servidor backend para que se cree automáticamente.', true);
      return;
    }
    setEditingUser(null);
    setUserFormMode('admin-general');
    setUserFormData({
      full_name: '',
      email: '',
      password: '',
      program_id: '',
      role_ids: [roleId],
    });
    setUserModalOpen(true);
  };

  const handleOpenCreateAdminProgram = () => {
    const roleId = findRoleId(false);
    if (!roleId) {
      showFeedback('No se encontró el rol "Administrador" en la base de datos. Reinicia el servidor backend para que se cree automáticamente.', true);
      return;
    }
    setProgramAdminProgramId(selectedProgram !== 'all' ? selectedProgram : '');
    setProgramAdminUserId('');
    setProgramAdminModalOpen(true);
  };

  // Docentes ya registrados en el programa elegido (se recalcula solo, sin
  // llamadas nuevas al backend: usa la misma lista de usuarios que ya carga
  // la pestaña "Usuarios").
  const teachersForProgramAdmin = useMemo(() => {
    if (!programAdminProgramId) return [];
    return usersList.filter((u) => (
      String(u.program_id) === String(programAdminProgramId)
      && (u.roles || []).some((r) => (r.name || '').toLowerCase().includes('docente'))
    ));
  }, [usersList, programAdminProgramId]);

  const handleConfirmProgramAdmin = async () => {
    if (!programAdminProgramId || !programAdminUserId) {
      showFeedback('Elige el programa y el docente que será administrador.', true);
      return;
    }
    const roleId = findRoleId(false);
    if (!roleId) {
      showFeedback('No se encontró el rol "Administrador" en la base de datos.', true);
      return;
    }
    const target = usersList.find((u) => String(u.user_id) === String(programAdminUserId));
    const currentRoleIds = (target?.roles || []).map((r) => r.role_id);
    // Se conserva el rol de Docente (y cualquier otro que ya tuviera) y se
    // agrega "Administrador" — no se reemplazan sus roles existentes.
    const mergedRoleIds = Array.from(new Set([...currentRoleIds, roleId]));

    setSaving(true);
    try {
      await api.adminGeneral.assignUserRoles(adminUserId, programAdminUserId, mergedRoleIds);
      showFeedback(`${target?.full_name || 'El docente'} ahora es Administrador de su programa.`);
      setProgramAdminModalOpen(false);
      loadAllData();
    } catch (err) {
      showFeedback(err.message || 'No fue posible asignar el rol de administrador.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditUser = (u) => {
    setEditingUser(u);
    setUserFormMode('user');
    setUserFormData({
      full_name: u.full_name || '',
      email: u.email || '',
      password: '',
      program_id: u.program_id ? String(u.program_id) : '',
      role_ids: (u.roles || []).map((r) => r.role_id),
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (userFormMode === 'admin-program' && !userFormData.program_id) {
      showFeedback('Selecciona el programa que administrará este usuario.', true);
      return;
    }
    setSaving(true);
    try {
      if (editingUser) {
        await api.adminGeneral.updateUser(adminUserId, editingUser.user_id, {
          full_name: userFormData.full_name,
          email: userFormData.email,
          password: userFormData.password || undefined,
          program_id: userFormData.program_id || null,
        });
        showFeedback('Usuario actualizado con éxito.');
      } else {
        const creado = await api.adminGeneral.createUser(adminUserId, {
          full_name: userFormData.full_name,
          email: userFormData.email,
          // Sin contraseña indicada, el servidor genera una temporal aleatoria
          // y la devuelve una única vez para entregársela a la persona.
          password: userFormData.password || undefined,
          program_id: userFormData.program_id || null,
          role_ids: userFormData.role_ids,
        });
        if (creado?.temporaryPassword) {
          setCredencialTemporal({ email: userFormData.email, password: creado.temporaryPassword });
        }
        showFeedback('Nuevo usuario registrado con éxito.');
      }
      setUserModalOpen(false);
      loadAllData();
    } catch (err) {
      showFeedback(err.message || 'Error al guardar el usuario.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleUserStatus = async (u) => {
    const nextState = !u.is_active;
    try {
      await api.adminGeneral.toggleUserStatus(adminUserId, u.user_id, nextState);
      showFeedback(`Usuario ${nextState ? 'activado' : 'desactivado'} correctamente.`);
      loadAllData();
    } catch (err) {
      showFeedback(err.message || 'Error al cambiar estado.', true);
    }
  };

  const handleOpenAssignRolesModal = (u) => {
    setAssignRoleModalUser(u);
    setSelectedRoleIds((u.roles || []).map((r) => r.role_id));
  };

  const handleSaveUserRoles = async () => {
    if (!assignRoleModalUser) return;
    setSaving(true);
    try {
      await api.adminGeneral.assignUserRoles(adminUserId, assignRoleModalUser.user_id, selectedRoleIds);
      showFeedback(`Roles actualizados para ${assignRoleModalUser.full_name}.`);
      setAssignRoleModalUser(null);
      loadAllData();
    } catch (err) {
      showFeedback(err.message || 'Error al guardar roles.', true);
    } finally {
      setSaving(false);
    }
  };

  // 2. ROLES ACTIONS
  const handleOpenCreateRole = () => {
    setEditingRole(null);
    setRoleFormData({ name: '', description: '', is_active: true });
    setRoleModalOpen(true);
  };

  const handleOpenEditRole = (r) => {
    setEditingRole(r);
    setRoleFormData({ name: r.name, description: r.description || '', is_active: r.is_active });
    setRoleModalOpen(true);
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingRole) {
        await api.adminGeneral.updateRole(adminUserId, editingRole.role_id, roleFormData);
        showFeedback('Rol actualizado con éxito.');
      } else {
        await api.adminGeneral.createRole(adminUserId, roleFormData);
        showFeedback('Nuevo rol creado con éxito.');
      }
      setRoleModalOpen(false);
      loadAllData();
    } catch (err) {
      showFeedback(err.message || 'Error al guardar el rol.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRoleStatus = async (r) => {
    try {
      await api.adminGeneral.toggleRoleStatus(adminUserId, r.role_id, !r.is_active);
      showFeedback(`Rol ${!r.is_active ? 'activado' : 'desactivado'} con éxito.`);
      loadAllData();
    } catch (err) {
      showFeedback(err.message || 'Error al cambiar estado del rol.', true);
    }
  };

  // 3. PERMISOS ACTIONS
  const handleOpenCreatePerm = () => {
    setEditingPerm(null);
    setPermFormData({ name: '', description: '', is_active: true });
    setPermModalOpen(true);
  };

  const handleOpenEditPerm = (p) => {
    setEditingPerm(p);
    setPermFormData({ name: p.name, description: p.description || '', is_active: p.is_active });
    setPermModalOpen(true);
  };

  const handleSavePerm = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingPerm) {
        await api.adminGeneral.updatePermission(adminUserId, editingPerm.permission_id, permFormData);
        showFeedback('Permiso actualizado con éxito.');
      } else {
        await api.adminGeneral.createPermission(adminUserId, permFormData);
        showFeedback('Nuevo permiso registrado con éxito.');
      }
      setPermModalOpen(false);
      loadAllData();
    } catch (err) {
      showFeedback(err.message || 'Error al guardar permiso.', true);
    } finally {
      setSaving(false);
    }
  };

  // 4. ASIGNACIÓN PERMISOS ROL
  const handleOpenAssignPermRole = (r) => {
    setAssignPermRole(r);
    setSelectedRolePermIds((r.permissions || []).map((p) => p.permission_id));
  };

  const handleSaveRolePermissions = async () => {
    if (!assignPermRole) return;
    setSaving(true);
    try {
      await api.adminGeneral.assignRolePermissions(adminUserId, assignPermRole.role_id, selectedRolePermIds);
      showFeedback(`Permisos actualizados para el rol ${assignPermRole.name}.`);
      setAssignPermRole(null);
      loadAllData();
    } catch (err) {
      showFeedback(err.message || 'Error al asignar permisos al rol.', true);
    } finally {
      setSaving(false);
    }
  };

  // 5. PROGRAMAS ACCIONES
  const handleOpenCreateProg = () => {
    setEditingProg(null);
    setProgFormData({ name: '', faculty_id: '', modality_id: '' });
    setProgModalOpen(true);
  };

  const handleOpenEditProg = (p) => {
    setEditingProg(p);
    setProgFormData({
      name: p.name,
      faculty_id: p.faculty_id ? String(p.faculty_id) : '',
      modality_id: p.modality_id ? String(p.modality_id) : '',
    });
    setProgModalOpen(true);
  };

  const handleSaveProgram = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingProg) {
        await api.adminGeneral.updateProgram(adminUserId, editingProg.program_id, progFormData);
        showFeedback('Programa académico actualizado.');
      } else {
        await api.adminGeneral.createProgram(adminUserId, progFormData);
        showFeedback('Nuevo programa académico creado.');
      }
      setProgModalOpen(false);
      loadAllData();
    } catch (err) {
      showFeedback(err.message || 'Error al guardar el programa académico.', true);
    } finally {
      setSaving(false);
    }
  };

  // Filtros de búsqueda
  const filteredUsers = useMemo(() => {
    if (!searchUser.trim()) return usersList;
    const q = searchUser.toLowerCase().trim();
    return usersList.filter(
      (u) => u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.user_id?.toLowerCase().includes(q)
    );
  }, [usersList, searchUser]);

  const filteredRoles = useMemo(() => {
    if (!searchRole.trim()) return rolesList;
    const q = searchRole.toLowerCase().trim();
    return rolesList.filter(
      (r) => r.name?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)
    );
  }, [rolesList, searchRole]);

  const filteredPerms = useMemo(() => {
    if (!searchPerm.trim()) return permissionsList;
    const q = searchPerm.toLowerCase().trim();
    return permissionsList.filter(
      (p) => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
    );
  }, [permissionsList, searchPerm]);

  const ownProgramName = useMemo(() => {
    if (!ownProgramId) return '';
    return programsList.find((p) => String(p.program_id) === ownProgramId)?.name || '';
  }, [programsList, ownProgramId]);

  // ── VISTA REDUCIDA PARA EL ADMINISTRADOR DE PROGRAMA ──────────────────────
  // No ve usuarios, roles, permisos, programas académicos ni auditoría (eso
  // sigue siendo exclusivo del Administrador General). Solo puede crear,
  // editar, actualizar y eliminar las Líneas y Sublíneas de Investigación
  // de su propio programa, a través del mismo panel de Base de Datos
  // (restringido en el backend a esas dos tablas y a su programa).
  if (isProgramAdminOnly) {
    return (
      <DashboardLayout
        title="Administración de tu Programa"
        subtitle="Gestiona las líneas y sublíneas de investigación de tu programa académico"
      >
        <div className="ag-container">
          <div className="ag-header">
            <div className="ag-header-title">
              <div className="ag-header-icon">
                <ShieldCheck size={26} />
              </div>
              <div className="ag-header-text">
                <h1>Administrador de Programa</h1>
                <p>
                  {ownProgramName
                    ? `Estás administrando el programa: ${ownProgramName}`
                    : 'Tu usuario no tiene un programa académico asignado. Contacta al Administrador General.'}
                </p>
              </div>
            </div>
          </div>

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

          {ownProgramId && (
            <DatabaseManagerPanel adminUserId={adminUserId} lockedProgramId={ownProgramId} />
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Administración General del Sistema"
      subtitle="Módulo centralizado de control de usuarios, roles, permisos y programas académicos"
    >
      <div className="ag-container">
      {/* Header Principal con Filtro de Programa */}
      <div className="ag-header">
        <div className="ag-header-title">
          <div className="ag-header-icon">
            <ShieldCheck size={26} />
          </div>
          <div className="ag-header-text">
            <h1>Administración General del Sistema</h1>
            <p>Módulo centralizado de control de usuarios, roles, permisos y programas académicos</p>
          </div>
        </div>

        <div className="ag-program-filter">
          <Filter size={18} className="ag-program-filter-icon" />
          <label htmlFor="program-filter">Filtro por Programa:</label>
          <select
            id="program-filter"
            className="ag-program-select"
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
          >
            <option value="all">🌐 Todos los programas</option>
            {programsList.map((prog) => (
              <option key={prog.program_id} value={prog.program_id}>
                🎓 {prog.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Avisos. Antes eran tres <div> teñidos a mano que no anunciaban nada a
          la tecnología asistiva: quien usa un lector de pantalla guardaba un
          formulario y no se enteraba del resultado. Alert decide el rol ARIA
          según el tipo del aviso. */}
      {error && (
        <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
      )}
      {successMsg && (
        <Alert type="success" onDismiss={() => setSuccessMsg(null)}>{successMsg}</Alert>
      )}
      {credencialTemporal && (
        <Alert type="warning" title={'Contraseña temporal de ' + credencialTemporal.email}>
          <code className="ag-temp-password">{credencialTemporal.password}</code>
          <p className="ag-temp-password-note">
            Anótala y entrégala ahora: no se puede volver a consultar, porque en la
            base de datos solo se guarda su cifrado.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setCredencialTemporal(null)}>
            Ya la anoté
          </Button>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="ag-stats-grid">
        <div className="ag-stat-card">
          <div className="ag-stat-icon ag-stat-icon--users">
            <Users size={20} />
          </div>
          <div className="ag-stat-info">
            <div className="ag-stat-value">{usersList.length}</div>
            <div className="ag-stat-label">Usuarios Registrados</div>
          </div>
        </div>

        <div className="ag-stat-card">
          <div className="ag-stat-icon ag-stat-icon--roles">
            <Award size={20} />
          </div>
          <div className="ag-stat-info">
            <div className="ag-stat-value">{rolesList.length}</div>
            <div className="ag-stat-label">Roles Activos</div>
          </div>
        </div>

        <div className="ag-stat-card">
          <div className="ag-stat-icon ag-stat-icon--perms">
            <Key size={20} />
          </div>
          <div className="ag-stat-info">
            <div className="ag-stat-value">{permissionsList.length}</div>
            <div className="ag-stat-label">Permisos del Sistema</div>
          </div>
        </div>

        <div className="ag-stat-card">
          <div className="ag-stat-icon ag-stat-icon--programs">
            <Building size={20} />
          </div>
          <div className="ag-stat-info">
            <div className="ag-stat-value">{programsList.length}</div>
            <div className="ag-stat-label">Programas Académicos</div>
          </div>
        </div>

        <div className="ag-stat-card">
          <div className="ag-stat-icon ag-stat-icon--audit">
            <History size={20} />
          </div>
          <div className="ag-stat-info">
            <div className="ag-stat-value">{auditLogs.length}</div>
            <div className="ag-stat-label">Eventos de Auditoría</div>
          </div>
        </div>
      </div>

      {/* Tabs Principales */}
      <div className="ag-tabs">
        <Button icon={ShieldCheck} onClick={handleOpenCreateAdminGeneral}>
          Agregar Admin General
        </Button>
        <Button icon={UserCheck} onClick={handleOpenCreateAdminProgram}>
          Agregar Admin de Programa
        </Button>
        {/* Sigue siendo un <button> nativo y no un Button: es una pestaña, no
            una acción, y su estado activo no corresponde a ninguna variante. */}
        <button
          type="button"
          className={`ag-tab-btn ${activeTab === 'database' ? 'active' : ''}`}
          onClick={() => setActiveTab('database')}
        >
          <Database size={18} /> Base de Datos
        </button>
      </div>

      {/* TAB 8: BASE DE DATOS (CRUD genérico de tablas de catálogo) */}
      {activeTab === 'database' && (
        <DatabaseManagerPanel adminUserId={adminUserId} />
      )}

      {/* MODAL REGISTRAR/EDITAR USUARIO

          Los seis modales de esta pantalla estaban escritos a mano y ninguno
          atrapaba el foco ni se cerraba con Escape. Modal hace las dos cosas y
          además devuelve el foco al botón que lo abrió.

          El botón de envío vive en el pie del modal, fuera del <form>; los une
          el atributo form="...", que existe exactamente para este caso. */}
      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={
          editingUser
            ? 'Editar Perfil de Usuario'
            : userFormMode === 'admin-general'
              ? 'Registrar Administrador General'
              : userFormMode === 'admin-program'
                ? 'Registrar Administrador de Programa'
                : 'Registrar Nuevo Usuario'
        }
        description={
          userFormMode === 'admin-general'
            ? 'Tendrá acceso a todos los programas y al panel de Administración General.'
            : userFormMode === 'admin-program'
              ? 'Solo verá y gestionará la información del programa que elijas abajo.'
              : undefined
        }
        footer={(
          <>
            <Button variant="secondary" onClick={() => setUserModalOpen(false)}>Cancelar</Button>
            <Button type="submit" form="ag-user-form" loading={saving}>
              Guardar Usuario
            </Button>
          </>
        )}
      >
        <form id="ag-user-form" className="ag-form" onSubmit={handleSaveUser}>
          <FormField label="Nombre Completo" required>
            {(field) => (
              <input
                {...field}
                type="text"
                value={userFormData.full_name}
                onChange={(e) => setUserFormData({ ...userFormData, full_name: e.target.value })}
              />
            )}
          </FormField>

          <FormField label="Correo Electrónico" required>
            {(field) => (
              <input
                {...field}
                type="email"
                value={userFormData.email}
                onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
              />
            )}
          </FormField>

          <FormField
            label={editingUser ? 'Contraseña (dejar en blanco para mantener la actual)' : 'Contraseña'}
          >
            {(field) => (
              <input
                {...field}
                type="password"
                placeholder={editingUser ? '••••••••' : 'Se generará una temporal si se deja vacío'}
                value={userFormData.password}
                onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
              />
            )}
          </FormField>

          {userFormMode !== 'admin-general' && (
            <FormField
              label="Programa Académico"
              required={userFormMode === 'admin-program'}
              hint={userFormMode === 'admin-program'
                ? 'Este administrador solo verá y gestionará la información de este programa.'
                : undefined}
            >
              {(field) => (
                <select
                  {...field}
                  value={userFormData.program_id}
                  onChange={(e) => setUserFormData({ ...userFormData, program_id: e.target.value })}
                >
                  <option value="">-- Seleccionar Programa --</option>
                  {programsList.map((prg) => (
                    <option key={prg.program_id} value={prg.program_id}>{prg.name}</option>
                  ))}
                </select>
              )}
            </FormField>
          )}

          {/* El checklist de roles solo se muestra en el formulario genérico:
              los formularios de "Admin General" / "Admin de Programa" ya traen
              el rol correcto preseleccionado, sin que el usuario tenga que
              buscarlo entre la lista.

              Va en un <fieldset> y no en un <label> suelto: el rótulo describe
              al grupo entero, no a una casilla, y un htmlFor aquí apuntaría a
              un control que no existe. */}
          {!editingUser && userFormMode === 'user' && (
            <fieldset className="ag-fieldset">
              <legend className="ag-fieldset-legend">Roles</legend>
              <div className="ag-check-list">
                {rolesList.map((r) => {
                  const checked = userFormData.role_ids.includes(r.role_id);
                  return (
                    <label key={r.role_id} className="ag-check-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setUserFormData((prev) => ({
                            ...prev,
                            role_ids: e.target.checked
                              ? [...prev.role_ids, r.role_id]
                              : prev.role_ids.filter((id) => id !== r.role_id),
                          }));
                        }}
                      />
                      {r.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {editingUser && (
            <p className="ag-hint">
              Para cambiar los roles de un usuario existente usa el botón "Asignar Roles" en la tabla de usuarios.
            </p>
          )}
        </form>
      </Modal>

      {/* MODAL: HACER ADMINISTRADOR DE PROGRAMA A UN DOCENTE YA EXISTENTE */}
      <Modal
        open={programAdminModalOpen}
        onClose={() => setProgramAdminModalOpen(false)}
        title="Agregar Administrador de Programa"
        description="Elige el programa y luego selecciona a uno de los docentes que ya están registrados en él. Ese docente conservará su rol de Docente y además podrá administrar ese programa."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setProgramAdminModalOpen(false)}>Cancelar</Button>
            <Button
              loading={saving}
              disabled={!programAdminProgramId || !programAdminUserId}
              onClick={handleConfirmProgramAdmin}
            >
              Hacer Administrador
            </Button>
          </>
        )}
      >
        <FormField label="Programa Académico">
          {(field) => (
            <select
              {...field}
              value={programAdminProgramId}
              onChange={(e) => {
                setProgramAdminProgramId(e.target.value);
                setProgramAdminUserId('');
              }}
            >
              <option value="">-- Seleccionar Programa --</option>
              {programsList.map((prg) => (
                <option key={prg.program_id} value={prg.program_id}>{prg.name}</option>
              ))}
            </select>
          )}
        </FormField>

        {!programAdminProgramId ? (
          <FormField label="Docente">
            <p className="ag-hint">Primero selecciona un programa.</p>
          </FormField>
        ) : teachersForProgramAdmin.length === 0 ? (
          <FormField label="Docente">
            <p className="ag-hint">
              No hay docentes registrados en este programa todavía. Regístralo primero desde "Registrar Nuevo Usuario"
              con el rol "Docente" y el programa correspondiente.
            </p>
          </FormField>
        ) : (
          <FormField label="Docente">
            {(field) => (
              <select
                {...field}
                value={programAdminUserId}
                onChange={(e) => setProgramAdminUserId(e.target.value)}
              >
                <option value="">-- Seleccionar Docente --</option>
                {teachersForProgramAdmin.map((t) => {
                  const alreadyAdmin = (t.roles || []).some((r) => {
                    const rn = (r.name || '').toLowerCase();
                    return rn.includes('administrador') && !rn.includes('general');
                  });
                  return (
                    <option key={t.user_id} value={t.user_id}>
                      {t.full_name} — {t.email}{alreadyAdmin ? ' (ya es Administrador)' : ''}
                    </option>
                  );
                })}
              </select>
            )}
          </FormField>
        )}
      </Modal>

      {/* MODAL ASIGNAR ROLES A USUARIO */}
      <Modal
        open={Boolean(assignRoleModalUser)}
        onClose={() => setAssignRoleModalUser(null)}
        title={'Asignar Roles a: ' + (assignRoleModalUser?.full_name || '')}
        description="Marca los roles que este usuario debe tener activos en el sistema."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAssignRoleModalUser(null)}>Cancelar</Button>
            <Button onClick={handleSaveUserRoles} loading={saving}>
              Guardar Roles
            </Button>
          </>
        )}
      >
        <fieldset className="ag-fieldset">
          <legend className="ag-fieldset-legend">Roles disponibles</legend>
          <div className="ag-check-list">
            {rolesList.map((r) => {
              const checked = selectedRoleIds.includes(r.role_id);
              return (
                <label key={r.role_id} className="ag-check-item ag-check-item--spaced">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRoleIds([...selectedRoleIds, r.role_id]);
                      } else {
                        setSelectedRoleIds(selectedRoleIds.filter((id) => id !== r.role_id));
                      }
                    }}
                  />
                  <span className="ag-check-name">{r.name}</span>
                  <span className="ag-check-desc">({r.description || 'Sin descripción'})</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </Modal>

      {/* MODAL CONFIGURAR PERMISOS ROL */}
      <Modal
        open={Boolean(assignPermRole)}
        onClose={() => setAssignPermRole(null)}
        title={'Permisos del Rol: ' + (assignPermRole?.name || '')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAssignPermRole(null)}>Cancelar</Button>
            <Button onClick={handleSaveRolePermissions} loading={saving}>
              Guardar Permisos
            </Button>
          </>
        )}
      >
        <fieldset className="ag-fieldset">
          <legend className="ag-fieldset-legend">Permisos disponibles</legend>
          <div className="ag-check-list">
            {permissionsList.map((p) => {
              const checked = selectedRolePermIds.includes(p.permission_id);
              return (
                <label key={p.permission_id} className="ag-check-item ag-check-item--spaced">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRolePermIds([...selectedRolePermIds, p.permission_id]);
                      } else {
                        setSelectedRolePermIds(selectedRolePermIds.filter((id) => id !== p.permission_id));
                      }
                    }}
                  />
                  <span className="ag-check-name ag-check-name--mono">{p.name}</span>
                  <span className="ag-check-desc">({p.description})</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </Modal>

      {/* MODAL ROL */}
      <Modal
        open={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title={editingRole ? 'Editar Rol' : 'Crear Nuevo Rol'}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRoleModalOpen(false)}>Cancelar</Button>
            <Button type="submit" form="ag-role-form" loading={saving}>
              Guardar Rol
            </Button>
          </>
        )}
      >
        <form id="ag-role-form" className="ag-form" onSubmit={handleSaveRole}>
          <FormField label="Nombre del Rol" required>
            {(field) => (
              <input
                {...field}
                type="text"
                value={roleFormData.name}
                onChange={(e) => setRoleFormData({ ...roleFormData, name: e.target.value })}
              />
            )}
          </FormField>

          <FormField label="Descripción">
            {(field) => (
              <input
                {...field}
                type="text"
                value={roleFormData.description}
                onChange={(e) => setRoleFormData({ ...roleFormData, description: e.target.value })}
              />
            )}
          </FormField>
        </form>
      </Modal>

      {/* MODAL PERMISO */}
      <Modal
        open={permModalOpen}
        onClose={() => setPermModalOpen(false)}
        title={editingPerm ? 'Editar Permiso' : 'Crear Nuevo Permiso'}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setPermModalOpen(false)}>Cancelar</Button>
            <Button type="submit" form="ag-perm-form" loading={saving}>
              Guardar Permiso
            </Button>
          </>
        )}
      >
        <form id="ag-perm-form" className="ag-form" onSubmit={handleSavePerm}>
          <FormField
            label="Identificador del Permiso"
            hint="En minúsculas y sin espacios, por ejemplo: manage_users"
            required
          >
            {(field) => (
              <input
                {...field}
                type="text"
                className={`${field.className} ag-input-mono`}
                value={permFormData.name}
                onChange={(e) => setPermFormData({ ...permFormData, name: e.target.value })}
              />
            )}
          </FormField>

          <FormField label="Descripción">
            {(field) => (
              <input
                {...field}
                type="text"
                value={permFormData.description}
                onChange={(e) => setPermFormData({ ...permFormData, description: e.target.value })}
              />
            )}
          </FormField>
        </form>
      </Modal>

      {/* MODAL PROGRAMA ACADÉMICO */}
      <Modal
        open={progModalOpen}
        onClose={() => setProgModalOpen(false)}
        title={editingProg ? 'Editar Programa Académico' : 'Crear Programa Académico'}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setProgModalOpen(false)}>Cancelar</Button>
            <Button type="submit" form="ag-program-form" loading={saving}>
              Guardar Programa
            </Button>
          </>
        )}
      >
        <form id="ag-program-form" className="ag-form" onSubmit={handleSaveProgram}>
          <FormField label="Nombre del Programa" required>
            {(field) => (
              <input
                {...field}
                type="text"
                value={progFormData.name}
                onChange={(e) => setProgFormData({ ...progFormData, name: e.target.value })}
              />
            )}
          </FormField>

          <FormField label="Facultad">
            {(field) => (
              <select
                {...field}
                value={progFormData.faculty_id}
                onChange={(e) => setProgFormData({ ...progFormData, faculty_id: e.target.value })}
              >
                <option value="">-- Seleccionar Facultad --</option>
                {facultiesList.map((f) => (
                  <option key={f.faculty_id} value={f.faculty_id}>{f.name}</option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="Modalidad">
            {(field) => (
              <select
                {...field}
                value={progFormData.modality_id}
                onChange={(e) => setProgFormData({ ...progFormData, modality_id: e.target.value })}
              >
                <option value="">-- Seleccionar Modalidad --</option>
                {modalitiesList.map((m) => (
                  <option key={m.modality_id} value={m.modality_id}>{m.name}</option>
                ))}
              </select>
            )}
          </FormField>
        </form>
      </Modal>
      </div>
    </DashboardLayout>
  );
}
