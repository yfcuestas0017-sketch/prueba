# Auditoría de Arquitectura, Calidad Funcional y Escalabilidad
### Backend de GradoHub · Universidad CESMAG

> ## Estado de este informe — 15 de septiembre de 2026
>
> **Lo que sigue describe el código del 10 de septiembre de 2026, no el sistema
> actual.** El informe se conserva como justificación del refactor que provocó y
> como registro del método con que se midió cada problema.
>
> ### Cerrado
>
> | Hallazgo del informe | Cómo se cerró |
> |---|---|
> | Los dos fallos P0 que rompían funcionalidad en `main` | Corregidos |
> | Transacciones abiertas a mano, con `ROLLBACK` que podía enmascarar el error original | `backend/db/withTransaction.js`. **26 bloques migrados; cero `BEGIN`, `ROLLBACK`, `pool.connect()` y `client.release()` manuales en todo el backend** |
> | La consulta de proyectos y su enriquecimiento, duplicados en tres sitios | Unificados en `repositories/projects.repository.js` + `services/projects.mapper.js`. `getProjects` pasó de 146 líneas a 20; `reports.controller.js` de 401 a 179 |
> | Identificadores calculados con `MAX(id)+1` (carrera bajo concurrencia) | Sustituidos por secuencias con `RETURNING` en roles, permisos y programas. Lo que queda de `MAX(` es la resincronización deliberada de secuencias |
> | Carreras en la selección de ideas del Banco de Proyectos | Cerradas. `npm run test:concurrency` |
> | Manejo de errores disperso por los controladores | Middleware central `backend/middlewares/error.middleware.js`. `npm run test:errors` |
> | `queryChatbook`, 1.272 líneas en una función | Desmontada a 336 líneas en módulos por rol. **88 de 88 pruebas en vivo**, `npm run test:chatbook` |
> | `server/` (4.998 líneas) y `scratch/` (~87 archivos) sin usar | Eliminados. De `scratch/` se rescató antes el pipeline que genera la fuente normativa del Chatbook, hoy en `scripts/reglamento/` |
>
> ### Sigue abierto
>
> - **La capa de servicios, que es el hallazgo estructural principal.** Hoy hay
>   **149 consultas SQL en `controllers/` frente a 12 en `services/` y
>   `repositories/`**; `projects` es el único módulo con repositorio propio.
>   Reparto: projects 39, adminGeneral 38, projectBank 17, users 14, catalogs 12,
>   auth 9, chatbook 8, analytics 8, reports 3, teachers 1.
> - **La paginación no se añadió, y no por olvido.** El filtro por programa no se
>   resuelve en SQL sino en JavaScript después del mapeo, porque el programa del
>   proyecto se deriva del autor principal. Un `LIMIT` antes de ese filtro
>   devolvería páginas incompletas. Paginar de verdad exige mover primero esa
>   derivación a SQL, y eso cambia la semántica: es trabajo aparte.
> - **Los dos endpoints de `/api/reports` siguen sin que ninguna pantalla los
>   llame.** `ReportesPage` rehace ese trabajo en el navegador. Es una decisión
>   pendiente: conectarlos o retirarlos.

| | |
|---|---|
| **Alcance** | `backend/**` (controllers, services, middlewares, routes, migrations, chatbook, config), `scripts/`, `scratch/`, cruzado con `frontend/src/lib/api.js` y `supabase/migrations/` |
| **Stack** | Express 5.2 + PostgreSQL (driver `pg`) · ES modules · 8.457 líneas |
| **Fecha** | 10 de septiembre de 2026 |
| **Enfoque** | Calidad funcional, arquitectura, mantenibilidad y **escalabilidad**. La seguridad se trata en `AUDITORIA.md` y aquí solo aparece cuando es inseparable de una decisión arquitectónica. |
| **Método** | Análisis estático. Los dos hallazgos P0 fueron verificados leyendo el código fuente citado. |

---

## 🔴 AVISO PREVIO — DOS FALLOS QUE ROMPEN FUNCIONALIDAD HOY

Antes de cualquier análisis de arquitectura: **hay dos cosas rotas en el código actual de `main`**. No son deuda técnica ni riesgo futuro. Están rotas ahora.

### P0-1 · Nadie puede iniciar sesión

El frontend y el backend no se ponen de acuerdo en la ruta de autenticación.

```js
// frontend/src/lib/api.js:27,32  — lo que el navegador pide
login:    (email, password) => request('/auth/login',    {...})
register: (fields)          => request('/auth/register', {...})
```

```js
// backend/routes/auth.routes.js:6-7  — lo que el servidor registra
router.post('/login', login);
router.post('/register', register);
```

```js
// backend/routes/index.js:20  — se monta SIN prefijo
router.use(authRoutes);
```

Con `app.use('/api', apiRouter)` en `server.js:26`, el backend expone `POST /api/login` y `POST /api/register`. **El frontend pide `/api/auth/login` y `/api/auth/register`, que no existen.** Toda petición de login o registro recibe un 404.

Verificado: no hay ninguna otra definición de `/auth` en el repositorio. El archivo `backend/routes/auth.routes.js` nació completo en el commit `f9f351b7` *"Actualización de carpetas"* — la misma reorganización a `backend/`+`frontend/` que dejó desactualizados el README y `ARCHITECTURE.md`. **En esa migración se perdió el prefijo `/auth`.**

> **Corrección — una línea.** En `backend/routes/index.js:20`:
> ```js
> router.use('/auth', authRoutes);
> ```
> **Verificación:** levantar la app e iniciar sesión con un usuario real. Es el primer arreglo que debes hacer.

### P0-2 · El asistente de reglamento falla siempre

`chatbook.controller.js` define **localmente** tres funciones que ya existen —correctamente implementadas— en `chatbook_orchestrator.js`:

| Función | Versión correcta (nunca importada) | Copia local (la que se ejecuta) |
|---|---|---|
| `handleSecurityResponse` | `chatbook_orchestrator.js:64` | `chatbook.controller.js:411` |
| `handleRegulationChatbookQuery` | `chatbook_orchestrator.js:72` | `chatbook.controller.js:419` |
| `handleMixedChatbookQuery` | `chatbook_orchestrator.js:161` | `chatbook.controller.js:429` |

El controlador solo importa `classifyChatbookQuery` del orquestador (`chatbook.controller.js:3`), así que las tres versiones buenas **nunca se ejecutan**. Y las copias locales llaman a un método que no existe:

```js
// chatbook.controller.js:420 y :450
const regAnswer = await regulationService.queryRegulation(rawText || norm);
```

Verificado leyendo la clase completa: `RegulationService` (`regulation_service.js:79-138`) expone exactamente **once** métodos — `getMetadata`, `getChapters`, `getChapter`, `getArticle`, `getAllArticles`, `getModalities`, `getModality`, `getDistinctions`, `getModifications`, `search` y `formatCitation`. **`queryRegulation` no es ninguno de ellos**, y la cadena no aparece definida en ninguna parte del proyecto: solo en esas dos llamadas.

**Consecuencia real:** toda pregunta que el clasificador catalogue como `REGULATION` o `BOTH` —«reglamento», «acuerdo 105», «coterminalidad», «requisitos de sustentación»— lanza `TypeError: regulationService.queryRegulation is not a function` y devuelve un 500.

**Y el daño colateral es mayor:** las 1.942 líneas de `regulation_data.js` y las 365 de `regulation_search.js` —el articulado completo del reglamento institucional y su motor de búsqueda— **son inalcanzables en producción**, porque el único camino que las usaría (`regulationService.search()` / `.getArticle()`) vive en las funciones del orquestador que nadie importa.

> **Corrección.** Borrar `chatbook.controller.js:411-465` y sustituir el import de la línea 3 por:
> ```js
> import {
>   classifyChatbookQuery,
>   handleSecurityResponse,
>   handleRegulationChatbookQuery,
>   handleMixedChatbookQuery,
> } from '../chatbook/chatbook_orchestrator.js';
> ```
> **Verificación:** el repositorio ya tiene `scratch/test_all_chatbook_questions.js`. Ejecútalo y comprueba que las preguntas normativas pasan de error 500 a citar artículos reales.

**Esto significa que la funcionalidad más vistosa del proyecto —el asistente de reglamento— no funciona, y su arreglo es reconectar tres imports.** Para una sustentación, es la diferencia entre demostrar 2.300 líneas de trabajo o no poder demostrarlas.

---

## 1. Resumen ejecutivo

Quitando los dos P0, el backend es **funcionalmente sólido y arquitectónicamente frágil**. Hace lo que dice hacer, con algunos aciertos técnicos notables, pero está construido de una forma que no sobrevivirá al crecimiento sin reescribir partes.

### Lo que está bien hecho

Merece decirse porque es defendible ante un jurado:

- **`pg_advisory_xact_lock` en `createProject`** (`projects.controller.js:329`) para impedir que un estudiante acabe con dos proyectos activos por una petición duplicada. Es un uso correcto de bloqueo consultivo de PostgreSQL, poco habitual de ver en un proyecto académico.
- **`applyAcademicPromotion`** (`users.controller.js:212`) resuelve la promoción masiva de semestre con un `WITH … UPDATE … FROM` orientado a conjuntos, en vez de un bucle. Es el mejor SQL del repositorio.
- **`getProjectBank`** (`projectBank.controller.js:11-67`) construye su `WHERE` dinámico con índices de parámetro incrementales y todo parametrizado. Es el patrón correcto y debería ser el modelo para los demás listados.
- **Gestión de transacciones disciplinada.** Se revisaron los 29 usos de `pool.connect()`: **todos** liberan el cliente en `finally` y todos tienen `ROLLBACK` en su `catch`. No hay una sola fuga de conexión.
- **`getUsers`** usa `json_agg` para traer roles y permisos agregados en una sola consulta, en vez de N+1.
- **`logAdminTrace`** (`audit.service.js`) atrapa su propio error para que un fallo de auditoría nunca tumbe la operación principal. Es el criterio correcto.

### Lo que no aguantará crecer

| Problema | Medida | Impacto |
|---|---|---|
| SQL dentro de los controladores | **289 consultas en `controllers/` vs 5 en `services/`** (58:1) | No hay capa de datos |
| Listados sin paginación | 8 endpoints; solo 1 en todo el repo tiene `LIMIT` | Se rompe con 5.000 proyectos |
| Filtrado y agregación en JavaScript | 8 filtros en JS en `reports.controller.js:162-201` | El servidor hace el trabajo de PostgreSQL |
| Patrón transaccional copiado | **21 repeticiones literales** de `BEGIN/COMMIT/ROLLBACK/finally` | Cada cambio hay que hacerlo 21 veces |
| Función monolítica | `queryChatbook` = **1.272 líneas**, 158 `if`, 70 regex | Intocable sin miedo |
| Pool sin configurar | `max` por defecto = **10 conexiones** | El RNF documentado exige 200 usuarios concurrentes |
| Generación de IDs con `MAX+1` | 3 funciones | Condición de carrera real |
| Sin middleware de error central | 0 en todo el proyecto | 53 `try/catch` que reinventan el formato |
| Índices ausentes | ~9 columnas críticas | Cada login es un *sequential scan* |

---

## 2. Inventario funcional — qué sirve, qué mejorar, qué desechar

### 2.1 Veredicto global

De las ~70 funciones exportadas del backend:

| Veredicto | Nº | |
|---|---:|---|
| ✅ **SIRVE** | ~45 | Funcionan correctamente y están bien construidas |
| ⚠️ **MEJORABLE** | ~20 | Funcionan, pero con problemas de rendimiento o arquitectura |
| ❌ **ROTO** | 2 | `handleRegulationChatbookQuery`, `handleMixedChatbookQuery` (locales) |
| 🗑️ **CÓDIGO MUERTO** | 4 | 3 funciones del orquestador + `formatCitation` |

**Todas las rutas registradas en `backend/routes/` tienen su llamada correspondiente en `frontend/src/lib/api.js`.** No hay endpoints huérfanos — el único desajuste es el de auth (P0-1), que no es una ruta sin usar sino una ruta con nombre distinto al esperado.

### 2.2 Funciones que necesitan atención

| Función | Ubicación | Problema | Veredicto |
|---|---|---|---|
| `getProjects` | `projects.controller.js:149` | 146 líneas; trae **todos** los proyectos y **todos** los `user_projects`, agrupa y filtra en JS | ⚠️ Mejorable grave |
| `getDetailedReportProjects` | `reports.controller.js:3` | 230 líneas; casi idéntica a la anterior; **8 filtros aplicados en JS** sobre el array completo | ⚠️ Mejorable grave |
| `getAnalytics` | `analytics.controller.js:3` | Carga 3 tablas completas en memoria y filtra por programa en JS | ⚠️ Mejorable grave |
| `handleDegreeOptionsChatbook` | `chatbook_degree_options.js:43` | 373 líneas; agrega y calcula porcentajes en JS iterando todos los proyectos | ⚠️ Mejorable grave |
| `queryChatbook` | `chatbook.controller.js:467` | **1.272 líneas** en una sola función | ⚠️ Mejorable grave |
| `updateProject` | `projects.controller.js:429` | 7 bloques casi idénticos de «si cambió X, haz SELECT del nombre y registra historial» | ⚠️ Mejorable |
| `selectProjectBankIdea` | `projectBank.controller.js:462` | El `UPDATE` final es atómico, pero **el chequeo previo «¿ya tengo proyecto?» no está en la misma transacción** | ⚠️ Carrera real |
| `createRole` / `createPermission` / `createProgram` | `adminGeneral.controller.js:279, 414, 639` | Generan el ID con `SELECT MAX(id)+1` | ⚠️ Carrera real |
| `deleteProject` | `projects.controller.js:632` | No valida existencia: borrar un proyecto inexistente devuelve `200 {success:true}` | ⚠️ Mejorable |
| `getTeachers` | `teachers.controller.js:4` | Identifica docentes por heurística de texto (`ILIKE 'doc%'`, `email ILIKE '%docente%'`) en vez de por rol real | ⚠️ Frágil |

**Sobre `getTeachers`:** que un usuario sea docente se decide porque su ID empieza por «doc» o su correo contiene «docente». Existe una tabla `user_roles` con esa información. Si mañana se crea un docente con ID `usr_1731…`, desaparecerá de la lista sin error alguno.

---

## 3. ¿Se está usando bien cada herramienta?

### 3.1 Express 5 — se paga sin usarse

`package.json` fija `express: "^5.2.1"`, pero el código está escrito como si fuera Express 4.

La característica insignia de Express 5 es que **captura automáticamente las promesas rechazadas** en handlers `async`. El proyecto no la usa: los ~53 handlers siguen envueltos en `try/catch` defensivo. Eso no es incorrecto en sí, pero es redundante y, sobre todo, **no resuelve el problema real**:

- ❌ **No existe middleware de error centralizado.** Verificado: no hay ningún `app.use((err, req, res, next) => …)` ni en `server.js` ni en `routes/index.js`.
- ❌ **`next(err)` no se usa ni una sola vez** en todo el backend.

El resultado es que cada controlador inventa su propio formato de error y elige su propio código HTTP a mano — de ahí las inconsistencias de la §6.

### 3.2 Driver `pg` — bien usado, mal configurado

**Lo correcto:** cero fugas de conexión en 29 usos de `pool.connect()`; `ROLLBACK` presente en todos los caminos de error; `pool.on('error')` definido en `config/db.js:23` para que un error asíncrono no tumbe el proceso.

**Lo que falta — `backend/config/db.js:15-21`:**

```js
export const pool = new Pool({
  host: …, user: …, password: …, database: …, port: …,
  // ← no hay max, idleTimeoutMillis, connectionTimeoutMillis ni statement_timeout
});
```

Sin `max`, el pool usa **10 conexiones por defecto**. El RNF documentado del proyecto exige soportar **200 usuarios concurrentes**. Sin `connectionTimeoutMillis`, una petición que no consigue conexión espera indefinidamente en vez de fallar rápido. Sin `statement_timeout`, una consulta lenta bloquea una de esas diez conexiones sin límite.

**Conexiones retenidas sin motivo.** Seis funciones abren un `client` dedicado para una lectura que no necesita transacción:

- `users.controller.js:167` (`getAcademicSettings`)
- `adminGeneral.controller.js:7, 249, 393, 605, 720` (`getUsers`, `getRoles`, `getPermissions`, `getPrograms`, `getAuditHistory`)

Cada una retiene una conexión del pool durante todo el request cuando bastaría `pool.query()`, que la devuelve de inmediato. **Son 6 de las 10 conexiones disponibles ocupadas por lecturas**, dejando 4 para las escrituras que sí necesitan transacción.

### 3.3 Problemas de rendimiento en SQL

**Agregación y filtrado hechos en JavaScript que PostgreSQL resolvería mejor:**

| Ubicación | Qué hace en JS | Qué debería ser |
|---|---|---|
| `projects.controller.js:216-283` | Agrupa `user_projects` por proyecto, separa autores/asesores/jurados, calcula periodo académico | `GROUP BY` + `json_agg` + `EXTRACT` |
| `reports.controller.js:162-201` | **8 filtros** (programa, estado, modalidad, línea, semestre, periodo, asesor, fechas) sobre el array completo | 8 cláusulas `WHERE … AND` |
| `analytics.controller.js:38-49` | Filtra 3 tablas completas por programa | `WHERE program_id = $1` |
| `chatbook_degree_options.js:82-112` | Cuenta y calcula porcentajes iterando todos los proyectos | `COUNT(*) … GROUP BY` |

**Patrón N+1 de escritura** (bucle con un `INSERT` por iteración en vez de un `INSERT … VALUES (…),(…)`): `adminGeneral.controller.js:81-87, 211-217, 514-521, 569-576` y `projects.controller.js:393-402`. Hoy manejan pocas filas, pero es el patrón el que no escala.

**Falta de paginación.** De todos los endpoints de listado, **el único con `LIMIT` en todo el repositorio** es `getAuditHistory` (`adminGeneral.controller.js:748`, `LIMIT 100`).

### 3.4 Índices que faltan

Deducidos de los `WHERE`, `JOIN` y `ORDER BY` más frecuentes del código:

| Índice necesario | Por qué |
|---|---|
| `user_projects(project_id)` y `user_projects(user_id)` | Se hace `JOIN` sobre ambas en casi **toda** consulta de proyectos. Solo existe la PK. |
| `user_roles(user_id)` | Usada en login y en cada verificación de rol del sistema |
| `students(user_id)` | Usada en cada consulta de contexto académico |
| `project_histories(project_id)` | Usada en cada consulta de historial |
| `projects(status_id)`, `projects(research_line_id)` | Filtros constantes de reportes y analítica |
| `projects(code)` | Se busca con `ILIKE` desde el chatbook; sin índice, *sequential scan* |
| `users(program_id)` | Filtro constante |
| **`users (LOWER(TRIM(email)))`** | ⚠️ **El más importante** |

**Sobre el índice de login:** `auth.controller.js:18` filtra con `WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($1))`. Aunque `email` es `UNIQUE` y tiene índice implícito, **ese índice no se usa** porque la columna está envuelta en funciones. Cada inicio de sesión recorre la tabla `users` entera. Con 1.400 usuarios no se nota; es exactamente el tipo de cosa que aparece cuando ya hay carga real.

```sql
CREATE INDEX CONCURRENTLY idx_users_email_normalized ON public.users (LOWER(TRIM(email)));
```

---

## 4. Arquitectura y separación de capas

### 4.1 La proporción que lo resume todo

> **289 llamadas `.query(` en `controllers/` contra 5 en `services/`. Proporción 58:1.**

No existe capa de repositorio ni ORM. Los tres «servicios» que hay son helpers puntuales, no una capa de acceso a datos. El patrón dominante es **router → controlador gordo con SQL y reglas de negocio mezcladas**.

### 4.2 Reglas de negocio incrustadas en controladores

Todas estas son reglas del dominio académico de la Universidad CESMAG que hoy viven dentro de un handler HTTP, mezcladas con el SQL:

| Regla | Ubicación |
|---|---|
| «Un estudiante no puede tener dos proyectos activos» | `projects.controller.js:325-364` |
| «Solo estudiantes de 8° sin proyecto pueden crear propuesta» | `projects.controller.js:354-363` |
| «Solo los semestres 9 y 10 registran avances y documentos» | `projects.controller.js:25-38` |
| «Semestre 8/9/10 corresponde a fase I/II/III» | `users.controller.js:57-58` (como operador ternario) |
| «Si el semestre terminó y es 8 o 9, promociona» | `users.controller.js:212-234` |
| Mapeo de opciones de grado por ID literal (`o.id === 1`) | `chatbook_degree_options.js:133-134, 229, 264, 299` |

⚠️ **El último merece atención:** el chatbot identifica «Coterminalidad» y «Proyecto de Grado» por el **número de ID** en la tabla. Si alguien reordena `degree_options` en la base de datos, el asistente empezará a dar respuestas mal etiquetadas **sin que ningún error lo indique**.

### 4.3 El helper que falta: `withTransaction`

El patrón siguiente se repite **21 veces literalmente**: `auth.controller.js` (1), `users.controller.js` (3), `projects.controller.js` (4), `adminGeneral.controller.js` (13).

```js
const client = await pool.connect();
try {
  await client.query('BEGIN');
  /* … lo único que cambia … */
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  res.status(500).json({ error: '…' + err.message });
} finally {
  client.release();
}
```

Es la duplicación estructural más repetida del proyecto, y el refactor de mejor relación beneficio/riesgo:

```js
// backend/db/withTransaction.js  (NUEVO)
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

Las 13 funciones de `adminGeneral.controller.js` pasan de ~20 líneas de andamiaje alrededor de 4 de lógica, a solo la lógica.

### 4.4 Estructura objetivo

```
routes/          → sin cambios
controllers/     → validan entrada, llaman al service, mapean HTTP  (sin SQL)
services/        → reglas de negocio del dominio académico
repositories/    → todo el SQL vive aquí                             (NUEVO)
db/withTransaction.js                                                (NUEVO)
```

**Ejemplo real — `getProjects` refactorizado** (de 146 líneas a ~15, sin cambiar el contrato JSON):

```js
// backend/repositories/projects.repository.js  (NUEVO)
export async function findProjectsPage(pool, { programId, limit = 50, offset = 0 }) {
  const { rows } = await pool.query(`
    SELECT p.project_id, p.title, p.code, p.created_at,
           COALESCE(json_agg(jsonb_build_object(
             'user_id', up.user_id, 'role', up.project_role, 'name', u.full_name
           )) FILTER (WHERE up.user_id IS NOT NULL), '[]') AS participants
    FROM public.projects p
    LEFT JOIN public.user_projects up ON up.project_id = p.project_id
    LEFT JOIN public.users u          ON u.user_id     = up.user_id
    LEFT JOIN public.programs pr      ON pr.program_id = u.program_id
    WHERE ($1::int IS NULL OR pr.program_id = $1)
    GROUP BY p.project_id
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
  `, [programId, limit, offset]);
  return rows;
}

// backend/controllers/projects.controller.js
export const getProjects = async (req, res) => {
  const { programId, page = 1, pageSize = 50 } = req.query;
  const rows = await findProjectsPage(pool, {
    programId: programId ? parseInt(programId, 10) : null,
    limit: Number(pageSize),
    offset: (Number(page) - 1) * Number(pageSize),
  });
  res.json(rows.map(mapProjectRow));   // mapProjectRow: formato puro, ya no agregación
};
```

El filtrado y la agregación pasan a SQL, aparece paginación real, y el contrato que consume el frontend no cambia.

---

## 5. Duplicación y deuda

### 5.1 Duplicación medida

| # | Qué se duplica | Dónde | Tamaño |
|---|---|---|---|
| 1 | Consulta de proyectos + bloque de enriquecimiento | `projects.controller.js:154-283` ↔ `reports.controller.js:24-160` | **~130 + ~137 líneas** |
| 2 | Mapeo de autores/asesores/jurados — **tercera copia** | `reports.controller.js:332-391` | ~60 líneas |
| 3 | Patrón `BEGIN/COMMIT/ROLLBACK/finally` | 4 archivos | **21 repeticiones** |
| 4 | Andamiaje admin (`BEGIN` → `assertAdminGeneral` → … → `logAdminTrace` → `COMMIT`) | `adminGeneral.controller.js` | **13 repeticiones** de ~20 líneas |
| 5 | Handlers de reglamento divergentes | `chatbook_orchestrator.js:64-270` ↔ `chatbook.controller.js:411-465` | ~150 líneas, **una versión rota** |
| 6 | `activeProjectPredicate` | `users.controller.js:37-39` ↔ `projects.controller.js:10-12` | 3 × 2 |

### 5.2 Funciones de más de 100 líneas

| Función | Ubicación | Líneas |
|---|---|---:|
| `queryChatbook` | `chatbook.controller.js:467` | **1.272** |
| `handleDegreeOptionsChatbook` | `chatbook_degree_options.js:43` | 373 |
| `getDetailedReportProjects` | `reports.controller.js:3` | 230 |
| `getProjectReportDetail` | `reports.controller.js:234` | 168 |
| `getProjects` | `projects.controller.js:149` | 146 |
| `createProject` | `projects.controller.js:296` | 132 |
| `updateProject` | `projects.controller.js:429` | 128 |
| `getTeacherFullProfile` | `chatbook.controller.js:254` | 107 |

### 5.3 Cómo desmontar `queryChatbook` sin romperlo

La función tiene **158 `if`** y **70 expresiones regulares**. Su forma es: clasificar por regex → si coincide la intención A, consultar y formatear; si no, probar la B; y así durante 1.270 líneas.

**Patrón recomendado: registro de intenciones.**

```js
// backend/chatbook/intents/registry.js  (NUEVO)
export const CHATBOOK_INTENTS = [
  {
    id: 'TEACHER_LINE_ONLY',
    matches: (norm) => /linea de investigacion|cual es su linea/.test(norm)
                       && !/proyectos|cuantos/.test(norm),
    handle: async (ctx) => { /* la lógica que hoy está en :614-620 */ },
  },
  {
    id: 'TEACHER_ADVISOR_COUNT',
    matches: (norm) => /cuantos (trabajos|proyectos)/.test(norm) && /asesor/.test(norm),
    handle: async (ctx) => { /* … */ },
  },
  // … una entrada por cada rama actual
];
```

```js
// chatbook.controller.js — queryChatbook reducido
export const queryChatbook = async (req, res) => {
  const ctx = await buildChatbookContext(req);
  if (ctx.error) return res.status(ctx.status).json(ctx.error);

  const category = classifyChatbookQuery(ctx.norm, ctx.rawText);
  if (category === 'SECURITY')   return res.json(handleSecurityResponse());
  if (category === 'BOTH')       return res.json(await handleMixedChatbookQuery(ctx));
  if (category === 'REGULATION') return res.json(await handleRegulationChatbookQuery(ctx));

  const intent = CHATBOOK_INTENTS.find(i => i.matches(ctx.norm));
  return res.json(intent ? await intent.handle(ctx) : await defaultSearchHandler(ctx));
};
```

Cuatro ventajas concretas: cada intención se prueba aislada; añadir una no obliga a tocar un archivo de 1.700 líneas; el **orden de evaluación queda explícito en un array** en vez de implícito en 90 `if` encadenados; y de paso desaparecen las copias locales rotas del P0-2.

**Se migra una rama por vez**, ejecutando `scratch/test_all_chatbook_questions.js` —que ya existe— después de cada extracción.

---

## 6. Escalabilidad — ¿aguanta crecer?

### 6.1 Qué pasa con 5.000 proyectos en vez de 50

Ocho endpoints devuelven colecciones completas sin paginar. Hoy, `getProjects` trae 50 proyectos más sus ~150-200 filas de `user_projects`: imperceptible.

**Con 5.000 proyectos**, esa misma llamada trae 15.000-20.000 filas, las procesa en memoria del proceso Node, las serializa íntegras a JSON y las envía al navegador — **en cada carga de página**. El tiempo de respuesta crece con el tamaño de la base de datos, no con lo que el usuario ve en pantalla.

Se agrava porque `getProjects` y `getDetailedReportProjects` hacen esa misma carga completa por separado, sin caché entre ellas.

**Caso extremo — `analytics.controller.js:9-26`:** trae `projects`, `user_projects` y `students` **sin `WHERE` ni `LIMIT`**, y filtra por programa en JavaScript (líneas 38-49). Es cargar tres tablas completas en memoria en cada apertura del panel de analítica.

### 6.2 ¿Puede correr en varias réplicas?

**En cuanto a estado, sí:** no hay sesiones en memoria. El único estado del proceso es el `Pool` y los datos estáticos del reglamento, ambos inofensivos.

**Pero hay tres obstáculos reales para escalar horizontalmente:**

**1. Las migraciones se ejecutan en cada arranque.** `server.js:29-39` llama a `initMigrations()`, que hace `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` y un `INSERT` de semilla condicionado a `COUNT(*) === 0` (`create_project_bank.js:31-34`).

Con una instancia es seguro. **Con dos arrancando a la vez**, ambas pueden ejecutar el `COUNT(*)`, ambas ver `0` y ambas insertar las tres ideas de ejemplo — no hay `UNIQUE` sobre `title` que lo impida. Además, ejecutar DDL desde el proceso de aplicación impide versionar el esquema y hacer rollback.

> ⚠️ **Y hay una divergencia ya presente:** `supabase/migrations/20260904_project_bank_and_histories.sql:37` define la FK con `ON DELETE RESTRICT`, mientras `backend/migrations/create_project_bank_histories.js:9` define la misma FK con `ON DELETE CASCADE`. **Hoy nadie sabe cuál está vigente en la base de datos real sin inspeccionarla.** Dos fuentes de verdad para el esquema, y ya se contradicen.

**2. Condiciones de carrera en la generación de IDs.** `createRole` (`:291`), `createPermission` (`:426`) y `createProgram` (`:651`) usan `SELECT COALESCE(MAX(id),0)+1`. PostgreSQL no bloquea en un `SELECT MAX` sin `FOR UPDATE`, así que dos peticiones concurrentes pueden leer el mismo valor. Con varias instancias, la probabilidad se multiplica. La solución es usar `SERIAL`/`IDENTITY` y `RETURNING id`.

**3. Carrera en la asignación del banco de proyectos.** `selectProjectBankIdea` (`projectBank.controller.js:462`) hace el `UPDATE … WHERE status='Disponible'` de forma atómica —correcto—, pero **el chequeo previo de «¿este estudiante ya tiene proyecto?» no está dentro de la misma transacción**. Dos peticiones concurrentes del mismo estudiante eligiendo ideas distintas pueden asignarle **dos proyectos**.

Es el mismo problema que `createProject` ya resolvió bien con `pg_advisory_xact_lock`. La solución está en el propio repositorio; solo hay que aplicarla aquí.

### 6.3 El límite de 50 MB no tiene justificación

`server.js:22-23` configura `express.json({ limit: '50mb' })`.

Verificado en `api.js`, `ProyectosPage.jsx` y `reportPdfGenerator.js`: **no hay ninguna subida de archivos en base64**. Los campos `file_url` son siempre enlaces de texto a recursos externos, nunca contenido binario.

El límite no responde a ninguna necesidad del código. Y sí abre una superficie de agotamiento de memoria: `express.json` parsea el cuerpo **completo** en memoria antes de que el controlador pueda rechazarlo. Con 200 usuarios concurrentes, son 50 MB potenciales por conexión activa.

> **Corrección:** bajarlo a `2mb`. Comprobar antes que los payloads más largos —`createProjectBankIdea` y `updateProjectBankIdea`, que son texto— quedan holgadamente por debajo.

### 6.4 Comportamiento estimado con 200 usuarios concurrentes

Es el RNF documentado del proyecto. Con la configuración actual:

- **Pool de 10 conexiones**, de las cuales 6 pueden estar retenidas por lecturas que no las necesitan (§3.2).
- **Sin `connectionTimeoutMillis`**, las peticiones que no consiguen conexión esperan indefinidamente en vez de fallar rápido.
- **Sin `statement_timeout`**, una consulta lenta bloquea una conexión sin límite.
- **Endpoints sin paginar** reprocesan en JS la misma agregación en cada petición, sin caché.

**Conclusión honesta: el RNF de 200 usuarios concurrentes no se cumpliría hoy**, y no hay evidencia de que se haya probado — no hay scripts de carga en el repositorio, solo verificaciones funcionales puntuales.

### 6.5 Caché

No existe en ningún nivel: ni en memoria, ni HTTP (`Cache-Control`/`ETag`), ni Redis. Los candidatos evidentes son los catálogos casi estáticos (`getCatalogs`, `getDegreeOptions`, `roles`, `permissions`, `statuses`, `modalities`) y, sobre todo, el reglamento, que cambia cada varios años.

### 6.6 Sobre `regulation_data.js` (1.942 líneas de datos estáticos)

**Hoy es la decisión correcta.** Es solo texto, se carga una vez por proceso, y el comentario de la línea 9 muestra que ya se pensó en migrarlo. Además, `RegulationService` está diseñado como fachada intercambiable, así que mover los datos a PostgreSQL no obligaría a tocar el controlador.

**Migrarlo a una tabla cuando aparezca cualquiera de estas dos necesidades:** poder corregir la redacción del reglamento sin desplegar código, o buscar por texto completo con `tsvector` en vez de regex en JavaScript. También falta versionado «vigente desde/hasta» para cuando cambie el reglamento y haya estudiantes bajo el anterior.

**Pero primero hay que arreglar el P0-2**, porque hoy no hay forma de verificar que un cambio de origen de datos preserve el comportamiento: el comportamiento actual es un error 500.

---

## 7. Errores, logging y observabilidad

### 7.1 Códigos HTTP

Distribución en controladores: `400`→40, `401`→2, `403`→34, `404`→15, `409`→3, `500`→51, `201`→5.

**Casos semánticamente incorrectos:**

| Caso | Ubicación | Debería ser |
|---|---|---|
| `deleteProject` de un ID inexistente responde `200 {success:true}` | `projects.controller.js:634-651` | `404` |
| Caída de la base de datos en login responde `500` con el mensaje crudo de `pg` | `auth.controller.js:69,157` | `503` |
| `programId=abc` produce `NaN` y devuelve resultados vacíos en silencio | `getProjectBank`, `getAnalytics`, `getCatalogs` | `400` |

**Fuga de mensajes internos.** Casi todos los controladores concatenan `err.message` del driver `pg` en la respuesta (`projects.controller.js:292,423`, `projectBank.controller.js:113,178,243`, `reports.controller.js:230,399`, `teachers.controller.js:47`). El frontend acaba recibiendo mensajes técnicos de PostgreSQL en inglés mezclados con mensajes en español pensados para el usuario final.

### 7.2 Logging

63 `console.log`/`console.error`, casi todos del tipo `console.error('Get projects error:', err)`.

Faltan: nivel de severidad filtrable, **ID de correlación por petición**, timestamp estructurado y logs de `info` para trazar peticiones exitosas. Hoy, viendo un error en el log, **no hay forma de saber a qué petición de qué usuario corresponde**.

> **Recomendación:** `pino` + `pino-http`. Formato JSON estructurado, alto rendimiento, y `req.id` automático en cada log de la petición.

### 7.3 Health check insuficiente

`routes/index.js:16-18` responde `{ status: 'ok' }` **sin tocar la base de datos**.

Si PostgreSQL cae, `/api/health` sigue respondiendo `200 ok` mientras todos los demás endpoints devuelven 500 — exactamente el escenario que un health check debe detectar.

```js
router.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});
```

### 7.4 Qué pasa si PostgreSQL se cae

**Al arrancar:** `server.js:29-39` llama a `initMigrations()` **sin `await` bloqueante** antes de `app.listen()`. El servidor **arranca y escucha igual** aunque las migraciones fallen — el `catch` solo hace `console.error`. El proceso queda vivo pero inservible: el puerto responde, `/health` dice «ok», y cada petición falla con 500. No hay *fail-fast*.

**En caliente:** `pool.on('error')` evita que el proceso muera, pero **no hay reintentos ni circuit breaker**. Cada petición vuelve a golpear la base de datos caída sin backoff.

---

## 8. Qué es desechable

| Elemento | Justificación | ⚠️ |
|---|---|---|
| **`chatbook.controller.js:411-465`** (3 funciones locales) | Llaman a un método inexistente. Sustituir por el `import` del orquestador | **Hacer primero** |
| `chatbook_orchestrator.js:64-270` | Código muerto hoy… | ⚠️ **NO BORRAR** — es la implementación *correcta* que debe reemplazar a la anterior |
| `frontend/src/lib/supabase/` (4 archivos) | Cero importadores. Resto de la arquitectura Supabase abandonada | Seguro tras verificar el build |
| `scratch/` (~70 archivos) | Ningún `package.json` la referencia. Scripts de diagnóstico puntual | ⚠️ Contiene `dump_20260904.sql` con datos personales reales — ver `AUDITORIA.md` §5.1 |
| `backend/migrations/` (2 archivos JS) | Obsoletos **si** se adopta `supabase/migrations/` como única fuente | ⚠️ **No borrar hasta reemplazar el mecanismo** |
| `docs/ARCHITECTURE.md` | Describe carpetas `server/` y `src/` que ya no existen | Actualizar o retirar |
| `react-is`, `escalade` (raíz) | Cero imports directos; probablemente fijadas por error | Verificar el build antes |
| `tailwindcss`, `@tailwindcss/vite` | Ni una directiva `@tailwind` en el CSS; el plugin no está registrado en Vite | Ver `AUDITORIA-FRONTEND-DISENO.md` |
| `formatCitation` | Sin invocaciones | Código muerto |

**No hay nada que quitar de `backend/package.json`:** `cors`, `dotenv`, `express` y `pg` se usan las cuatro.

**Sobre `supabase/migrations/`:** ⚠️ **no son redundantes**. Son las únicas migraciones con timestamp y trazabilidad. La contradicción `RESTRICT` vs `CASCADE` (§6.2) debe resolverse **reconciliando**, nunca borrando una de las dos fuentes sin antes verificar cuál coincide con la base de datos real.

---

## 9. Plan de mejora escalonado

Principio: **cada fase deja el sistema funcionando**. Un commit por acción, verificación antes de seguir.

### FASE 0 — Desbloquear (1 hora) · Riesgo: ninguno, porque ya está roto

| # | Acción | Verificación |
|---|---|---|
| 0.1 | `router.use('/auth', authRoutes)` en `routes/index.js:20` | Iniciar sesión en el navegador con un usuario real |
| 0.2 | Borrar `chatbook.controller.js:411-465` e importar las 3 funciones del orquestador | Ejecutar `scratch/test_all_chatbook_questions.js`: las preguntas normativas deben citar artículos, no dar 500 |

**Estas dos horas son las de mayor impacto de todo el plan.** Devuelven el login y el asistente de reglamento.

### FASE 1 — Quick wins (1 día) · Riesgo: bajo · No cambian contratos de API

| # | Acción | Archivo | Verificación |
|---|---|---|---|
| 1.1 | Configurar el pool: `max: 20`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`, `statement_timeout: 10000` | `config/db.js` | La app arranca y opera con normalidad |
| 1.2 | Bajar `express.json` de `50mb` a `2mb` | `server.js:22` | Guardar la idea de proyecto más larga posible |
| 1.3 | Crear los 9 índices de §3.4 con `CREATE INDEX CONCURRENTLY` | SQL | `EXPLAIN ANALYZE` de login y `getProjects` antes/después |
| 1.4 | Health check que consulte `SELECT 1` | `routes/index.js:16` | Apagar PostgreSQL y ver `503` |
| 1.5 | `deleteProject` valida existencia → `404` | `projects.controller.js:632` | Borrar un ID inexistente |
| 1.6 | Dejar de concatenar `err.message` en las respuestas | Varios | `api.js:19` solo usa `data.error` como texto: cambiar el contenido es seguro |
| 1.7 | Sustituir `client.connect()` por `pool.query()` en las 6 lecturas sin transacción | §3.2 | Cada endpoint sigue devolviendo lo mismo |

> `CREATE INDEX CONCURRENTLY` no bloquea escrituras: se puede ejecutar con la aplicación en marcha.

### FASE 2 — Deduplicación (1 semana) · Riesgo: medio

| # | Acción | Verificación |
|---|---|---|
| 2.1 | Crear `db/withTransaction.js` y migrar las 21 repeticiones, **empezando por las 13 de `adminGeneral`** (lógica mínima = menor riesgo) | Probar a mano cada endpoint tras cada migración: crear/editar/activar usuario, rol, permiso, programa |
| 2.2 | Extraer `projects.repository.js` con la consulta compartida por `getProjects` y `getDetailedReportProjects`; resolver filtrado y agregación en SQL | **Comparar el JSON de respuesta antes/después con los mismos filtros.** Debe ser idéntico |
| 2.3 | Sustituir `MAX(id)+1` por `SERIAL` + `RETURNING id` en roles, permisos y programas | Crear varios concurrentemente y verificar que no colisionan |
| 2.4 | Meter el chequeo previo de `selectProjectBankIdea` dentro de la transacción, con `pg_advisory_xact_lock` como en `createProject` | Dos peticiones simultáneas del mismo estudiante no deben producir dos asignaciones |
| 2.5 | Middleware de error centralizado + eliminar los `try/catch` redundantes (Express 5 ya los captura) | Todas las rutas siguen devolviendo el mismo formato de error |

### FASE 3 — Estructural (2-3 semanas) · Riesgo: alto, planificar

| # | Acción | Riesgo y mitigación |
|---|---|---|
| 3.1 | Refactorizar `queryChatbook` al registro de intenciones, **una rama por vez** | 🟠 Ejecutar el script de preguntas después de **cada** extracción |
| 3.2 | Paginación en los 8 endpoints de listado | 🟠 **Introducir `page`/`pageSize` como opcionales**: si no se envían, se comporta como hoy. Así el frontend no se rompe mientras se actualiza pantalla por pantalla |
| 3.3 | Unificar migraciones en `supabase/migrations/` como única fuente y ejecutarlas en el despliegue, no en `server.js` | 🔴 **Antes de tocar nada: `pg_dump --schema-only` de la base real y reconciliarlo tabla por tabla.** El esquema versionado ya diverge del real |
| 3.4 | Logging estructurado con `pino` + `pino-http` | 🟢 Bajo |
| 3.5 | Caché de catálogos y reglamento | 🟢 Bajo |
| 3.6 | Mover `regulation_data.js` a PostgreSQL | 🟡 Solo si hace falta editar sin desplegar o buscar por texto completo. **Después del P0-2** |

### Resumen

| Fase | Duración | Riesgo | Qué consigue |
|:---:|---|:---:|---|
| **0** | **1 hora** | 🟢 Ninguno | **Login y reglamento vuelven a funcionar** |
| 1 | 1 día | 🟢 Bajo | Rendimiento, robustez, códigos HTTP correctos |
| 2 | 1 semana | 🟡 Medio | Se elimina la duplicación y las condiciones de carrera |
| 3 | 2-3 semanas | 🟠 Alto | El sistema pasa a ser escalable de verdad |

**Si solo tienes una hora, haz la Fase 0.** Dos cambios de import devuelven a la vida las dos funcionalidades que hoy no se pueden demostrar.

---

## 10. Conclusión

El backend está mejor construido de lo que sugieren sus problemas. Hay criterio técnico real: el bloqueo consultivo contra condiciones de carrera, la promoción académica resuelta con SQL orientado a conjuntos, el `WHERE` dinámico parametrizado del banco de proyectos, la gestión disciplinada de transacciones sin una sola fuga de conexión en 29 usos. Nada de esto es casual.

Lo que falta es la capa que separa «hacer que funcione» de «hacer que aguante». El SQL vive donde debería vivir la lógica HTTP, los listados no paginan, PostgreSQL hace la mitad del trabajo que podría hacer, y el patrón transaccional está copiado veintiuna veces en vez de escrito una. Ninguno de esos problemas se nota con cincuenta proyectos y un usuario; todos se notan a la vez cuando hay cinco mil y doscientos.

Y por encima de todo está lo inmediato: **hay dos cosas rotas ahora mismo, y ambas se arreglan reconectando imports.** El login lleva roto desde el último commit, y el asistente de reglamento —2.300 líneas de articulado institucional y motor de búsqueda, la funcionalidad más ambiciosa del proyecto— nunca ha podido responder una pregunta normativa en su forma actual. Son dos horas de trabajo que separan un sistema que no se puede demostrar de uno que sí.

---

<sub>Auditoría de solo lectura. No se modificó ningún archivo. Los hallazgos P0 fueron verificados leyendo el código fuente citado.</sub>
