import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ProgramFilterProvider } from '../context/ProgramFilterContext';
import ProtectedRoute from '../routes/ProtectedRoute';

import ErrorBoundary from '../components/ui/ErrorBoundary';

/* Login se carga de entrada: es la primera pantalla que ve cualquiera y
   diferirla solo añadiría un parpadeo antes del formulario. */
import Login from '../features/auth/Login';

/* ──────────────────────────────────────────────────────────────────────────
   CARGA DIFERIDA POR RUTA

   Las nueve pantallas se importaban a la vez, así que el navegador descargaba
   1,6 MB de JavaScript —incluidas jsPDF, docx y html2canvas, que solo usa
   Reportes— antes de poder pintar el formulario de inicio de sesión.

   Con lazy(), cada pantalla viaja en su propio archivo y se descarga la primera
   vez que alguien entra en ella. Un estudiante que nunca abre Reportes nunca
   descarga las librerías de exportación.
   ────────────────────────────────────────────────────────────────────────── */
const Dashboard        = lazy(() => import('../features/dashboard/Dashboard'));
const AjustesPage      = lazy(() => import('../features/ajustes/Ajustes'));
const ProyectosPage    = lazy(() => import('../features/proyectos/ProyectosPage').then((m) => ({ default: m.ProyectosPage })));
const UsuariosPage     = lazy(() => import('../features/usuarios/UsuariosPage').then((m) => ({ default: m.UsuariosPage })));
const GestionDocente   = lazy(() => import('../features/gestion-docente/GestionDocente'));
const BancoProyectos   = lazy(() => import('../features/banco-proyectos/BancoProyectos'));
const ReportesPage     = lazy(() => import('../features/reportes/ReportesPage'));
const AdminGeneralPage = lazy(() => import('../features/admin-general/AdminGeneralPage'));

/* role="status" con aria-live: quien usa lector de pantalla también se entera
   de que la pantalla está cargando, no solo quien la ve. */
function CargandoRuta() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      Cargando…
    </div>
  );
}

import '../styles/globals.css';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ProgramFilterProvider>
              <Suspense fallback={<CargandoRuta />}>
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
              </Suspense>
            </ProgramFilterProvider>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
