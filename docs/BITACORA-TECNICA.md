# Bitácora de decisiones técnicas

GradoHub · Universidad CESMAG

Registro de las decisiones de arquitectura que no se deducen leyendo el código,
con su motivo y su fecha. Sirve para responder «¿por qué está hecho así?» sin
depender de la memoria de nadie.

---

## 1. Se abandonó Supabase en favor de PostgreSQL local

**Fecha de la decisión:** durante el desarrollo, antes de septiembre de 2026.
**Estado:** cerrada. La persistencia real es PostgreSQL gestionado por la propia API.

El proyecto arrancó apoyándose en Supabase —servicio gestionado que aporta base de
datos, autenticación y políticas de seguridad a nivel de fila— y más adelante pasó
a una base PostgreSQL local con una API propia en Express.

**Por qué se cambió:** el sistema debe funcionar sobre la infraestructura de la
universidad y con los datos dentro de ella. Depender de un servicio externo para
almacenar información académica y personal de estudiantes añade una transferencia
de datos a un tercero que la Ley 1581 de 2012 obliga a justificar, y ata el
proyecto a una cuenta y a un plan de pago que la institución no controla.

**Qué quedó del cambio y qué se hizo con ello:**

| Artefacto | Qué es en realidad | Decisión |
|---|---|---|
| `supabase/migrations/*.sql` | Archivo de migraciones SQL **manuales** de PostgreSQL. No tenía nada de Supabase salvo el nombre de la carpeta | **Renombrada a `database/migrations/` el 2026-09-15.** Se conserva: documenta la evolución del esquema. Ver `database/README.md` |
| `database/migrations/20260427_user_projects_rls_policies.sql` | Políticas de seguridad a nivel de fila, un mecanismo de Supabase | Huérfano: no se aplica. Se conserva solo como registro histórico |
| `frontend/src/lib/supabase/` | Cliente y funciones de registro contra Supabase | **Eliminado el 2026-09-14.** Eran cuatro archivos de 1 a 4 líneas que solo lanzaban «Deprecated»; ningún componente los importaba |
| `docs/SUPABASE_SETUP.md`, `docs/SUPABASE_SECURITY.md` | Guías de configuración del servicio | **Eliminados el 2026-09-15.** Mandaban ejecutar `20260424_secure_users_login.sql`, un archivo que no existe, y describían un login por RPC que nunca llegó a usarse. Lo que valía de ellos es esta misma sección |
| `docs/AGENT_MEMORY.md` | Notas de trabajo de abril de 2026 sobre el intento de login contra Supabase | **Eliminado el 2026-09-15.** Apuntaba a `src/pages/Login.jsx` y `src/lib/supabase/`, rutas que ya no existen |

**Aviso para la sustentación:** `docs/SUPABASE_SECURITY.md` decía literalmente
«guarda contraseñas con bcrypt, no en texto plano» mientras el código las
comparaba en claro. Esa contradicción ya no existe —desde septiembre de 2026 las
contraseñas se guardan con bcrypt, y el documento que la contenía se eliminó—,
pero conviene saber que estuvo ahí por si alguien del jurado leyó aquella
versión.

---

## 2. Las migraciones SQL del repositorio no se ejecutan solas

**Descubierto:** 14 de septiembre de 2026.

Hay dos mecanismos de migración distintos y conviene no confundirlos:

- **`backend/migrations/*.js`** — se ejecutan **en cada arranque** del servidor.
  Son idempotentes (`CREATE TABLE IF NOT EXISTS`) y solo cubren las tablas del
  Banco de Proyectos.
- **`database/migrations/*.sql`** (hasta el 2026-09-15, `supabase/migrations/`) —
  **ningún código del proyecto las lee.** Son
  archivos que alguien ejecutó a mano en pgAdmin en su momento. Verificado
  buscando referencias a esa ruta en todo el código.

**Consecuencia real de esa confusión.** La migración
`20260910_fix_sequences_and_degree_program_scope.sql` sincroniza las secuencias
de todas las columnas SERIAL, pero solo mira las que cumplen
`column_default LIKE 'nextval(%'`. Tres tablas —`project_bank`,
`project_bank_histories` y `degree_options`— **habían perdido ese valor por
defecto**, así que la migración las saltaba justo por el motivo que había que
arreglar. El resultado es que crear una idea en el Banco de Proyectos fallaba con
error 500, y ni la migración ni el arranque lo detectaban.

Se corrigió con `backend/scripts/optimize_database.js`, que sí comprueba la
ausencia del valor por defecto y la repara.

**Deuda pendiente:** unificar los dos mecanismos. Lo razonable es un ejecutor de
migraciones que lleve registro de cuáles se aplicaron, y mover ahí los `.sql`.

---

## 3. El Chatbook es un sistema experto, no inteligencia artificial

**Estado:** documentado en `docs/CHATBOOK.md`.

Se describió durante un tiempo como «asistente inteligente», expresión que sugiere
un modelo de lenguaje. No lo hay: la clasificación se hace con expresiones
regulares y las respuestas salen de la base de datos o del texto del Acuerdo 105.

Se decide **describirlo con precisión** en lugar de mantener la etiqueta, porque
para este problema el determinismo es una ventaja, no una carencia: un sistema que
cita normativa académica no debe poder inventarse un artículo.

---

## 4. La identidad de quien pide sale del servidor, nunca del cliente

**Fecha:** 14 de septiembre de 2026.

Hasta entonces cada endpoint recibía la identidad como un dato más de la petición
(`userId`, `adminUserId`, `userRole`, cabecera `x-user-id`) y se fiaba de ella.
El RBAC estaba bien modelado en la base de datos, pero era decorativo: bastaba
con escribir otro identificador para actuar como cualquier persona.

Se introdujo un token de sesión firmado (JWT) y el middleware `requireAuth`, que
además **sustituye** cualquier identidad que venga escrita en la petición por la
del token. Esa sustitución fue deliberada: permitió proteger los diez
controladores de golpe sin reescribirlos, y después migrarlos uno a uno a
`actorId(req)` con la garantía de que ninguno podía ser engañado mientras tanto.

---

## 5. Las condiciones de carrera se resuelven en la base de datos

**Fecha:** 14 de septiembre de 2026.

Dos reglas del dominio no se pueden garantizar comprobando y actuando por
separado, porque entre una cosa y otra cabe otra petición:

- «un estudiante no puede tener dos proyectos activos»
- «un estudiante no puede tener dos ideas del banco asignadas»

Ambas usan ahora `pg_advisory_xact_lock` **por estudiante**: las peticiones de una
misma persona se atienden en fila, las de personas distintas siguen en paralelo.

Por el mismo motivo se eliminó el cálculo de identificadores con `MAX(id)+1`, que
producía choques cuando dos altas simultáneas leían el mismo máximo. Los asigna la
secuencia de la tabla, que es lo que PostgreSQL sabe hacer sin carreras.
`npm run test:concurrency` comprueba que siga siendo cierto.

---

## 6. Metodología de desarrollo

El proyecto se desarrolló de forma **incremental e iterativa**, por módulos
funcionales completos: cada uno se llevó desde el modelo de datos hasta la
pantalla antes de empezar el siguiente. El historial de Git lo respalda: los
commits agrupan trabajo por módulo —banco de proyectos, gestión docente,
administración general, reportes— y no por capa técnica.

Las mejoras posteriores a las auditorías de septiembre de 2026 siguieron el
principio de **estrangulamiento progresivo**: añadir lo nuevo sin borrar lo viejo,
migrar un módulo cada vez y verificar antes de continuar. Es lo que permitió
introducir la autenticación y el sistema de diseño sin detener el resto del
trabajo ni dejar la aplicación inutilizable en ningún momento.

---

## 7. Carpetas y archivos retirados

El 14 de septiembre de 2026 se eliminó código que ya no formaba parte del sistema.
Cada eliminación se comprobó antes, no se dio por supuesta:

| Retirado | Por qué |
|---|---|
| `server/index.js` (4.998 líneas) | El backend monolítico anterior a la separación en `backend/`. **Sus propios imports ya no existían** (`./db.js`, `./chatbook/`, `./migrations/`), así que no podía ni ejecutarse. Se compararon sus 52 endpoints con los 56 del código vivo: **ninguno faltaba**, y el código vivo tenía 5 más |
| `frontend/src/lib/supabase/` | Cuatro archivos de 1 a 4 líneas que solo lanzaban «Deprecated: removed». Nadie los importaba |
| `frontend/public/favicon.svg` | Logotipo morado de plantilla, no la marca de la Universidad CESMAG |
| `frontend/public/icons.svg` | Sprite de iconos de redes sociales, de plantilla; sin usar |
| `frontend/src/assets/` | `react.svg`, `vite.svg` y `hero.png`, sin una sola referencia en el código |

Todo es recuperable con `git checkout` mientras no se confirmen los cambios.

### Limpieza de `scratch/`

El 15 de septiembre de 2026 se vació `scratch/`, que acumulaba 87 archivos:
**72 importaban de la carpeta `server/` ya retirada**, de modo que estaban
definitivamente rotos, y el resto eran volcados intermedios o pruebas
superadas por la batería de `scripts/` (`scripts/test-chatbook.js` sustituye a
`scratch/test_all_chatbook_questions.js`).

Antes de borrar se separó lo que sí tenía valor. Tres archivos constituían la
**procedencia de la fuente normativa del Chatbook** y se trasladaron a
`scripts/reglamento/`:

| Archivo | Función en el pipeline |
|---|---|
| `parse_reglamento.py` | Extrae el PDF del Acuerdo 105 de 2023 y lo segmenta en 8 capítulos y 43 artículos |
| `reglamento_structured.json` | El reglamento estructurado, resultado del paso anterior |
| `build_module_files.py` | Serializa ese JSON a `backend/chatbook/regulation/regulation_data.js` |

Se les corrigieron las rutas que los hacían irreproducibles —el PDF apuntaba al
escritorio personal de una de las autoras y el destino era `server/`— y se
documentaron en `scripts/reglamento/README.md`. **Verificación:** se regeneró
`regulation_data.js` desde el JSON en una carpeta temporal y el resultado fue
byte por byte idéntico al archivo en uso, de modo que el pipeline es
reproducible y no documentación decorativa.

Se borraron 83 archivos; los 83 estaban versionados, así que `git checkout
scratch/` los devuelve mientras no se confirmen los cambios.

**Sigue en `scratch/` el archivo `dump_20260904.sql`**, con datos personales
reales. No se elimina aquí porque borrarlo del árbol de trabajo no lo saca del
historial de Git: eso exige `git filter-repo` coordinado con el resto del
equipo. Ver la §9.1 de `docs/auditorias/AUDITORIA.md`.

### `supabase/` renombrada a `database/migrations/`

Mismo día. La carpeta llevaba el nombre de un proveedor que el proyecto ya no
usa, y su contenido eran ocho migraciones SQL corrientes de PostgreSQL. El
nombre hacía creer que existía una integración con Supabase que no existe;
`database/migrations/` describe lo que hay. Se verificó antes que **ningún
archivo del código referencia esa ruta**.

Se encontró además que `TrabajoGradoDB.txt` y `TrabajoGradoBD.sql` eran **el
mismo archivo duplicado** —idénticos salvo el salto de línea final— con nombres
que solo se distinguen por el orden de dos letras. Se conserva el `.sql`.

`database/README.md` documenta el contenido y repite la advertencia que más
cara ha salido en este proyecto: estas migraciones **no se ejecutan solas**, a
diferencia de las de `backend/migrations/*.js`.

---

## 8. Pendiente de decidir

Cuestiones abiertas que conviene resolver antes de la sustentación, porque un
requisito documentado y no implementado es una pregunta garantizada:

- **Rol «Secretario»**: aparece en los requisitos y no está implementado.
  Implementarlo o retirarlo del documento.
- **Notificaciones**: documentadas como requisito; en el sistema existe el
  contador de proyectos asignados del encabezado, que no es lo mismo.
- **Los cuatro temas incompletos** (ocean, forest, crimson, violet) solo cambian
  la barra lateral y los acentos. Completarlos o presentarlos como variantes de
  acento.
- **Unificación de los puntos de corte** del CSS: hay 15 valores distintos y el
  objetivo son 4. Requiere revisión visual módulo a módulo.
