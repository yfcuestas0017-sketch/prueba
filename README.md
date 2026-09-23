# Plataforma de Gestión de Proyectos de Grado — Universidad CESMAG

Sistema integral para la administración, trazabilidad y control académico de proyectos de grado en la Universidad CESMAG.

## 🚀 Inicio Rápido

### 1. Requisitos Previos
- Node.js (v18+)
- PostgreSQL (BaseDatosGrado)

### 2. Ejecutar Servidores (Backend + Frontend)
`ash
npm run dev
`
- **Backend API**: http://localhost:5000
- **Frontend App**: http://localhost:5173

---

## 📂 Organización de Carpetas y Arquitectura

Para consultar el detalle completo de la arquitectura del código y la estructura de carpetas tanto del **Frontend (src/)** como del **Backend (server/)**, revisa el documento oficial de arquitectura:

👉 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

### Resumen de la Estructura:
- **src/features/**: Módulos funcionales desacoplados (*admin-general*, *proyectos*, *banco-proyectos*, *usuarios*, *gestion-docente*, *reportes*, *ajustes*, *auth*, *dashboard*).
- **src/components/**: Layout maestro institucional (*DashboardLayout*, *Header*, *Sidebar*), *Chatbook* y componentes atómicos.
- **src/lib/**: Cliente API y generadores institucionales de reportes PDF y Word.
- **server/**: API REST en Express.js con PostgreSQL, trazabilidad de auditoría, motor de RBAC y asistente inteligente de reglamento.

---

## 🔐 Roles del Sistema

- **Administrador General del Sistema**: Acceso total, gestión interactiva 100% libre de SQL para usuarios, roles, permisos, carreras y trazabilidad.
- **Administrador**: Gestión operativa de usuarios, reportes y proyectos.
- **Docente**: Formulación de propuestas, revisión y seguimiento de proyectos de grado.
- **Estudiante**: Registro de proyectos de grado, asignación y seguimiento de modalidad.
