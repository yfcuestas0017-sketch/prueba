/**
 * Funciones auxiliares para el Banco de Proyectos:
 * - Consulta de contexto de usuario (rol y programa real en BD).
 * - Registro estructurado de historial y auditoría en public.project_bank_histories.
 * - Cálculo de diferencias (diff) estructuradas en formato JSONB.
 */

// Orden de prioridad para resolver el "rol principal" cuando un usuario
// tiene más de un rol asignado (p. ej. un "Administrador de Programa" que
// conserva su rol de Docente además del rol Administrador).
const ROLE_PRIORITY = ['administrador general', 'administrador', 'docente', 'estudiante'];

function isGeneralAdminName(name) {
  const n = (name || '').toLowerCase();
  return n.includes('administrador general') || n.includes('admin general');
}

function isProgramAdminName(name) {
  const n = (name || '').toLowerCase();
  return (n.includes('administrador') || n === 'admin') && !isGeneralAdminName(n);
}

function isDocenteName(name) {
  const n = (name || '').toLowerCase();
  return n.includes('docente') || n.includes('profesor');
}

function pickPrimaryRoleName(roleNames) {
  if (!roleNames || roleNames.length === 0) return 'estudiante';
  if (roleNames.some(isGeneralAdminName)) {
    return roleNames.find(isGeneralAdminName);
  }
  if (roleNames.some(isProgramAdminName)) {
    return roleNames.find(isProgramAdminName);
  }
  if (roleNames.some(isDocenteName)) {
    return roleNames.find(isDocenteName);
  }
  return roleNames[0];
}

/**
 * Resuelve el contexto completo de un usuario: todos sus roles, el rol
 * "principal" (según prioridad) y banderas booleanas listas para usar en
 * las validaciones de permisos, evitando la ambigüedad de tomar un único
 * rol arbitrario (LIMIT 1) cuando el usuario tiene varios roles asignados.
 */
export async function getUserContext(client, userId) {
  if (!userId) return null;
  const query = `
    SELECT u.user_id, u.full_name, u.email, u.program_id,
           r.name as role_name,
           pr.name as program_name
    FROM public.users u
    LEFT JOIN public.user_roles ur ON u.user_id = ur.user_id
    LEFT JOIN public.roles r ON ur.role_id = r.role_id
    LEFT JOIN public.programs pr ON u.program_id = pr.program_id
    WHERE u.user_id::text = $1;
  `;
  const res = await client.query(query, [String(userId)]);
  if (res.rows.length === 0) return null;

  const base = res.rows[0];
  const roleNames = res.rows.map((r) => r.role_name).filter(Boolean);
  const isGeneralAdmin = roleNames.some(isGeneralAdminName);
  const isProgramAdmin = !isGeneralAdmin && roleNames.some(isProgramAdminName);
  const isDocente = roleNames.some(isDocenteName);
  const primaryRoleName = pickPrimaryRoleName(roleNames);

  return {
    user_id: base.user_id,
    full_name: base.full_name,
    email: base.email,
    program_id: base.program_id,
    program_name: base.program_name,
    // Compatibilidad con código existente que espera un único role_name
    // (en minúsculas, por defecto 'estudiante' si no tiene rol asignado).
    role_name: (primaryRoleName || 'estudiante').toLowerCase(),
    role_names: roleNames,
    is_general_admin: isGeneralAdmin,
    is_program_admin: isProgramAdmin,
    is_docente: isDocente,
    is_student: !isGeneralAdmin && !isProgramAdmin && !isDocente,
  };
}

export async function recordProjectBankHistory(client, {
  projectBankId,
  userId,
  action,
  previousStatus,
  newStatus,
  changes,
}) {
  const query = `
    INSERT INTO public.project_bank_histories (
      project_bank_id, user_id, action, previous_status, new_status, changes, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const res = await client.query(query, [
    parseInt(projectBankId, 10),
    String(userId),
    action,
    previousStatus || null,
    newStatus || null,
    changes ? JSON.stringify(changes) : null,
  ]);
  return res.rows[0];
}

export function computeProjectBankDiff(oldProject, updatedFields) {
  const diff = {};
  const fieldMappings = [
    { dbField: 'title', inputField: 'title', name: 'Título' },
    { dbField: 'description', inputField: 'description', name: 'Descripción' },
    { dbField: 'general_objective', inputField: 'generalObjective', name: 'Objetivo General' },
    { dbField: 'specific_objectives', inputField: 'specificObjectives', name: 'Objetivos Específicos' },
    { dbField: 'research_line_id', inputField: 'researchLineId', name: 'Línea de Investigación' },
    { dbField: 'research_subline_id', inputField: 'researchSublineId', name: 'Sublínea de Investigación' },
    { dbField: 'program_id', inputField: 'programId', name: 'Programa Académico' },
    { dbField: 'keywords', inputField: 'keywords', name: 'Palabras Clave' },
    { dbField: 'observations', inputField: 'observations', name: 'Observaciones' },
  ];

  for (const f of fieldMappings) {
    const oldVal = oldProject[f.dbField];
    const newVal = updatedFields[f.inputField] !== undefined 
      ? updatedFields[f.inputField] 
      : updatedFields[f.dbField];

    if (newVal !== undefined && newVal !== null) {
      const normalizedOld = String(oldVal ?? '').trim();
      const normalizedNew = String(newVal ?? '').trim();
      if (normalizedOld !== normalizedNew) {
        diff[f.dbField] = {
          label: f.name,
          before: oldVal !== null && oldVal !== undefined ? oldVal : null,
          after: newVal,
        };
      }
    }
  }

  return Object.keys(diff).length > 0 ? diff : { info: 'Actualización sin modificación de campos clave' };
}
