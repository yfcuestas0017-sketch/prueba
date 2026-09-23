# GradoHub — Plataforma de Gestión de Proyectos de Grado

Universidad CESMAG · Facultad de Ingeniería

Sistema para la administración, trazabilidad y control académico de los proyectos
de grado: desde la propuesta del estudiante hasta la sustentación, con el
reglamento institucional consultable desde la propia aplicación.

---

## Puesta en marcha

### Requisitos

- Node.js 18 o superior
- PostgreSQL con la base de datos `BaseDatosGrado`

### Configuración

Copia la plantilla de variables de entorno y rellénala:

```bash
cp .env.example .env.local
```

Hacen falta las credenciales de PostgreSQL y un secreto para firmar las sesiones.
El secreto se genera así:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> `.env.local` **no se versiona**: contiene secretos. El `.gitignore` lo excluye.

### Ejecución

```bash
npm install
npm run dev
```

- API: http://localhost:5000
- Aplicación: http://localhost:5173

También pueden lanzarse por separado con `npm run backend` y `npm run frontend`.

---

## Estructura

Dos aplicaciones autónomas que solo se comunican por HTTP:

```
backend/     API REST — Express 5 + PostgreSQL
frontend/    Aplicación React 18 + Vite
scripts/     Orquestador de arranque, baterías de prueba y pipeline del reglamento
database/    Migraciones SQL manuales (no se ejecutan solas — ver database/README.md)
docs/        Documentación técnica
```

El detalle completo —recorrido de una petición, responsabilidad de cada carpeta y
decisiones de diseño— está en **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Módulos

| Módulo | Qué hace |
|---|---|
| **Autenticación** | Registro con selección de semestre e inicio de sesión |
| **Panel** | Resumen académico y analítica con gráficas |
| **Proyectos** | Registro, edición, participantes, historial y proceso de investigación por fases |
| **Banco de Proyectos** | Catálogo de ideas propuestas por docentes y su selección por estudiantes |
| **Gestión Docente** | Vista agregada de asesores y jurados, y su carga de trabajo |
| **Reportes** | Exportación institucional a PDF y Word, generada en el navegador |
| **Administración General** | Usuarios, roles, permisos, programas, auditoría y gestión directa de tablas |
| **Chatbook** | Consulta del reglamento y de los datos académicos — ver [docs/CHATBOOK.md](docs/CHATBOOK.md) |

---

## Roles

| Rol | Alcance |
|---|---|
| **Administrador General del Sistema** | Acceso total: usuarios, roles, permisos, programas, auditoría y tablas |
| **Administrador** | Gestión operativa de usuarios, proyectos y reportes |
| **Director** | Seguimiento de los proyectos de su programa |
| **Docente** | Propuesta de ideas, asesoría y seguimiento como asesor o jurado |
| **Estudiante** | Registro y seguimiento de su propio proyecto de grado |

El control de acceso se aplica **en el servidor**: la identidad de quien pide
sale del token de sesión firmado, nunca de lo que envíe el cliente.

---

## Seguridad

- Contraseñas almacenadas con **hash bcrypt y sal** (RNF-06).
- Sesiones con **JWT firmado**; el middleware `requireAuth` protege todas las
  rutas salvo el inicio de sesión, el registro y el catálogo público del
  formulario de registro.
- **helmet** para las cabeceras de seguridad, **CORS restringido** al origen
  declarado en `FRONTEND_URL` y **límite de intentos** en el inicio de sesión.
- Consultas **parametrizadas**; los errores no devuelven detalles internos, solo
  un identificador de correlación con el que localizarlos en el log.

---

## Pruebas

| Comando | Qué comprueba |
|---|---|
| `npm run test:auth` | 44 casos de autenticación, hash de contraseñas y control de acceso |
| `npm run test:chatbook` | 88 preguntas reales contra los tres perfiles |
| `npm run test:errors` | 17 casos del middleware central de errores |
| `npm run test:concurrency` | 7 casos: que las condiciones de carrera sigan cerradas |
| `npm run test:all` | Las cuatro baterías, en orden |
| `npm --prefix frontend run lint` | ESLint del frontend |
| `npm run build` | Compilación del frontend |

Las cuatro baterías necesitan el backend en marcha y avisan si no lo encuentran.

> **Al repetir `test:auth`:** el limitador de fuerza bruta vive en la memoria del
> proceso, y la última comprobación de esa batería lo deja agotado. Ejecutarla
> dos veces en menos de 15 minutos devuelve 429 en todos los inicios de sesión y
> **parece una regresión grave sin serlo**. Hay que reiniciar el backend entre
> tandas; el script lo detecta y avisa.

---

## Mantenimiento de la base de datos

```bash
node backend/scripts/optimize_database.js              # informa
node backend/scripts/optimize_database.js --apply      # aplica

node backend/scripts/hash_existing_passwords.js         # informa
node backend/scripts/hash_existing_passwords.js --apply # aplica
```

El primero crea los índices que faltan, sincroniza las secuencias y repara las
claves primarias que perdieron su valor por defecto. El segundo convierte a
bcrypt las contraseñas que aún estén en texto plano. **Ambos simulan por
defecto** y solo escriben con `--apply`.

---

## Metodología de desarrollo

GradoHub se construyó con un **proceso incremental e iterativo organizado por
módulos funcionales**. No se siguió un marco formal con ceremonias y sprints
—declararlo sería inexacto—, sino un ciclo repetido por módulo: modelo de datos,
endpoints, pantalla, y solo entonces el módulo siguiente.

**La evidencia está en el historial de Git**, no en esta afirmación. A 11 de
septiembre de 2026: 46 commits entre el 8 de agosto y el 11 de septiembre,
repartidos entre las tres personas que integran el equipo. Los mensajes agrupan el
trabajo **por módulo y no por capa técnica** —«panel docente», «banco de
proyectos», «Administrador General», «cambios reportes», «restricciones al
Chatbook»—, que es precisamente la huella que deja un desarrollo incremental por
funcionalidad completa.

```bash
git log --format="%ad  %an  %s" --date=short   # el historial completo
git shortlog -sn                               # commits por integrante
```

### Cómo se trabajó después de las auditorías

Las tres auditorías de septiembre de 2026 (`docs/auditorias/`) abrieron una segunda
etapa con una regla distinta, tomada del patrón de **estrangulamiento
progresivo**: añadir lo nuevo sin borrar lo viejo, migrar un módulo por vez y
verificar antes de continuar. Es lo que permitió introducir la autenticación con
JWT y el sistema de diseño sin dejar la aplicación inutilizable en ningún
momento, y lo que hace que cualquier paso sea reversible con un `git revert`.

De ahí sale una práctica que atraviesa todo el repositorio: **comprobar antes de
afirmar**. Antes de retirar el backend monolítico se compararon sus 52 endpoints
con los 56 del código vivo para demostrar que no se perdía ninguno; antes de
conservar el pipeline del reglamento se regeneró su salida y se verificó que
coincidía byte por byte con el archivo en uso. Las decisiones de este tipo y su
justificación están en [docs/BITACORA-TECNICA.md](docs/BITACORA-TECNICA.md).

### Verificación

La corrección del sistema se comprueba con baterías ejecutables, no con
inspección manual: Chatbook (88 casos), autenticación (44), manejo de errores
(17) y concurrencia (7). Ver la sección **Pruebas**.

---

## Documentación

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitectura y estructura real
- [docs/MODELO-DATOS.md](docs/MODELO-DATOS.md) — diagrama entidad-relación, generado desde la base de datos
- [docs/CHATBOOK.md](docs/CHATBOOK.md) — el asistente, sus requisitos y sus límites
- [docs/BITACORA-TECNICA.md](docs/BITACORA-TECNICA.md) — por qué el sistema está hecho así
- [docs/METODOLOGIA-DESARROLLO.md](docs/METODOLOGIA-DESARROLLO.md) — metodología redactada para el documento de grado
- [docs/auditorias/](docs/auditorias/) — las tres auditorías de septiembre de 2026
  (seguridad, arquitectura del backend, frontend y diseño) con su plan de
  remediación. **Cada una abre con una tabla de estado** que dice qué de lo que
  denuncia está cerrado y qué sigue abierto: describen el código del 10 de
  septiembre, no el sistema actual
