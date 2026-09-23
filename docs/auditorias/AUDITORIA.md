# Auditoría Técnica — GradoHub
### Plataforma de Gestión de Proyectos de Grado · Universidad CESMAG

> ## Estado de este informe — 15 de septiembre de 2026
>
> **Lo que sigue describe el código del 10 de septiembre de 2026, no el sistema
> actual.** La mayor parte de lo que denuncia ya está corregida. El informe se
> conserva porque es la justificación de ese trabajo y el registro de cómo se
> detectó cada defecto, no como descripción vigente del sistema.
>
> ### Cerrado
>
> | Hallazgo del informe | Cómo se cerró |
> |---|---|
> | No había autenticación real: el servidor confiaba en la identidad que enviaba el navegador | Capa JWT completa — `backend/utils/token.js`, `backend/middlewares/auth.middleware.js`. **44 de 44 pruebas en vivo**, `npm run test:auth` |
> | Contraseñas guardadas en texto plano | `bcrypt` en `backend/utils/password.js`. El login rehashea al vuelo la contraseña de quien todavía la tuviera en claro, y `backend/scripts/hash_existing_passwords.js` migra el resto |
> | El login y el asistente de reglamento estaban rotos en `main` | Importaciones reconectadas |
> | Respuestas de error que devolvían `err.message` del servidor | Cerrado. Solo quedan dos usos, ambos deliberados: `projectBank.controller.js:589` y el middleware central `error.middleware.js:62`, que únicamente emite mensajes escritos a propósito |
> | Artefactos huérfanos de Supabase | Carpeta renombrada a `database/migrations/`; código muerto de `frontend/src/lib/supabase/` eliminado; **`docs/SUPABASE_SETUP.md`, `docs/SUPABASE_SECURITY.md` y `docs/AGENT_MEMORY.md` eliminados el 2026-09-15** —las §§5 y 8 de este informe los citan, y ya no existen—; la decisión quedó cerrada por escrito en `docs/BITACORA-TECNICA.md` §1 |
> | `server/index.js` (4.998 líneas) y ~87 archivos de `scratch/` sin usar | Eliminados tras comparar endpoint por endpoint que no se perdía nada |
>
> ### Sigue abierto
>
> - **La exposición de datos personales de la §5.** El repositorio fue público
>   con `scratch/dump_20260904.sql` dentro, y ese archivo **sigue en el árbol y
>   en el historial de Git**. Sacarlo del historial exige `git filter-repo`
>   coordinado con el resto del equipo. La gestión de la visibilidad del
>   repositorio y la notificación a las personas afectadas están en manos de la
>   autora del proyecto.
> - **Rotar la credencial de PostgreSQL** sigue siendo obligatorio aunque se
>   purgue el historial: cualquier clon hecho mientras el repositorio fue
>   público conserva el secreto.
>
> Ver también `docs/auditorias/AUDITORIA-BACKEND-ARQUITECTURA.md` y
> `docs/auditorias/AUDITORIA-FRONTEND-DISENO.md`, con sus propios estados.

| | |
|---|---|
| **Repositorio** | `TrabajoGrado` — rama `main`, commit `f9f351b7` |
| **Fecha de auditoría** | 10 de septiembre de 2026 |
| **Alcance** | Código fuente completo (`backend/`, `frontend/`, `scripts/`, `scratch/`, `supabase/`), documentación técnica (`docs/`), documentación académica (`Documentación proyecto de grado/`) e historial completo de Git |
| **Tamaño auditado** | ~27.500 líneas propias — backend 8.457 · frontend 19.039 |
| **Tipo de revisión** | Análisis estático y del historial de Git. No se ejecutó la aplicación ni se realizaron pruebas de penetración activas. |

---

## ⚠️ AVISO PREVIO — ACCIÓN INMEDIATA REQUERIDA

Antes de leer el resto del informe, hay **dos hechos verificados que exigen actuar hoy mismo**:

1. **El repositorio es PÚBLICO en GitHub.** Verificado contra la API pública de GitHub sin autenticación: `"private": false`, `"visibility": "public"`. Cualquier persona en internet puede clonarlo ahora mismo.
2. **Ese repositorio público contiene datos personales reales y contraseñas en texto plano** de aproximadamente 30 docentes y estudiantes de la Universidad CESMAG (`scratch/dump_20260904.sql`), además de las credenciales de la base de datos (`.env.local`).

Esto no es un riesgo teórico: **es una fuga de datos personales activa**, sujeta a la Ley 1581 de 2012 (Habeas Data) que la propia documentación de requisitos del proyecto cita en su RNF de privacidad. Las acciones de contención están en la §9.1 y deben ejecutarse antes que cualquier otra mejora de este informe.

---

## 1. Resumen ejecutivo

GradoHub tiene una **base arquitectónica sólida** —separación física real entre frontend y backend, cliente HTTP centralizado sin una sola llamada dispersa, organización por features, uso correcto del pool de conexiones, transacciones bien gestionadas y consultas parametrizadas en casi todo el código— sobre la que se ha construido una **capa de seguridad esencialmente inexistente**.

El hallazgo central no es un error puntual sino una decisión de diseño: **la aplicación no tiene autenticación**. No emite tokens, no usa sesiones ni cookies firmadas, y cada endpoint recibe la identidad de quien pregunta como un parámetro más de la petición (`userId`, `adminUserId`, `userRole`, cabecera `x-user-id`) en el que confía sin verificación alguna. El motor RBAC —que a nivel de base de datos está correctamente modelado— queda anulado, porque el servidor nunca comprueba que quien dice ser administrador realmente lo sea.

A esto se suman cuatro problemas que, combinados, comprometen el sistema por completo: contraseñas almacenadas y comparadas **en texto plano** con una **puerta trasera hardcodeada**, un **correo de administrador hardcodeado** que concede acceso total sin contraseña, las **credenciales de la base de datos publicadas en un GitHub público**, y un **volcado SQL con datos personales reales** en el mismo repositorio público.

### Respuesta directa a las dos preguntas planteadas

> #### ¿Está separado el frontend del backend?
>
> **Sí, física y correctamente — pero la separación de responsabilidades es incompleta.**
>
> Son dos aplicaciones autónomas (`frontend/` React+Vite y `backend/` Express+PostgreSQL), con `package.json` propios, que se comunican exclusivamente por HTTP REST bajo `/api`. No hay SQL en el frontend, no hay imports cruzados en ninguna dirección, y todo el acceso a datos pasa por un único cliente centralizado. Esto está bien hecho y es defendible ante un jurado.
>
> Se rompe en tres puntos: (a) hay **lógica de negocio institucional duplicada y triplicada** en el cliente, con IDs de programas y líneas de investigación hardcodeados; (b) hay **autorización que vive solo en el frontend** sin respaldo fiable del servidor; y (c) **no existe configuración de entorno**, por lo que el build de producción solo funciona si el backend comparte origen. Detalle en §4.

> #### ¿Hay credenciales expuestas?
>
> **Sí — seis exposiciones distintas, y las más graves ya están publicadas en internet.**
>
> El repositorio **no tiene ningún `.gitignore`**, lo que es la causa raíz de todo lo demás. Están expuestos: las credenciales reales de PostgreSQL (`.env.local`, presente en `origin/main` y `origin/master`), un volcado SQL con 30 correos institucionales y contraseñas reales en texto plano, una contraseña hardcodeada en el código de conexión, un correo de administrador hardcodeado que actúa como bypass, una contraseña por defecto `123456` visible en la interfaz, y una clave de Supabase recuperable desde el commit raíz. Detalle en §5.

### Cuadro de mando

| Severidad | Nº | Naturaleza |
|:---|:---:|:---|
| 🔴 **Crítica** | 7 | Repositorio público con PII · autenticación ausente · contraseñas en texto plano · puerta trasera de login · bypass de admin hardcodeado · credenciales en GitHub · escalada de privilegios por rol auto-declarado |
| 🟠 **Alta** | 6 | IDOR generalizado · CORS abierto · bypass `authMode` latente · sin `.gitignore` · PII expuesta sin control de acceso · sin CI/CD ni hooks de prevención |
| 🟡 **Media** | 8 | Interpolación en SQL · fuga de `err.message` y stack traces · sin helmet/rate-limit/validación · deriva de esquema de BD · ESLint no funcional · dependencias vulnerables · rama `master` obsoleta · documentación desactualizada |
| 🔵 **Baja** | 7 | `node_modules` versionado · código muerto · componentes de +1.000 líneas · Tailwind sin usar · dependencias duplicadas · dos bugs funcionales · asset roto |

---

## 2. Metodología

La auditoría se realizó desplegando cuatro análisis especializados en paralelo —backend, frontend, documentación académica e higiene de secretos/Git— cuyos hallazgos fueron después **verificados uno a uno** leyendo el código y el historial citados. Cada hallazgo de este informe incluye su ubicación exacta en formato `ruta/archivo:línea` y ha sido confirmado por lectura directa, no inferido de un resumen.

Todos los valores de credenciales aparecen **enmascarados** en este documento. La auditoría fue de solo lectura: no se modificó ningún archivo del repositorio ni se ejecutó ninguna operación de escritura sobre Git.

---

## 3. Arquitectura del sistema

### 3.1 Topología

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
                                    PostgreSQL local «BaseDatosGrado»
```

`scripts/start-all.js` lanza ambos procesos en paralelo y los mata juntos con `SIGINT`/`SIGTERM`. Es un orquestador simple y correcto.

### 3.2 Backend — `backend/`

API REST en Express 5 con ES modules, organizada en capas nominales:

| Carpeta | Contenido | Estado |
|---|---|---|
| `server.js` | Punto de entrada: CORS, parseo JSON, monta el router en `/api`, ejecuta migraciones al arrancar | ⚠️ CORS abierto |
| `config/db.js` | `pg.Pool` singleton de toda la aplicación | 🔴 Contraseña hardcodeada |
| `routes/` | 10 routers finos que solo mapean verbo+ruta → controlador | 🔴 **Ninguno aplica middleware de autenticación** |
| `controllers/` | 10 controladores: **aquí vive el 90% del SQL y de la lógica de negocio** | ⚠️ Capa sobrecargada |
| `services/` | Solo 3 helpers (`audit.service.js`, `project_bank_helpers.js`, `chatbook_degree_options.js`) | ⚠️ Capa casi vacía |
| `middlewares/` | Un único archivo, y **no es un middleware de Express**: se invoca a mano dentro de cada handler | 🔴 Ver §5.3 |
| `migrations/` | Dos scripts JS con `CREATE TABLE IF NOT EXISTS` ejecutados en cada arranque | ✅ Idempotente |
| `chatbook/` | Asistente conversacional + reglamento institucional | ℹ️ Ver §3.4 |

**Problema de altitud de capas.** La estructura `routes → controllers → services` está declarada pero no se respeta. No existe capa de repositorio ni ORM: cada controlador construye su propio SQL, y reglas de negocio como «un solo proyecto activo por estudiante» o «semestre habilitado» conviven con las consultas dentro del mismo handler (`backend/controllers/projects.controller.js:296-427`). El resultado son bloques de JOIN casi idénticos copiados entre `projects.controller.js:216-283` y `reports.controller.js:93-160` y `332-395`.

**Lo que sí está bien hecho.** El uso del `Pool` singleton para lecturas y de `pool.connect()` + `BEGIN/COMMIT/ROLLBACK` con `client.release()` en `finally` para escrituras multi-tabla es correcto y consistente. Destaca especialmente el uso de `pg_advisory_xact_lock` para evitar una condición de carrera al crear proyectos (`backend/controllers/projects.controller.js:329`) — una precaución de concurrencia poco habitual en un proyecto de este nivel, que **conviene mencionar explícitamente en la sustentación**.

### 3.3 Frontend — `frontend/`

React 18 + Vite, organizado **por features**, que es el patrón correcto para este dominio:

| Feature | Función real |
|---|---|
| `auth/` | Login y registro con selección de semestre |
| `dashboard/` | Home + panel analítico |
| `proyectos/` | CRUD de proyectos, proceso de investigación por fases, historial, verificación de coautores |
| `banco-proyectos/` | Catálogo de ideas de proyecto y su selección por estudiantes |
| `gestion-docente/` | Vista agregada de docentes (asesor/jurado) y su carga |
| `reportes/` | Exportación PDF (jsPDF) y Word (docx), generada **en el navegador** |
| `admin-general/` | CRUD de usuarios, roles, permisos, programas y auditoría (7 pestañas) |
| `usuarios/` | ⚠️ **Pese al nombre, no gestiona usuarios**: gestiona el calendario de semestres y la promoción académica masiva |
| `ajustes/` | Perfil del usuario y «mi proyecto de grado» |

**Punto fuerte destacable.** `frontend/src/lib/api.js` es un cliente HTTP genuinamente centralizado: ~40 métodos que pasan todos por una única función `request()` (`api.js:8-23`). **No existe una sola llamada `fetch` o `axios` dispersa en ningún componente** — verificado por búsqueda global. Esto es disciplina arquitectónica real y es uno de los aciertos del proyecto.

El estado compartido se maneja con tres Contexts (`AuthContext`, `ThemeContext`, `ProgramFilterContext`), sin gestor de estado global. La consecuencia es que cada feature reimplementa a mano su ciclo `loading/error/data`, con tratamientos inconsistentes: unas vistas usan banners, otras `alert()` nativo (`BancoProyectos.jsx:357,378`) y otras un `console.error` silencioso (`ProyectosPage.jsx:272-274`).

### 3.4 El módulo Chatbook

Conviene dejarlo explícito porque puede generar una expectativa equivocada en la sustentación: **el Chatbook no utiliza inteligencia artificial**. No hay LLM, ni embeddings, ni similitud semántica, ni ninguna llamada HTTP saliente a un proveedor de IA en todo el módulo.

Es un motor determinista de reglas en tres partes:

1. `chatbook/chatbook_orchestrator.js` clasifica la pregunta mediante expresiones regulares en `DATABASE` / `REGULATION` / `BOTH` / `SECURITY`.
2. La rama normativa consulta `chatbook/regulation/regulation_data.js` — **1.942 líneas con el articulado del Reglamento de Trabajo de Grado hardcodeado** (Acuerdos 105/2023 y 064/2024) — mediante coincidencia de palabras clave normalizadas (`regulation_search.js`).
3. La rama de datos es un árbol de más de 80 ramas `if (/regex/.test(...))` dentro de `chatbook.controller.js`, cada una disparando una consulta SQL predefinida.

Es una solución legítima y defendible —determinista, auditable, reproducible y sin coste de inferencia—, pero **debe describirse como un sistema experto basado en reglas, no como un asistente de IA**. Presentarlo de otro modo ante un jurado técnico sería un riesgo innecesario.

---

## 4. ¿Está separado el frontend del backend?

**Veredicto: la separación física es correcta. La separación de responsabilidades es incompleta.**

### 4.1 Lo que está correctamente separado ✅

- **Dos aplicaciones autónomas** con `package.json` propios, arrancables por separado (`npm run backend` / `npm run frontend`).
- **Comunicación exclusivamente por HTTP REST.** No hay ni un import de `backend/` desde `frontend/src`, ni al revés.
- **Cero SQL en el frontend.** Verificado por búsqueda global.
- **Un único punto de contacto**: `frontend/src/lib/api.js`.
- **Sin acceso directo a base de datos desde el navegador.** El intento previo con Supabase fue eliminado: `frontend/src/lib/supabase/*` son stubs deprecados que lanzan error, y **no hay claves `anon` ni `service_role` en el código ni en el bundle compilado**.

### 4.2 Dónde la separación se rompe ⚠️

**A. Lógica de negocio institucional duplicada en el cliente — triplicada, además.**

La regla que decide qué líneas de investigación corresponden a qué programa está escrita con **IDs hardcodeados** (`activeProgramId === '2'` con líneas `[5,6,7]` para Psicología; `'1'` con `[1,2,3,4]` para Sistemas) y **copiada literalmente en tres archivos**:

- `frontend/src/features/proyectos/ProyectosPage.jsx:187-204`
- `frontend/src/features/proyectos/CrearProyecto.jsx:65-86`
- `frontend/src/features/proyectos/EditProjectModal.jsx:63-83`

Esto es conocimiento del dominio académico que pertenece al servidor. Si la universidad crea un tercer programa o reasigna una línea, hay que editar tres archivos de interfaz y recompilar.

> **Corrección:** el catálogo ya expone `program_id` en las líneas. La relación debe resolverse en el backend y el frontend limitarse a renderizar lo que reciba.

**B. Autorización que vive en el frontend sin respaldo fiable.**

`frontend/src/components/layout/Sidebar.jsx:118-121,140-143` oculta opciones de menú según el rol, y `frontend/src/routes/ProtectedRoute.jsx` bloquea rutas — pero ambos deciden únicamente con datos leídos de `localStorage`, que el usuario puede editar desde las DevTools. Es ocultación visual, no seguridad. El respaldo del servidor es desigual: Administración General sí revalida contra la base de datos, pero el Banco de Proyectos cae de vuelta al rol que envía el cliente (§5.4).

**C. Agregación analítica recalculada en el navegador.**

`frontend/src/hooks/useAnalytics.js:82-211` recibe datos crudos y hace todos los `group-by`, rankings y matrices en JavaScript del cliente. Funciona hoy, pero duplica lógica de dominio y se degrada conforme crezca el número de proyectos. Lo mismo ocurre en `Header.jsx:44-57`, que **descarga todos los proyectos del sistema** para calcular las notificaciones de un solo usuario.

**D. Sin configuración de entorno para el despliegue.**

`frontend/src/lib/api.js:6` fija `API_BASE = '/api'` y no existe ninguna variable `VITE_*` en todo el proyecto. En desarrollo funciona por el proxy de Vite (`vite.config.js:9-12`), pero **el build de producción solo funciona si el backend se sirve bajo el mismo origen**, y no hay forma de apuntar a otro backend sin modificar código y recompilar.

---

## 5. ¿Hay credenciales expuestas?

**Veredicto: sí. Seis exposiciones, cuatro de ellas ya publicadas en un repositorio público de GitHub.**

### 🔴 5.1 — CRÍTICA · El repositorio es público y contiene datos personales reales

**Verificado** contra la API pública de GitHub, sin autenticación:

```
repositorio: https://github.com/yfcuestas0017-sketch/TrabajoGrado
"private": false        "visibility": "public"
```

Y dentro de él, **versionado en Git**, está `scratch/dump_20260904.sql`:

```sql
-- scratch/dump_20260904.sql:150-165  (valores enmascarados)
INSERT INTO public.users (user_id, full_name, email, password, program_id) VALUES
('doc***', 'Car***', 'car***@unicesmag.edu.co', '123***', 1),
('doc***', 'Lau***', 'lau***@unicesmag.edu.co', '123***', 1),
...
```

**30 correos institucionales `@unicesmag.edu.co`** de docentes y estudiantes identificables, con **nombres completos y contraseñas en texto plano**, descargables por cualquiera. Fue añadido en el commit `bcf2ea38` (8 de septiembre) y sigue presente en `HEAD`.

**Impacto:** es una fuga de datos personales bajo la Ley 1581 de 2012 (Habeas Data), la misma norma que el RNF de privacidad de la documentación del proyecto se compromete a cumplir. Además, como las contraseñas son reales y previsiblemente reutilizadas por esas personas en otros servicios, el daño excede a esta aplicación.

### 🔴 5.2 — CRÍTICA · Credenciales de PostgreSQL versionadas y publicadas

`.env.local` contiene `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT` reales. **Está trackeado por Git y presente tanto en `origin/main` como en `origin/master`.**

El historial agrava el problema: el repositorio tiene **44 commits y ningún `.gitignore` desde el primero**. Verificado:

- `git show 7325e1c1:.env.local` → commit raíz, contiene `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` de un proyecto Supabase real.
- `git show 4cd91b9a:.env.local` → commit titulado *"Change PGPASSWORD in .env.local"*; el historial de ese archivo contiene además **marcadores de conflicto de merge sin resolver** (`<<<<<<<` / `>>>>>>>`), lo que deja **dos contraseñas distintas expuestas a la vez**.

> **Punto clave:** rotar la contraseña es obligatorio **aunque se purgue el historial**. Ver §9.2.

### 🔴 5.3 — CRÍTICA · Correo de administrador hardcodeado como bypass de autorización

```js
// backend/middlewares/adminGeneral.middleware.js:8
AND (LOWER(r.name) LIKE '%administrador general%' OR ...
     OR LOWER(u.email) = 'admgeneral@unicesmag.edu.co')
```

Esta condición está dentro de la única función de verificación de privilegios del sistema. Como la identidad llega desde el propio cliente (§6.1), **basta con enviar ese correo como `adminUserId` para obtener administración total sin conocer ninguna contraseña**:

```
POST /api/roles/1/permissions
{ "adminUserId": "admgeneral@unicesmag.edu.co", "permissionIds": [...] }
```

Eso concede la capacidad de crear usuarios, reasignar roles y permisos, y leer el historial de auditoría de toda la universidad, **sin autenticarse**.

### 🔴 5.4 — CRÍTICA · Contraseñas en texto plano y puerta trasera de login

```js
// backend/controllers/auth.controller.js:31-33
const isValidPassword = (storedPassword === inputPassword) ||
                        (inputPassword === '123456'   && storedPassword === '12345678') ||
                        (inputPassword === '12345678' && storedPassword === '123456');
```

Dos problemas en tres líneas:

1. **Comparación en texto plano.** No hay `bcrypt`, `argon2` ni `scrypt` en ninguna dependencia del proyecto. El registro guarda `password.trim()` sin hashear (`auth.controller.js:101`), igual que la edición desde el panel admin (`adminGeneral.controller.js:130-133`).
2. **Puerta trasera.** `123456` y `12345678` son **intercambiables entre sí** en cualquier cuenta cuya contraseña sea una de las dos. Como `123456` es además la contraseña por defecto al crear usuarios (`adminGeneral.controller.js:72`), el alcance no es anecdótico.

**Esto contradice frontalmente la propia documentación del proyecto:** el RNF-06 exige hash bcrypt/Argon2 con sal, y `docs/SUPABASE_SECURITY.md` ordena literalmente *«guarda contraseñas con bcrypt, no en texto plano»*. Un jurado que lea ambos documentos verá la contradicción de inmediato.

### 🔴 5.5 — CRÍTICA · Escalada de privilegios por rol auto-declarado

```js
// backend/controllers/projectBank.controller.js:266,350,414
const normalizedRole = (userCtx?.role_name || userRole || '').toLowerCase();
```

Si `getUserContext()` no encuentra al usuario —por ejemplo, con un `userId` inexistente o forjado—, el backend **cae de vuelta al `userRole` que envió el cliente**. Un atacante que llame directamente a la API declarándose `"userRole": "administrador"` puede crear, editar y activar/desactivar ideas del banco de proyectos.

### 🟠 5.6 — ALTA · Contraseña hardcodeada en el código de conexión

```js
// backend/config/db.js:18
password: process.env.PGPASSWORD || '123456',
```

El secreto no vive solo en `.env.local`: está también en el código fuente publicado. Si el `.env` no carga en un despliegue mal configurado, la aplicación intentará conectarse con una credencial que cualquiera puede leer en GitHub.

**Corrección:** eliminar el valor por defecto y fallar de forma explícita — `if (!process.env.PGPASSWORD) throw new Error('PGPASSWORD no definida')`.

### 🟠 5.7 — ALTA · Contraseña por defecto visible en la interfaz

`frontend/src/features/admin-general/AdminGeneralPage.jsx:181` usa `'123456'` como contraseña por defecto al crear usuarios, y el `placeholder` del campo la **muestra literalmente en pantalla** (`AdminGeneralPage.jsx:947`). La cadena queda además horneada en el bundle compilado de `frontend/dist/`, que también está versionado.

---

## 6. Hallazgos de seguridad de la aplicación

### 🔴 6.1 — CRÍTICA · No existe autenticación (OWASP A01 + A07)

Este es **el hallazgo estructural del que dependen casi todos los demás**.

No hay JWT, ni sesiones, ni cookies firmadas. `backend/package.json` no incluye `jsonwebtoken`, `express-session`, `cookie-parser`, `bcrypt`, `helmet` ni `express-rate-limit`. El `login` responde con un objeto de usuario plano **sin ningún token** (`auth.controller.js:54-66`), y el frontend lo guarda tal cual en `localStorage` bajo la clave `gradohub_user` (`AuthContext.jsx:5,99,107,122`), incluyendo `role`, `permissions[]` y `programId`, sin firma ni verificación de integridad.

**Ningún router aplica middleware de autenticación.** El único archivo en `backend/middlewares/` ni siquiera es un middleware de Express: es una función llamada a mano desde cada handler. La identidad viaja como dato de aplicación en tres formas, todas controladas por el cliente:

| Vía | Ejemplo | Ubicación |
|---|---|---|
| Body | `{ "adminUserId": "..." }` | `adminGeneral.controller.js` (18 puntos) |
| Query string | `?userId=...` | `users.controller.js:157-165` |
| Cabecera HTTP | `x-user-id: ...` | `teachers.controller.js:6`, `projects.controller.js:658`, `projectBank.controller.js:6,121,186,466` |

**Consecuencia:** cualquier persona con `curl` y sin credenciales puede actuar como cualquier usuario del sistema. El RBAC modelado en la base de datos es correcto, pero **cosmético**, porque la aplicación nunca verifica quién hace la petición.

### 🟠 6.2 — ALTA · IDOR generalizado

Endpoints que no verifican que el recurso solicitado pertenezca a quien lo pide:

| Endpoint | Riesgo |
|---|---|
| `DELETE /api/projects/:id` | **Cualquiera puede borrar cualquier proyecto de grado.** Valida `isNaN(projectId)` pero ningún permiso (`projects.controller.js:632-652`) |
| `PUT /api/projects/:id` | Cualquiera edita cualquier proyecto |
| `PUT /api/students/:userId/academic-profile` | Cualquiera modifica el semestre de cualquier estudiante |
| `GET /api/students/:userId/research-process` | Cualquiera lee el proceso de investigación de cualquier estudiante |
| `GET /api/reports/detailed` | Devuelve nombre, correo y programa de **todos** los participantes de la universidad, sin ningún control |
| `GET /api/analytics` | Analítica completa, sin credencial |
| `GET /api/users/check-coauthor?email=` | **Enumeración de usuarios**: confirma si un correo existe y devuelve nombre y programa |
| `GET /api/catalogs` | Expone las tablas `roles` y `permissions` completas a visitantes anónimos |

### 🟠 6.3 — ALTA · Puerta trasera latente `authMode === 'local'`

En cinco puntos del frontend existe un bypass que **ignora todos los controles de rol**:

- `frontend/src/routes/ProtectedRoute.jsx:37` — `const canBypassRoleCheck = user.authMode === 'local';`
- `frontend/src/components/layout/Sidebar.jsx:48,141,170`
- `frontend/src/context/ProgramFilterContext.jsx:14`
- `frontend/src/features/banco-proyectos/BancoProyectos.jsx:40`

Hoy el backend siempre devuelve `authMode: 'postgres'`, así que es código inerte. Pero como la sesión se guarda sin firmar en `localStorage`, **basta con editar ese campo a `"local"` en las DevTools para desbloquear toda la interfaz de administración**. Es una mina enterrada: debe eliminarse, no dejarse «por si acaso».

### 🟠 6.4 — ALTA · CORS abierto a cualquier origen

```js
// backend/server.js:21
app.use(cors());
```

Sin configuración, acepta peticiones de cualquier sitio web. Combinado con la ausencia de autenticación, permite que una página de terceros invoque la API en nombre de un usuario con solo conocer o adivinar su `userId`.

**Corrección:** `cors({ origin: process.env.FRONTEND_URL, credentials: true })`.

### 🟡 6.5 — MEDIA · Interpolación de variables en SQL

La inmensa mayoría del código usa parámetros posicionales `$1, $2` correctamente —incluida la construcción dinámica de `WHERE` en `projectBank.controller.js:11-69`, que es un buen ejemplo—. Pero el módulo Chatbook rompe el patrón en cinco puntos:

- `backend/controllers/chatbook.controller.js:519` — `` `AND (... u_pr.program_id = ${programId} ...)` ``
- `backend/controllers/chatbook.controller.js:957`
- `backend/controllers/chatbook.controller.js:1161`
- `backend/chatbook/chatbook_orchestrator.js:198`
- `backend/services/chatbook_degree_options.js:75`

En los casos revisados, el valor interpolado (`programId`) proviene de una columna entera leída de la base de datos, no directamente del request, **por lo que no se confirmó una inyección explotable hoy**. Se reporta igualmente porque es precisamente el patrón que se copia y termina reutilizándose con entrada no confiable. Migrar a `$n` es trabajo de minutos.

### 🟡 6.6 — MEDIA · Fuga de información interna en errores

El patrón `res.status(500).json({ error: 'mensaje: ' + err.message })` concatena el mensaje crudo del driver `pg` —nombres de restricciones, columnas, sintaxis SQL— y lo envía al cliente. Aparece en `auth.controller.js:69,157`, `teachers.controller.js:47`, `projects.controller.js:292,423,552,626,648`, `projectBank.controller.js:113,178,242,320,404,458,552,601` y `reports.controller.js:230,399`.

En el frontend, `ErrorBoundary.jsx:103-104` muestra `error.message` **y `error.stack`** directamente en pantalla, también en producción.

**Corrección:** un middleware central de errores en Express que registre el detalle en el log y devuelva un mensaje genérico con un identificador de correlación.

### 🟡 6.7 — MEDIA · Sin helmet, rate limiting ni validación de entrada

- No hay `helmet` → faltan `X-Frame-Options`, `Content-Security-Policy`, `Strict-Transport-Security`.
- No hay `express-rate-limit` → el `/login` es vulnerable a fuerza bruta sin freno alguno, lo que combinado con §5.4 es especialmente grave.
- No hay `zod`, `joi` ni `express-validator` → las validaciones son manuales, parciales e inconsistentes.
- `express.json({ limit: '50mb' })` (`server.js:22-23`) es un límite muy alto sin ningún control adicional, lo que facilita el agotamiento de memoria.

### 🟡 6.8 — MEDIA · Dependencias con vulnerabilidades conocidas

`npm audit` reporta **3 vulnerabilidades moderadas**: `qs` (bypass de límite de array y DoS) y `react-router`/`react-router-dom` (open redirect vía backslash en `<Link>`/`useNavigate`, CVE-2025-68470 bypass; e inyección de constructor en `deserializeErrors()`). La corrección de React Router requiere subir a la v7, que es un cambio mayor.

### ℹ️ 6.9 — Sin riesgo · Comprobaciones con resultado negativo

Para dejar constancia de lo que **sí está limpio**:

- **No hay `dangerouslySetInnerHTML`** en ningún punto del frontend. React escapa por defecto, y no se detectó vector de XSS.
- **No hay claves de Supabase activas** en el código ni en el bundle compilado.
- **No hay `postgres://`, `service_role` ni claves privadas** en el árbol de trabajo.
- Las coincidencias de `123456` en `frontend/dist/assets/html2canvas-*.js` son constantes numéricas internas de esa librería, **falso positivo**.
- La cadena `eyJ...` en `package-lock.json:2338` es un hash de integridad SHA-512 de npm, **no un JWT**.

---

## 7. Calidad de código e ingeniería

### 7.1 Higiene del repositorio 🟠

| Métrica | Valor | Veredicto |
|---|---|---|
| Archivos versionados | **17.582** | |
| De los cuales son `node_modules/` | **17.337 (98,6 %)** | 🔴 |
| Código y documentación reales | ~245 archivos | |
| Tamaño de `.git` | ~93 MB | 🟠 |
| Tamaño del árbol de trabajo | ~358 MB | 🟠 |
| `.gitignore` | **No existe** | 🔴 |

Binarios versionados de más de 9 MB cada uno: `rolldown-binding.win32-x64-msvc.node` (×2, ~20 MB), `esbuild.exe` (~10 MB), `lightningcss.win32-x64-msvc.node` (×2, ~9,5 MB). Además está versionado `frontend/dist/` (el build compilado, un artefacto derivado que nunca debe commitearse) y `frontend/node_modules/.vite/` (caché de compilación).

**Carpetas huérfanas que deberían salir del repositorio:** `scratch/` (más de 40 scripts de depuración de un solo uso — y el vector del hallazgo §5.1), `.agents/skills/` (documentación de tooling de IA ajena al dominio académico) y `skills-lock.json`.

### 7.2 Sin red de seguridad automatizada 🟠

- **Cero pruebas.** No existe un solo archivo `*.test.js` o `*.spec.js` en todo el repositorio, ni configuración de Jest o Vitest. El **RNF-17 documentado exige ≥70 % de cobertura en módulos críticos**.
- **ESLint no funciona.** `frontend/eslint.config.js` importa `@eslint/js`, `globals`, `eslint-plugin-react-hooks` y `eslint-plugin-react-refresh`, pero **ninguno de los cuatro está declarado como dependencia ni instalado**. Además **no existe ningún script `lint`** en ningún `package.json`. El linter nunca se ha ejecutado con éxito en este proyecto.
- **Sin Prettier, sin hooks de pre-commit, sin CI/CD.** No hay `.github/workflows/`, ni `husky`, ni `lint-staged`. Un hook de pre-commit con detección de secretos habría bloqueado `.env.local` antes del primer commit — es exactamente la salvaguarda que faltó.

### 7.3 Deriva de esquema de base de datos 🟡

**El repositorio no permite recrear la base de datos.** El código consulta columnas y tablas que **no existen en ninguna migración versionada**:

| Elemento usado por el código | Estado en `supabase/migrations/` |
|---|---|
| `user_projects.project_role` | ❌ No existe en el DDL |
| `users.is_active`, `roles.is_active`, `permissions.is_active` | ❌ No existen |
| `projects.degree_option_id` | ❌ No existe |
| Tabla `public.user_permissions` | ❌ Nunca se crea |
| Tabla `public.degree_options` | ❌ Nunca se crea |

Y una discrepancia de tipo de fondo: `users.user_id` se define como `SERIAL` (entero) en `TrabajoGradoBD.sql:78`, pero el código genera IDs **de texto** (`randomUUID()` en `auth.controller.js:94`, `'usr_'+Date.now()` en `adminGeneral.controller.js:71`, literales como `'doc001'`) y trata la columna como cadena en todo el resto (`user_id::text`).

**Diagnóstico:** la base de datos real fue modificada a mano desde pgAdmin sin dejar rastro en el control de versiones. **Si se pierde el PostgreSQL local, el proyecto no arranca y no hay forma de reconstruirlo desde el repositorio.** Para un trabajo de grado evaluable esto es un riesgo de reproducibilidad de primer orden.

### 7.4 Complejidad y duplicación 🔵

Archivos que concentran demasiada responsabilidad:

| Archivo | Líneas |
|---|---:|
| `backend/chatbook/regulation/regulation_data.js` | 1.942 |
| `backend/controllers/chatbook.controller.js` | 1.739 |
| `frontend/src/features/banco-proyectos/BancoProyectos.jsx` | 1.368 |
| `frontend/src/features/proyectos/ProyectosPage.jsx` | 1.332 |
| `frontend/src/features/admin-general/AdminGeneralPage.jsx` | 1.215 |
| `frontend/src/features/reportes/ReportesPage.jsx` | 796 |
| `backend/controllers/adminGeneral.controller.js` | 759 |

`chatbook.controller.js` contiene una única función `queryChatbook` de ~1.270 líneas con decenas de ramas `if` secuenciales. `adminGeneral.controller.js` repite quince veces el mismo patrón `BEGIN / assertAdminGeneral / … / COMMIT / ROLLBACK / finally`, que pide a gritos un helper `withTransaction()`.

**Duplicación:** la función `generatePrefix()` existe por duplicado en `features/proyectos/generatePrefix.js` y en `CrearProyecto.jsx:6-14`; `activeProgramPredicate()` está duplicada entre `projects.controller.js:10-12` y `users.controller.js:37-39`; y el bloque de filtrado Psicología/Sistemas está triplicado (§4.2.A).

**Logging:** 63 llamadas a `console.log`/`console.error` en el backend, sin niveles, sin identificador de petición y sin librería estructurada (`winston`/`pino`).

### 7.5 Bugs funcionales confirmados 🔵

**1. El selector de programa de Gestión Docente está roto.**

```jsx
// frontend/src/features/gestion-docente/GestionDocente.jsx:170
onChange={(e) => setSelectedProgramId(e.target.value)}
```

`setSelectedProgramId` **no existe**. El hook importa `setSelectedProgram` (línea 14) y `selectedProgramId` es una `const` derivada (línea 20). Al usar el selector siendo Administrador General, React lanza `ReferenceError` y la página cae al `ErrorBoundary`. **La corrección es cambiar una palabra.**

**2. La edición de perfil no persiste.**

`Ajustes.jsx:134` llama a `updateUser()` del `AuthContext`, cuyo cuerpo (`AuthContext.jsx:116-123`) **solo actualiza el estado local y `localStorage`**. No existe ningún método en `api.js` que guarde el perfil en el backend. Al recargar la página, los cambios de nombre y programa desaparecen **sin ningún mensaje de error**.

### 7.6 Configuración y código muerto 🔵

- **Tailwind está instalado pero no se usa.** `@tailwindcss/vite` y `tailwindcss` son dependencias, pero el plugin **no está registrado** en `vite.config.js`, no existe `tailwind.config.js` y **ninguna hoja de estilos contiene una sola directiva `@tailwind`**. Todo el estilado se hace con 17 archivos CSS manuales y variables CSS nativas (`globals.css`, 1.102 líneas). Son dependencias muertas: o se adoptan o se desinstalan.
- **Dependencias duplicadas.** Las 14 dependencias de `frontend/package.json` están **repetidas exactamente** en el `package.json` de la raíz, que es solo un orquestador y no debería necesitar React, Tailwind ni jsPDF. Esto duplica la instalación física y arriesga que ambas copias diverjan.
- **Código muerto:** `frontend/src/lib/supabase/*` (4 stubs), `AjustesPagePlaceholder.jsx` (no enrutado), `assets/react.svg` y `vite.svg`, `index.css` y `App.css` (vacíos, no importados).
- **Asset roto:** `Chatbook.jsx:198` referencia `/chatbook/gato-cesmag.png`, que no existe en `frontend/public/` — genera un 404 en cada carga (mitigado por un `onError`).
- **Ruta de configuración equivocada:** `backend/server.js:15` carga `backend/.env.local`, archivo que **no existe** (está en la raíz). Solo `db.js:10` usa la ruta correcta `../.env.local`. Funciona por accidente, según el orden de importación de módulos.
- **Rama `master` obsoleta:** contiene un único commit (`7325e1c1`, el raíz), es ancestro directo de `main` y no aporta nada — pero **duplica la exposición pública del `.env.local` inicial**.

---

## 8. Coherencia entre documentación y código

La documentación académica es, en general, de buena calidad: 43 requisitos funcionales en 7 módulos, 26 RNF con criterios de aceptación medibles, 21 historias de usuario trazadas explícitamente a los RF, normalización formal 1FN→3FN y diagramas ER y de clases coherentes entre sí. Ese trabajo está bien hecho y conviene defenderlo.

Los problemas son de **sincronización** con lo que realmente se construyó.

### 8.1 Documentación técnica desactualizada 🟡

El commit `cf66a4f5` (9 de septiembre) escribió `README.md` y `docs/ARCHITECTURE.md` describiendo una estructura `src/` y `server/`. El commit siguiente, `f9f351b7` *"Actualización de carpetas"* (10 de septiembre, **el último del repositorio**), eliminó `src/` y `server/` reemplazándolos por `frontend/` y `backend/` — **sin tocar la documentación**.

Resultado: todo el árbol de directorios de `docs/ARCHITECTURE.md` (`server/index.js`, `server/db.js`, `src/lib/api.js`…) apunta a rutas inexistentes, y el README remite a ese documento como «oficial». Daño colateral del mismo commit: `scratch/run-migrations.js` importa `'../server/db.js'` y quedó roto.

### 8.2 Requisitos documentados pero no implementados 🟡

| Requisito | Estado real |
|---|---|
| **Rol «Secretario»** (RF5, HU-03) | ❌ No existe ningún rastro en el código. El sistema solo reconoce Administrador General, Administrador, Docente y Estudiante |
| **Notificaciones** (RF24-26, HU-11/12) | ⚠️ El panel de `Header.jsx` solo lista los proyectos donde el usuario participa. No hay tabla de notificaciones, ni envío por correo, ni nada que cumpla el criterio *«la notificación llega en menos de 5 minutos»* |
| **RNF-06 a RNF-11** (seguridad) | ❌ Ninguno implementado: sin hash de contraseñas, sin HTTPS/TLS, sin bloqueo tras 5 intentos, sin expiración de sesión, sin protección OWASP |
| **RNF-17** (cobertura ≥70 %) | ❌ Cero pruebas |
| **Pruebas de usabilidad** (objetivo específico 3) | ❌ Sin evidencia de instrumentos aplicados ni resultados |
| Tablas `OBSERVACION`, `NOTIFICACION`, `SESION` (normalización) | ❌ Nunca se implementaron |

### 8.3 Funcionalidad implementada pero no documentada 🟡

- **El Chatbook completo** —un módulo de más de 4.000 líneas entre backend y frontend— **no aparece mencionado ni una sola vez** en la propuesta ni en las hojas de requisitos. Es probablemente la funcionalidad más vistosa del sistema y no tiene ni un RF que la respalde.
- **El módulo de Administrador General** excede ampliamente cualquier RF documentado.
- **La gestión de semestres y la promoción académica** no tienen RF ni historia de usuario asociada.

### 8.4 Vacío metodológico 🟡

El documento declara con rigor la metodología de **investigación** (paradigma positivista, enfoque cuantitativo, diseño cuasiexperimental, muestra sobre ~1.400 personas, validación por juicio de expertos y alfa de Cronbach), pero **no declara ninguna metodología de desarrollo de software**. Scrum, RUP, XP y Cascada solo se citan al describir trabajos antecedentes de otras universidades.

Es una pregunta casi segura en la sustentación. Conviene decidir y documentar qué se usó realmente —aunque haya sido un desarrollo incremental informal— y respaldarlo con la evidencia que ya existe: el historial de 44 commits.

Además, el apartado de recursos técnicos menciona *«PostgreSQL y pgAdmin, HTML, CSS3, JavaScript y Visual Studio Code»* y **no menciona React, Vite ni Express**, que son las tecnologías realmente usadas.

### 8.5 Supabase: una migración abandonada sin cierre 🟡

La persistencia real es **100 % PostgreSQL local** vía `pg.Pool`. Supabase fue una vía explorada y descartada —`docs/AGENT_MEMORY.md` registra el bloqueo que la mató (`relation "public.users" does not exist`)— pero **ningún commit ni documento cierra formalmente la decisión**, y quedaron artefactos huérfanos que confunden a cualquiera que abra el repositorio:

- `docs/SUPABASE_SETUP.md` y `docs/SUPABASE_SECURITY.md` describen un login por RPC `public.app_login` e instruyen ejecutar `supabase/migrations/20260424_secure_users_login.sql`, **archivo que no existe**. (Solo contienen placeholders, no claves reales.)
- `supabase/migrations/20260427_user_projects_rls_policies.sql` define políticas RLS con `auth.uid()`, función que **solo existe en el esquema `auth` de Supabase**. Contra el PostgreSQL local fallaría. Y aunque se aplicaran, **no protegerían nada**: el backend se conecta como `postgres`, superusuario que bypassa RLS.
- La carpeta `supabase/migrations/` sigue siendo, pese al nombre engañoso, donde vive el DDL real del PostgreSQL local.

### 8.6 Documentación que falta para un trabajo de grado de ingeniería 🟡

No existe en el repositorio: **manual de usuario** por rol, **manual técnico de instalación y despliegue** (más allá de cuatro líneas en el README), **diagrama de casos de uso**, **diagramas de secuencia**, **diagrama de despliegue**, **diagrama de componentes** (`ARCHITECTURE.md` es un árbol de carpetas, no una arquitectura lógica), **plan de pruebas**, **informe de resultados de la validación con usuarios** (prometido en la metodología) y **diccionario de datos actualizado** que incluya las tablas añadidas después de los diagramas.

---

## 9. Plan de remediación priorizado

### 9.1 🔴 HOY — Contención de la fuga

Estas cuatro acciones no admiten espera y deben hacerse **en este orden**:

**1. Hacer privado el repositorio en GitHub.**
`Settings → General → Danger Zone → Change repository visibility → Private`. Es la acción de un minuto que detiene la exposición mientras se ejecuta el resto.

**2. Rotar la contraseña de PostgreSQL.** Cambiarla en pgAdmin y actualizar el `.env.local` local (que dejará de estar versionado en el paso 4). **Esto es obligatorio independientemente de cualquier limpieza de Git** — ver §9.2.

**3. Gestionar la fuga de datos personales.** Es el punto más delicado, porque involucra a terceros:
- Forzar el cambio de contraseña de **todas** las personas que aparecen en `scratch/dump_20260904.sql`.
- Informar a la asesora y a la instancia correspondiente de la universidad. Bajo la Ley 1581 de 2012 hay obligaciones de notificación de incidentes, y esa misma ley está citada en los RNF del proyecto.
- No volver a generar nunca un volcado que incluya la columna `password`.

**4. Crear `.gitignore` y sacar del control de versiones lo que no debe estar:**

```bash
cat > .gitignore <<'EOF'
node_modules/
frontend/node_modules/
frontend/dist/
dist/
.env
.env.local
.env.*.local
scratch/
*.log
~$*
EOF

git rm -r --cached node_modules frontend/node_modules frontend/dist scratch
git rm --cached .env.local
git commit -m "chore: añadir .gitignore y retirar secretos, dependencias y artefactos del control de versiones"
```

> `git rm --cached` **no borra los archivos del disco**, solo deja de rastrearlos. El `.env.local` sigue funcionando en local.

**5. Purgar el historial** (después de los pasos anteriores, y **coordinándolo con Vanessa y Yimmy**, porque reescribe los SHA de todos los commits):

```bash
pip install git-filter-repo
git filter-repo --invert-paths \
  --path .env.local \
  --path scratch/dump_20260904.sql \
  --path node_modules \
  --path frontend/node_modules \
  --path frontend/dist
git push origin --force --all
git push origin --delete master   # rama obsoleta que duplica la exposición
```

Después, activar **Secret scanning** y **Push protection** en la configuración del repositorio para evitar la reincidencia.

### 9.2 Por qué rotar la credencial aunque se purgue el historial

Es importante entenderlo bien, porque es un error frecuente creer que basta con borrar el archivo:

1. El repositorio ha sido **público desde el primer push** (8 de agosto). Cualquiera pudo clonarlo o hacer un fork en ese tiempo, y **ese clon conserva el secreto para siempre**, sin importar qué se haga después en `origin`.
2. Los escáneres automáticos que recorren GitHub público en tiempo real, los motores de búsqueda de código y la propia caché de GitHub pueden haberlo indexado ya. Un `push --force` no alcanza a ninguna de esas copias.
3. Por diseño de Git, los objetos «purgados» siguen siendo recuperables desde el `reflog` y los packs hasta un `git gc --prune=now`, y eso solo afecta al repositorio local y al remoto, nunca a las copias distribuidas.

**La única mitigación real y suficiente es cambiar la credencial en el sistema que la usa**, de modo que el valor filtrado quede inútil por muchas copias que existan. Purgar el historial es higiene hacia adelante, no reparación.

### 9.3 🔴 Esta semana — Autenticación real

**1. Hashear las contraseñas** y eliminar la puerta trasera:

```bash
npm install bcrypt --prefix backend
```

```js
// backend/controllers/auth.controller.js — sustituir las líneas 31-33
const isValidPassword = await bcrypt.compare(inputPassword, storedPassword);
```

Script de migración único que rehashee las contraseñas existentes, y forzar cambio en el primer inicio de sesión. Aplicar lo mismo en el registro (`auth.controller.js:101`) y en la edición desde el panel (`adminGeneral.controller.js:130-133`).

**2. Eliminar el bypass del correo hardcodeado** en `backend/middlewares/adminGeneral.middleware.js:8`. La verificación debe basarse únicamente en el rol asignado en la base de datos.

**3. Introducir JWT y un middleware de Express real:**

```js
// backend/middlewares/auth.middleware.js  (nuevo)
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);  // ← la identidad viene de aquí
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Sin permiso' });
```

Aplicarlo en los routers, no dentro de los handlers:

```js
// backend/routes/adminGeneral.routes.js
router.use(requireAuth, requireRole('administrador general'));
```

**4. Y el cambio de mentalidad que sostiene todo lo anterior:** dejar de leer `userId`, `adminUserId`, `userRole` y `x-user-id` del request. La identidad debe salir siempre de `req.user`, que solo el servidor puede escribir. Esto implica revisar los 18 puntos de `adminGeneral.controller.js`, los de `users.controller.js:157-165`, `projectBank.controller.js:266,350,414`, `teachers.controller.js:6`, `projects.controller.js:658` y `projectBank.controller.js:6,121,186,466`.

**5. Eliminar el bypass `authMode === 'local'`** de los cinco puntos del frontend (§6.3).

**6. Cerrar los IDOR:** todo endpoint con `:id` o `:userId` debe verificar que `req.user` tenga derecho sobre ese recurso. Empezar por `DELETE /api/projects/:id`.

### 9.4 🟠 Este mes — Endurecimiento y reproducibilidad

| Acción | Detalle |
|---|---|
| Restringir CORS | `cors({ origin: process.env.FRONTEND_URL, credentials: true })` |
| Añadir helmet y rate limiting | `helmet()` global; `express-rate-limit` estricto en `/api/login` |
| Validar entradas | `zod` en el borde de cada endpoint |
| Middleware central de errores | Registrar el detalle, devolver mensaje genérico con ID de correlación. Quitar `error.stack` de `ErrorBoundary.jsx:104` |
| Parametrizar el SQL del Chatbook | Los 5 puntos de §6.5 |
| **Congelar el esquema real** | `pg_dump --schema-only BaseDatosGrado > supabase/migrations/00_schema_baseline.sql` y versionarlo. Sin esto, la base de datos no es reproducible (§7.3) |
| Actualizar dependencias | `npm audit fix`; planificar la subida a React Router 7 |
| Eliminar el valor por defecto de `db.js:18` | Fallar explícitamente si falta `PGPASSWORD` |
| Variable de entorno en el frontend | `VITE_API_URL` con fallback a `/api` |
| Arreglar los dos bugs de §7.5 | `GestionDocente.jsx:170` es un cambio de una palabra |

### 9.5 🟡 Antes de la sustentación — Coherencia documental

Esto es lo que un jurado mirará, y buena parte es trabajo de escritura, no de código:

1. **Actualizar `README.md` y `docs/ARCHITECTURE.md`** a la estructura real `frontend/` + `backend/`.
2. **Documentar el Chatbook** con sus propios RF, describiéndolo honestamente como **sistema experto basado en reglas**, no como IA.
3. **Declarar la metodología de desarrollo** usada, respaldándola con el historial de commits.
4. **Actualizar los diagramas ER y de clases** para incluir `students`, `semesters`, `academic_curricula`, `project_bank`, `research_progress` y `research_documents`.
5. **Decidir qué pasa con el rol «Secretario» y las notificaciones**: implementarlos o retirarlos de los requisitos. Un requisito documentado y no implementado es una pregunta incómoda garantizada.
6. **Cerrar formalmente el capítulo de Supabase**: eliminar `docs/SUPABASE_*.md` y la política RLS huérfana, y dejar constancia de la decisión en la bitácora técnica. Que la carpeta se siga llamando `supabase/` conviene explicarlo o renombrarlo a `database/migrations/`.
7. **Añadir lo que falta**: manual de usuario, manual técnico, casos de uso, diagrama de despliegue y plan de pruebas.
8. **Corregir el apartado de recursos técnicos** del documento para que mencione React, Vite y Express.

### 9.6 🔵 Deuda técnica de fondo

- Arrancar con pruebas donde más duelen: `auth.controller.js` y el motor de permisos. Vitest para el frontend, Node test runner o Jest para el backend. No hace falta llegar al 70 % de golpe; una suite pequeña que cubra autenticación vale más que un número.
- Reparar ESLint: instalar los cuatro paquetes que faltan y añadir el script `lint`.
- Añadir `husky` + `lint-staged` con detección de secretos (`gitleaks`) en pre-commit.
- Extraer un helper `withTransaction()` y una capa de repositorio; dividir `chatbook.controller.js` en un mapa de intenciones.
- Decidir sobre Tailwind: adoptarlo o desinstalarlo.
- Limpiar dependencias duplicadas entre el `package.json` raíz y el del frontend.
- Eliminar el código muerto (`lib/supabase/*`, `AjustesPagePlaceholder.jsx`, assets de plantilla) y las carpetas huérfanas (`.agents/`, `skills-lock.json`).

---

## 10. Conclusión

El proyecto demuestra capacidad técnica real. La organización por features, el cliente API centralizado sin una sola llamada dispersa, el uso correcto de transacciones y pool de conexiones, el bloqueo consultivo contra condiciones de carrera, la normalización formal de la base de datos y la trazabilidad de requisitos a historias de usuario son decisiones de alguien que entiende lo que está haciendo. **Nada de este informe sugiere reescribir el sistema.**

Lo que falta es una capa que nunca se construyó. La seguridad no se abordó como un componente del diseño, sino que se fue posponiendo hasta quedar sustituida por atajos de desarrollo —el correo de administrador hardcodeado, las contraseñas intercambiables, la identidad enviada por el cliente— que funcionan perfectamente en la máquina de quien programa y colapsan en cuanto el sistema toca una red. Es un patrón habitual en proyectos académicos, y es corregible: las tres acciones de la §9.3 —hashear, eliminar los bypass e introducir un middleware de autenticación real— cambian la postura de seguridad del sistema por completo, y son días de trabajo, no meses.

Lo urgente, en cambio, no es de código. El repositorio está publicado con datos personales y contraseñas de treinta personas de la universidad. Eso se resuelve hoy, con los pasos de la §9.1, y la lección que deja —que `.gitignore` y un hook de pre-commit son infraestructura de seguridad, no burocracia— vale por sí sola como aprendizaje de ingeniería.

Queda un último punto que no es técnico pero pesa igual en una sustentación: la distancia entre lo documentado y lo construido. Hay requisitos escritos que nunca se implementaron y un módulo entero —el Chatbook— que funciona y no aparece en ningún documento. Cerrar esa brecha es trabajo de escritura, es el más barato de todos los que propone este informe, y es el que más nota defiende.

---

<sub>Auditoría de solo lectura. No se modificó ningún archivo del repositorio ni se ejecutó ninguna operación de escritura sobre Git. Todas las credenciales aparecen enmascaradas. Cada hallazgo fue verificado por lectura directa del código o del historial citado.</sub>
