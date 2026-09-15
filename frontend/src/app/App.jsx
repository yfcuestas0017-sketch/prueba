import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ProgramFilterProvider } from '../context/ProgramFilterContext';
import ProtectedRoute from '../routes/ProtectedRoute';

import ErrorBoundary from '../components/ui/ErrorBoundary';

import Login from '../features/auth/Login';
import Dashboard from '../features/dashboard/Dashboard';
import AjustesPage from '../features/ajustes/Ajustes';
import { ProyectosPage } from '../features/proyectos/ProyectosPage';
import { UsuariosPage } from '../features/usuarios/UsuariosPage';
import GestionDocente from '../features/gestion-docente/GestionDocente';
import BancoProyectos from '../features/banco-proyectos/BancoProyectos';
import ReportesPage from '../features/reportes/ReportesPage';
import AdminGeneralPage from '../features/admin-general/AdminGeneralPage';

import '../styles/globals.css';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ProgramFilterProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/proyectos" element={<ProtectedRoute><ProyectosPage /></ProtectedRoute>} />
                {/* requiredRole="admin" habilita tanto al Administrador General como
                    al Administrador de Programa; AdminGeneralPage decide internamente
                    qué tanto de la pantalla mostrarle a cada uno. */}
                <Route path="/administracion-general" element={<ProtectedRoute requiredRole="admin"><AdminGeneralPage /></ProtectedRoute>} />
                <Route path="/reportes" element={<ProtectedRoute requiredRole="admin"><ReportesPage /></ProtectedRoute>} />
                <Route path="/subir" element={<ProtectedRoute excludedRole={['docente', 'estudiante']}><GestionDocente /></ProtectedRoute>} />
                <Route path="/facultades" element={<ProtectedRoute><BancoProyectos /></ProtectedRoute>} />
                <Route path="/usuarios" element={<ProtectedRoute requiredRole="admin"><UsuariosPage /></ProtectedRoute>} />
                <Route path="/ajustes" element={<ProtectedRoute><AjustesPage /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </ProgramFilterProvider>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
