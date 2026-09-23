# Arquitectura del proyecto — GradoHub

Plataforma de Gestión de Proyectos de Grado · Universidad CESMAG

> **Nota de actualización.** Hasta septiembre de 2026 este documento describía una
> estructura con las carpetas `server/` y `src/` en la raíz. Ese reparto cambió: el
> proyecto se separó en dos aplicaciones autónomas, `backend/` y `frontend/`, y las
> rutas antiguas ya no existen. Lo que sigue corresponde al código real.

---

## 1. Topología

Son **dos aplicaciones independientes** que se comunican solo por HTTP. No hay
imports cruzados en ninguna dirección ni una sola consulta SQL en el frontend.

```
                    npm run dev  →  scripts/start-all.js
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
        frontend/  (Vite :5173)         backend/  (Express :5000)
        React 18 + React Router 6       Express 5 + pg
                 │                               │
                 │  fetch('/api/...')            │
                 └──► proxy de Vite ─────────────┤
                      /api → 127.0.0.1:5000      │
                                                 ▼
                                    PostgreSQL «BaseDatosGrado»
```

`scripts/start-all.js` lanza los dos procesos en paralelo y los detiene juntos.

---

## 2. Estructura de carpetas

```
TrabajoGrado/
├── .env.example               Plantilla de variables de entorno (la real, .env.local, NO se versiona)
├── docs/                      Documentación técnica
├── scripts/                   Orquestador de arranque y baterías de prueba
│   ├── start-all.js           Lanza backend y frontend a la vez
│   ├── test-chatbook.js       88 preguntas contra el Chatbook (npm run test:chatbook)
│   ├── test-concurrency.js    Pruebas de condiciones de carrera (npm run test:concurrency)
│   └── reglamento/            Pipeline PDF → JSON → regulation_data.js (ver su README)
│
├── database/migrations/       Migraciones SQL MANUALES — no las ejecuta ningún código
│
├── backend/                   API REST — Express 5 + PostgreSQL, ES modules
│   ├── server.js              Punto de entrada: seguridad, CORS, límites, arranque
│   ├── config/db.js           Pool de conexiones único de toda la aplicación
│   ├── routes/                10 routers finos (verbo + ruta → controlador) e index.js
│   ├── controllers/           10 controladores: orquestan la petición
│   ├── services/              Lógica de dominio y mapeo de datos
│   ├── repositories/          Consultas SQL reutilizables (capa de acceso a datos)
│   ├── middlewares/           Autenticación, autorización y manejo de errores
│   │   ├── auth.middleware.js         requireAuth, requireRole, requireAdminGeneral, actorId
│   │   ├── adminGeneral.middleware.js Comprobación de Administrador General contra la BD
│   │   └── error.middleware.js        404 de API, manejador central, id de correlación
│   ├── db/withTransaction.js  Encapsula BEGIN / COMMIT / ROLLBACK / release
│   ├── utils/                 HttpError, contraseñas (bcrypt), tokens (JWT), literales SQL
│   ├── chatbook/              Asistente de consulta institucional
│   │   ├── intents/           Un módulo por perfil: admin, docente, estudiante
│   │   └── regulation/        Texto del Acuerdo 105 y su buscador
│   ├── migrations/            CREATE TABLE IF NOT EXISTS ejecutados al arrancar
│   ├── scripts/               Mantenimiento de la base de datos
│   └── admin_db_crud.js       CRUD genérico de tablas para el Administrador General
│
└── frontend/                  Aplicación React 18 + Vite, organizada por features
    ├── index.html             Punto de entrada; favicon institucional
    ├── public/                Escudo institucional (también sirve de favicon) e imagen del Login
    └── src/
        ├── app/App.jsx        Rutas y carga diferida por pantalla
        ├── routes/            ProtectedRoute: guardián de acceso por rol
        ├── context/           AuthContext, ThemeContext, ProgramFilterContext
        ├── lib/
        │   ├── api.js         Cliente HTTP único: adjunta el token y trata el 401
        │   ├── session.js     Almacén del token y del usuario en el navegador
        │   └── report*Generator.js  Exportación a PDF y Word, en el navegador
        ├── components/
        │   ├── ui/            Sistema de diseño: Button, Card, FormField, Modal, Badge, Alert
        │   ├── layout/        DashboardLayout, Header, Sidebar
        │   ├── analytics/     Gráficas con Recharts
        │   └── chatbook/      Widget del asistente
        ├── features/          Un módulo por dominio: auth, dashboard, proyectos,
        │                      banco-proyectos, gestion-docente, reportes,
        │                      admin-general, usuarios, ajustes
        ├── hooks/             Hooks propios (analítica)
        └── styles/globals.css Tokens de diseño, temas y utilidades
```

---

## 3. Recorrido de una petición

El camino es siempre el mismo, y esa es su virtud:

```
  Componente React
        │  api.getProjects()
        ▼
  lib/api.js ─── adjunta Authorization: Bearer <token>
        │
        ▼  HTTP
  server.js ─── id de petición · helmet · CORS · límite de 2 MB · rate limit
        │
        ▼
  routes/index.js ─── requireAuth: la identidad sale del token, no del cuerpo
        │
        ▼
  controllers/ ─── valida la entrada y decide
        │
        ├──► services/      reglas de dominio y mapeo
        └──► repositories/  SQL parametrizado
                  │
                  ▼
            PostgreSQL
```

Si algo falla en cualquier punto, el error acaba en `error.middleware.js`, que
responde en JSON con un identificador de correlación y deja el detalle completo
en el log del servidor.

---

## 4. Decisiones de diseño que conviene conocer

**La identidad la pone el servidor, nunca el cliente.** `requireAuth` verifica el
token y sustituye cualquier `userId`, `adminUserId` o cabecera `x-user-id` que
venga en la petición. Los controladores preguntan «¿quién es?» con `actorId(req)`.

**Las escrituras que tocan varias tablas van en transacción.** `withTransaction()`
abre, confirma o revierte y libera la conexión; si la reversión también falla,
conserva el error original en lugar de enmascararlo.

**Los errores de dominio se lanzan, no se devuelven.** `HttpError(status, mensaje)`
permite abortar una operación desde dentro de una transacción indicando *por qué*,
sin que la lógica de negocio tenga que conocer el objeto `res` de Express.

**Las condiciones de carrera se resuelven en la base de datos.** Los identificadores
los asignan secuencias, no `MAX(id)+1`; y donde hace falta serializar por persona
—crear proyecto, seleccionar una idea del banco— se usa `pg_advisory_xact_lock`.

**El frontend se carga por partes.** Cada pantalla viaja en su propio archivo y se
descarga la primera vez que se entra en ella, de modo que quien nunca abre Reportes
no descarga las librerías de exportación.

---

## 5. Pruebas

| Comando | Qué comprueba |
|---|---|
| `npm run test:chatbook` | 88 preguntas reales contra los tres perfiles |
| `npm run test:concurrency` | Que las condiciones de carrera sigan cerradas |
| `npm --prefix frontend run lint` | ESLint del frontend |
| `npm run build` | Que el frontend compile |

Las dos primeras necesitan el backend levantado (`npm run backend`) y avisan de
forma explícita si no lo encuentran.

---

## 6. Documentos relacionados

- `docs/MODELO-DATOS.md` — diagrama entidad-relación de las 26 tablas, generado
  desde el esquema real con `node backend/scripts/generate_er_diagram.js`.
- `docs/CHATBOOK.md` — qué es el Chatbook y qué no es.
- `docs/BITACORA-TECNICA.md` — decisiones de arquitectura y su motivo.
- `docs/auditorias/` — las tres auditorías de septiembre de 2026 y su plan de
  remediación. Cada una abre con una tabla de estado: describen el código del 10
  de septiembre, no el sistema actual.
