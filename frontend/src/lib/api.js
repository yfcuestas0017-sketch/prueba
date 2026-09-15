const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Error en la petición al servidor.');
  }

  return data;
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),

  register: (fields) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(fields),
  }),

  // Catalogs
  getCatalogs: (programId = null) => request(`/catalogs${programId ? `?program_id=${encodeURIComponent(programId)}` : ''}`),
  getDegreeOptions: (programId = null) => request(`/degree-options${programId && programId !== 'all' ? `?programId=${encodeURIComponent(programId)}` : ''}`),
  getTeachers: (programId = null, userId = null) => {
    const params = new URLSearchParams();
    if (programId && programId !== 'all') params.append('programId', programId);
    if (userId) params.append('userId', userId);
    const qs = params.toString();
    return request(`/teachers${qs ? `?${qs}` : ''}`);
  },

  // Users
  checkCoauthor: (email) => request(`/users/check-coauthor?email=${encodeURIComponent(email)}`),
  getStudentResearchProcess: (userId) => request(`/students/${encodeURIComponent(userId)}/research-process`),
  updateStudentAcademicProfile: (userId, semesterId) => request(`/students/${encodeURIComponent(userId)}/academic-profile`, {
    method: 'PUT',
    body: JSON.stringify({ semesterId }),
  }),
  getAcademicSettings: (userId) => request(`/admin/academic-settings?userId=${encodeURIComponent(userId)}`),
  updateSemesterDates: (userId, semesterId, startDate, endDate) => request(`/admin/semesters/${semesterId}/dates`, {
    method: 'PUT',
    body: JSON.stringify({ userId, startDate, endDate }),
  }),
  applyAcademicPromotion: (userId, referenceDate) => request('/admin/academic-promotion', {
    method: 'POST',
    body: JSON.stringify({ userId, referenceDate }),
  }),
  getResearchProgress: (projectId, userId) => request(`/projects/${projectId}/research-progress?userId=${encodeURIComponent(userId)}`),
  createResearchProgress: (projectId, userId, description) => request(`/projects/${projectId}/research-progress`, {
    method: 'POST',
    body: JSON.stringify({ userId, description }),
  }),
  getResearchDocuments: (projectId, userId) => request(`/projects/${projectId}/research-documents?userId=${encodeURIComponent(userId)}`),
  createResearchDocument: (projectId, payload) => request(`/projects/${projectId}/research-documents`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  // Projects
  getProjects: (programId = null) => request(`/projects${programId ? `?programId=${encodeURIComponent(programId)}` : ''}`),

  createProject: (projectData) => request('/projects', {
    method: 'POST',
    body: JSON.stringify(projectData),
  }),

  updateProject: (id, projectData, userId = null) => request(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...projectData, userId: userId || projectData.userId }),
  }),

  updateProjectParticipants: (id, participants, userId = null) => request(`/projects/${id}/participants`, {
    method: 'PUT',
    body: JSON.stringify({ participants, userId }),
  }),
  deleteProject: (id) => request(`/projects/${id}`, {
    method: 'DELETE',
  }),

  getProjectHistory: (id, userId = null) => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return request(`/projects/${id}/history${query}`);
  },

  // Reports
  getDetailedReportProjects: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '' && val !== 'all') {
        params.append(key, val);
      }
    });
    const queryString = params.toString();
    return request(`/reports/detailed${queryString ? `?${queryString}` : ''}`);
  },

  getProjectReportDetail: (id) => request(`/reports/projects/${id}`),

  queryChatbook: (userId, message) => request('/chatbook/query', {
    method: 'POST',
    body: JSON.stringify({ userId, message }),
  }),

  // Analytics
  getAnalytics: (adminProgramId = null) => request(`/analytics${adminProgramId ? `?adminProgramId=${adminProgramId}` : ''}`),

  // Banco de Proyectos
  getProjectBank: (filters = {}, userId = null) => {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '' && val !== 'all') {
        params.append(key, val);
      }
    });
    const queryString = params.toString();
    return request(`/project-bank${queryString ? `?${queryString}` : ''}`);
  },

  getProjectBankDetail: (id, userId = null) => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return request(`/project-bank/${id}${query}`);
  },

  getProjectBankHistory: (id, userId = null) => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return request(`/project-bank/${id}/history${query}`);
  },

  createProjectBankIdea: (payload) => request('/project-bank', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  updateProjectBankIdea: (id, payload) => request(`/project-bank/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }),

  toggleProjectBankStatus: (id, status, userRole, userId = null) => request(`/project-bank/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, userRole, userId }),
  }),

  selectProjectBankIdea: (id, studentId) => request(`/project-bank/${id}/select`, {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  }),

  getStudentAssignedProject: (studentId) => request(`/project-bank/student/${encodeURIComponent(studentId)}`),

  // Administración General del Sistema
  adminGeneral: {
    getUsers: (adminUserId, programId = 'all') =>
      request(`/admin/general/users?adminUserId=${encodeURIComponent(adminUserId)}&programId=${encodeURIComponent(programId)}`),

    createUser: (adminUserId, userData) =>
      request('/admin/general/users', {
        method: 'POST',
        body: JSON.stringify({ adminUserId, ...userData }),
      }),

    updateUser: (adminUserId, userId, userData) =>
      request(`/admin/general/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        body: JSON.stringify({ adminUserId, ...userData }),
      }),

    toggleUserStatus: (adminUserId, userId, is_active) =>
      request(`/admin/general/users/${encodeURIComponent(userId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ adminUserId, is_active }),
      }),

    assignUserRoles: (adminUserId, userId, roleIds) =>
      request(`/admin/general/users/${encodeURIComponent(userId)}/roles`, {
        method: 'POST',
        body: JSON.stringify({ adminUserId, roleIds }),
      }),

    getRoles: (adminUserId) =>
      request(`/admin/general/roles?adminUserId=${encodeURIComponent(adminUserId)}`),

    createRole: (adminUserId, roleData) =>
      request('/admin/general/roles', {
        method: 'POST',
        body: JSON.stringify({ adminUserId, ...roleData }),
      }),

    updateRole: (adminUserId, roleId, roleData) =>
      request(`/admin/general/roles/${roleId}`, {
        method: 'PUT',
        body: JSON.stringify({ adminUserId, ...roleData }),
      }),

    toggleRoleStatus: (adminUserId, roleId, is_active) =>
      request(`/admin/general/roles/${roleId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ adminUserId, is_active }),
      }),

    assignRolePermissions: (adminUserId, roleId, permissionIds) =>
      request(`/admin/general/roles/${roleId}/permissions`, {
        method: 'POST',
        body: JSON.stringify({ adminUserId, permissionIds }),
      }),

    getPermissions: (adminUserId) =>
      request(`/admin/general/permissions?adminUserId=${encodeURIComponent(adminUserId)}`),

    createPermission: (adminUserId, permData) =>
      request('/admin/general/permissions', {
        method: 'POST',
        body: JSON.stringify({ adminUserId, ...permData }),
      }),

    updatePermission: (adminUserId, permissionId, permData) =>
      request(`/admin/general/permissions/${permissionId}`, {
        method: 'PUT',
        body: JSON.stringify({ adminUserId, ...permData }),
      }),

    assignUserPermissions: (adminUserId, userId, permissionIds) =>
      request(`/admin/general/users/${encodeURIComponent(userId)}/permissions`, {
        method: 'POST',
        body: JSON.stringify({ adminUserId, permissionIds }),
      }),

    getPrograms: (adminUserId) =>
      request(`/admin/general/programs?adminUserId=${encodeURIComponent(adminUserId)}`),

    createProgram: (adminUserId, programData) =>
      request('/admin/general/programs', {
        method: 'POST',
        body: JSON.stringify({ adminUserId, ...programData }),
      }),

    updateProgram: (adminUserId, programId, programData) =>
      request(`/admin/general/programs/${programId}`, {
        method: 'PUT',
        body: JSON.stringify({ adminUserId, ...programData }),
      }),

    getAuditHistory: (adminUserId, programId = 'all') =>
      request(`/admin/general/audit-history?adminUserId=${encodeURIComponent(adminUserId)}&programId=${encodeURIComponent(programId)}`),

    // CRUD genérico de tablas de catálogo de la base de datos
    dbGetTables: (adminUserId) =>
      request(`/admin/general/db/tables?adminUserId=${encodeURIComponent(adminUserId)}`),

    dbListRows: (adminUserId, tableKey, programId = null) => {
      const params = new URLSearchParams({ adminUserId });
      if (programId && programId !== 'all') params.append('programId', programId);
      return request(`/admin/general/db/${tableKey}?${params.toString()}`);
    },

    dbCreateRow: (adminUserId, tableKey, rowData) =>
      request(`/admin/general/db/${tableKey}`, {
        method: 'POST',
        body: JSON.stringify({ adminUserId, ...rowData }),
      }),

    dbUpdateRow: (adminUserId, tableKey, id, rowData) =>
      request(`/admin/general/db/${tableKey}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ adminUserId, ...rowData }),
      }),

    dbDeleteRow: (adminUserId, tableKey, id) =>
      request(`/admin/general/db/${tableKey}/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ adminUserId }),
      }),
  },
};

export default api;
