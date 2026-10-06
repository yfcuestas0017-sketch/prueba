import { createContext, useContext, useEffect, useState } from 'react';
import api from '../lib/api';
import {
  getToken,
  getStoredUser,
  saveSession,
  clearSession,
  EVENTO_SESION_EXPIRADA,
} from '../lib/session';

const AuthContext = createContext(null);

function formatNameFromEmail(email) {
  const localPart = email.split('@')[0] || '';
  const cleaned = localPart.replace(/[._-]+/g, ' ').trim();

  if (!cleaned) return 'Usuario';

  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeUser(storedUser) {
  if (!storedUser || typeof storedUser !== 'object') return null;

  const email = typeof storedUser.email === 'string'
    ? storedUser.email.trim().toLowerCase()
    : '';

  if (!email) return null;

  let rawRole = storedUser.role || storedUser.role_name || 'usuario';
  if (typeof rawRole === 'object' && rawRole !== null) {
    rawRole = rawRole.name || rawRole.role_name || 'usuario';
  }
  const roleString = String(rawRole).toLowerCase();

  // Un usuario puede tener más de un rol asignado (p. ej. "Administrador
  // de Programa" conserva también el rol "Docente"). `roles` trae la
  // lista completa de nombres de rol devuelta por el backend, para que
  // las pantallas puedan verificar cualquiera de ellos y no solo el
  // "rol principal" resuelto en `role`.
  const rolesList = Array.isArray(storedUser.roles)
    ? storedUser.roles.filter(Boolean).map((r) => (typeof r === 'string' ? r : (r?.name || '')))
    : [];

  return {
    id: storedUser.id ? String(storedUser.id) : (storedUser.user_id ? String(storedUser.user_id) : null),
    name: storedUser.name || storedUser.full_name || formatNameFromEmail(email),
    email,
    role: roleString,
    roles: rolesList,
    faculty: storedUser.faculty ?? null,
    programId: storedUser.programId ?? storedUser.program_id ?? null,
    programName: storedUser.programName ?? storedUser.program_name ?? null,
    roleId: storedUser.roleId ?? storedUser.role_id ?? null,
    permissions: Array.isArray(storedUser.permissions) ? storedUser.permissions : [],
    avatar: storedUser.avatar ?? null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    /**
     * Restaura la sesión al abrir la aplicación.
     *
     * Sin token no hay sesión, aunque haya quedado un usuario guardado: el
     * usuario guardado solo sirve para pintar la interfaz de inmediato, y quien
     * decide qué se puede hacer es el token que acompaña a cada petición.
     */
    const restoreSession = () => {
      try {
        const token = getToken();
        const restoredUser = token ? normalizeUser(getStoredUser()) : null;

        if (restoredUser) {
          if (mounted) setUser(restoredUser);
          return;
        }

        clearSession();
        if (mounted) setUser(null);
      } catch {
        clearSession();
      } finally {
        if (mounted) setLoading(false);
      }
    };

    restoreSession();

    // El cliente HTTP avisa cuando el servidor rechaza el token; la sesión se
    // cierra en toda la aplicación a la vez.
    const alExpirar = () => {
      if (mounted) setUser(null);
    };
    window.addEventListener(EVENTO_SESION_EXPIRADA, alExpirar);

    return () => {
      mounted = false;
      window.removeEventListener(EVENTO_SESION_EXPIRADA, alExpirar);
    };
  }, []);

  const login = async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      throw new Error('Ingresa correo y contraseña.');
    }

    const response = await api.login(normalizedEmail, normalizedPassword);
    const databaseUser = normalizeUser(response.user);

    setUser(databaseUser);
    saveSession(databaseUser, response.token);
    return databaseUser;
  };

  const register = async (fields) => {
    const response = await api.register(fields);
    const newUser = normalizeUser(response.user);
    setUser(newUser);
    saveSession(newUser, response.token);
    return newUser;
  };

  const logout = async () => {
    setUser(null);
    clearSession();
  };

  const updateUser = (updates) => {
    if (!user) return;
    const updatedUser = normalizeUser({ ...user, ...updates });
    if (!updatedUser) return;

    setUser(updatedUser);
    saveSession(updatedUser, null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updateUser,
        authProvider: 'postgres-base-datos-grado',
        isSupabaseEnabled: false,
        configurationIssue: '',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
