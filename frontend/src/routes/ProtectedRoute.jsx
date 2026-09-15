import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userIsGeneralAdmin, userIsAnyAdmin, normalizeRoleName } from '../lib/roles';

export default function ProtectedRoute({ children, requiredRole, excludedRole }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--border-color)',
            borderTopColor: 'var(--accent-primary)',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const canBypassRoleCheck = user.authMode === 'local';

  // Antes esta verificación solo miraba `user.role` (el rol "principal").
  // Un usuario con varios roles (p. ej. Administrador de Programa, que
  // conserva Docente + Administrador) ahora también trae `user.roles`
  // (arreglo completo). Se revisan ambos para no bloquear por accidente a
  // alguien que sí tiene el rol requerido, pero en el que el rol principal
  // resuelto no coincidió exactamente.
  const isAdminGeneral = userIsGeneralAdmin(user);

  if (isAdminGeneral || canBypassRoleCheck) {
    return children;
  }

  const normalizedRequiredRole = requiredRole?.toLowerCase();
  const userRoleNames = [user.role, ...(Array.isArray(user.roles) ? user.roles : [])]
    .map(normalizeRoleName)
    .filter(Boolean);

  const roleMatches = !normalizedRequiredRole
    ? true
    : normalizedRequiredRole === 'admin'
      ? userIsAnyAdmin(user)
      : userRoleNames.includes(normalizedRequiredRole);

  if (requiredRole && !roleMatches) {
    return <Navigate to="/dashboard" replace />;
  }

  if (excludedRole) {
    const isExcluded = Array.isArray(excludedRole) 
      ? excludedRole.includes(user.role) 
      : user.role === excludedRole;
      
    if (isExcluded) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children;
}
