# Arquitectura de Directorios y Organización del Proyecto

Este documento detalla la estructura modular de la plataforma universitaria de **Gestión de Proyectos de Grado (Universidad CESMAG)**. La organización sigue el patrón **Feature-Driven Development (FDD)** en el Frontend y una estructura de micro-módulos en el Backend.

---

## 📂 Estructura General del Proyecto

`
TrabajoGrado/
├── docs/                      # Documentación técnica y guía de arquitectura
├── public/                    # Archivos estáticos institucionales (logos, escudos, favicon)
├── server/                    # Servidor backend Express API + PostgreSQL
│   ├── chatbook/              # Asistente virtual institucional y motor de reglamento
│   │   └── regulation/        # Datos y buscador del reglamento de modalidad de grado
│   ├── migrations/            # Scripts de migración e inicialización de tablas DB
│   ├── chatbook_degree_options.js  # Motor de opciones de grado para el Chatbook
│   ├── db.js                  # Pool de conexiones a PostgreSQL (BaseDatosGrado)
│   ├── index.js               # Servidor API Express principal (Endpoints & RBAC)
│   ├── project_bank_helpers.js# Funciones auxiliares para la gestión de banco de proyectos
│   └── start-all.js           # Launcher concurrente de Backend + Frontend Vite
├── src/                       # Aplicación Frontend React + Vite
│   ├── app/                   # Configuración global del enrutador de la app
│   │   └── App.jsx            # Definición de rutas principales y guardianes de acceso
│   ├── assets/                # Recursos gráficos y multimedia
│   ├── components/            # Componentes reutilizables compartidos
│   │   ├── analytics/         # Tableros de analítica y métricas con Recharts
│   │   ├── chatbook/          # Widget interactivo del asistente de reglamento
│   │   ├── layout/            # Layout maestro (DashboardLayout, Header, Sidebar)
│   │   └── ui/                # Componentes atómicos e interfaz base (ErrorBoundary)
│   ├── context/               # Proveedores de estado global (AuthContext, ThemeContext)
│   ├── features/              # Módulos por dominio de negocio (Feature-Based)
│   │   ├── admin-general/     # Módulo interactivo del Administrador General del Sistema
│   │   ├── ajustes/           # Panel de configuración de usuario y modo oscuro
│   │   ├── auth/              # Login y autenticación de usuarios
│   │   ├── banco-proyectos/   # Propuestas y banco de proyectos institucionales
│   │   ├── dashboard/         # Landing hero y panel académico principal
│   │   ├── gestion-docente/   # Módulo de carga y asignación docente
│   │   ├── proyectos/         # Gestión de proyectos, creación y edición
│   │   ├── reportes/          # Generador de informes institucionales en PDF y Word
│   │   └── usuarios/          # Administración de usuarios y roles
│   ├── hooks/                 # Hooks personalizados de React
│   ├── lib/                   # Cliente API (axios/fetch) y generadores de documentos
│   │   ├── api.js             # Métodos HTTP centralizados para comunicación backend
│   │   ├── reportDocxGenerator.js # Exportación de reportes en Microsoft Word (.docx)
│   │   └── reportPdfGenerator.js  # Exportación de reportes en PDF (.pdf)
│   ├── routes/                # Controladores de acceso y guardianes de navegación
│   │   └── ProtectedRoute.jsx # Guardián de rutas protegidas y RBAC
│   └── styles/                # Hojas de estilo globales y variables de tema
│       └── globals.css        # Reset CSS y paleta de colores UCESMAG
├── scratch/                   # Scripts de automatización, pruebas y mantenimientos
├── package.json               # Dependencias del proyecto y scripts de ejecución
└── vite.config.js             # Configuración del empaquetador Vite y proxy backend
`

---

## 🛠️ Organización del Frontend (src/)

El frontend está estructurado para maximizar la mantenibilidad y modularidad:

1. **src/features/**: Cada funcionalidad principal se encapsula en su propia carpeta con sus componentes JSX y estilos CSS dedicados.
2. **src/components/layout/**: Define la estructura visual institucional (*Sidebar*, *Header*, *DashboardLayout*) garantizando consistencia y adaptabilidad (modo claro / oscuro).
3. **src/lib/api.js**: Centraliza todas las llamadas HTTP al backend Express (http://127.0.0.1:5000).

---

## ⚙️ Organización del Backend (server/)

El backend está construido con Express y PostgreSQL:

1. **server/index.js**: Proporciona las rutas REST protegidas para usuarios, roles, permisos, proyectos, banco de propuestas, auditoría e historia.
2. **server/db.js**: Gestiona el pool de conexiones seguras hacia la base de datos BaseDatosGrado.
3. **server/chatbook/**: Contiene la lógica del asistente inteligente para la consulta interactiva del reglamento académico.

---

## 🔒 Preservación de Código y Funcionamiento

Toda la estructura de archivos e importaciones se mantiene 100% compatible y sin modificaciones destructivas para garantizar la estabilidad operativa del sistema.
