# El Chatbook

Asistente de consulta institucional de GradoHub · Universidad CESMAG

---

## 1. Qué es y qué no es

El Chatbook es un **sistema experto basado en reglas**. Reconoce la pregunta con
expresiones regulares sobre el texto normalizado, la clasifica en una categoría y
ejecuta la consulta SQL o la búsqueda en el reglamento que corresponde a esa
categoría y a quien pregunta.

**No usa inteligencia artificial.** No hay modelo de lenguaje, ni llamada a
ningún servicio externo, ni entrenamiento, ni aprendizaje: no existe ninguna
dependencia de ese tipo en el proyecto, y puede comprobarse leyendo
`backend/package.json`. Todo lo que responde sale de la base de datos de la
universidad o del texto del Acuerdo 105, que está versionado en el repositorio.

Decirlo así no le resta mérito, y evita una pregunta incómoda en la sustentación.
Un sistema experto es una categoría reconocida de la ingeniería del software, y
para este problema tiene tres ventajas sobre un modelo de lenguaje que importan
más que la conversación fluida:

| | Sistema experto (lo que hay) | Modelo de lenguaje |
|---|---|---|
| **Respuestas** | Deterministas: la misma pregunta da siempre lo mismo | Variables entre ejecuciones |
| **Invención** | Imposible: solo puede citar lo que hay en la base o en el reglamento | Puede inventar artículos que no existen |
| **Datos personales** | No salen del servidor de la universidad | Viajarían a un tercero |
| **Coste** | Ninguno | Por consulta |
| **Auditoría** | Se puede señalar la regla exacta que respondió | Opaco |

Para un sistema que cita normativa académica y maneja datos de estudiantes
reales, que no pueda inventarse un artículo del reglamento no es una limitación:
es el requisito.

---

## 2. Cómo funciona

```
  Pregunta del usuario
        │
        ▼
  Normalización          minúsculas, sin tildes, sin signos
        │
        ▼
  classifyChatbookQuery()      chatbook/chatbook_orchestrator.js
        │
        ├── SECURITY    intento de inyección SQL → se rechaza sin ejecutar nada
        ├── REGULATION  pregunta normativa → búsqueda en el Acuerdo 105
        ├── DATA        pregunta por datos → consulta a la base de datos
        └── BOTH        «¿mi proyecto cumple para sustentar?» → combina las dos
        │
        ▼
  Módulo de intenciones según el rol       chatbook/intents/
        ├── admin.js        ve todos los programas
        ├── teacher.js      ve lo suyo y lo de su programa
        └── student.js      ve solo su propio proceso
        │
        ▼
  Respuesta con sus datos y, si aplica, capítulo y artículo citados
```

**El rol decide qué se puede preguntar.** La identidad sale del token de sesión,
no del cuerpo del mensaje, así que nadie puede consultar la información de otra
persona escribiendo su identificador. Un estudiante que pregunta por «los
proyectos» ve los suyos; un administrador ve los de la universidad.

---

## 3. Dónde vive cada cosa

| Archivo | Responsabilidad |
|---|---|
| `controllers/chatbook.controller.js` | Recibe la petición, resuelve el contexto de quien pregunta y delega |
| `chatbook/chatbook_orchestrator.js` | Clasifica la pregunta y reparte |
| `chatbook/chatbook_helpers.js` | Normalización de texto y utilidades compartidas |
| `chatbook/intents/admin.js` | Intenciones del perfil administrativo |
| `chatbook/intents/teacher.js` | Intenciones del perfil docente |
| `chatbook/intents/student.js` | Intenciones del perfil estudiante |
| `chatbook/regulation/regulation_data.js` | Texto del Acuerdo 105, estructurado por capítulo y artículo |
| `chatbook/regulation/regulation_search.js` | Búsqueda por palabras clave dentro del reglamento |
| `services/chatbook_degree_options.js` | Estadísticas de opciones de grado |
| `components/chatbook/Chatbook.jsx` | Widget de la interfaz |

---

## 4. Requisitos funcionales

El Chatbook no figuraba en el documento de requisitos del proyecto pese a estar
implementado y en uso. Estos son los requisitos que cubre, redactados a partir
del comportamiento real del código:

| ID | Requisito |
|---|---|
| **RF-CB-01** | El sistema debe responder consultas en lenguaje natural sobre el Reglamento de Trabajo de Grado (Acuerdo 105), citando el capítulo y el artículo de los que toma la respuesta. |
| **RF-CB-02** | El sistema debe responder consultas sobre los datos académicos registrados —proyectos, estados, asesores, modalidades, avances— sin que el usuario tenga que conocer la estructura de la base de datos. |
| **RF-CB-03** | El sistema debe limitar lo que cada usuario puede consultar según su rol: el estudiante solo su propio proceso; el docente lo relacionado con su programa; el administrador la información institucional. |
| **RF-CB-04** | El sistema debe combinar normativa y datos cuando la pregunta lo requiera, por ejemplo al comprobar si un proyecto cumple los requisitos para sustentar. |
| **RF-CB-05** | El sistema debe rechazar, sin ejecutarlas, las consultas que contengan instrucciones de manipulación de la base de datos, e informar de que solo atiende consultas informativas. |
| **RF-CB-06** | El sistema debe responder que no dispone de la información cuando la pregunta no corresponda a ninguna categoría reconocida, en lugar de dar una respuesta aproximada. |

**RNF asociado:** las respuestas deben ser deterministas y trazables a su fuente
—una fila de la base de datos o un artículo del reglamento—, sin generación de
contenido.

---

## 5. Cómo se comprueba

```bash
npm run backend          # en una terminal
npm run test:chatbook    # en otra
```

Lanza 88 preguntas reales —24 de administrador, 19 de docente, 24 de estudiante,
5 normativas y 2 intentos de inyección SQL— con los tres perfiles, y clasifica
cada respuesta en «con datos», «genérica», «vacía» o «error». Admite
`--rol=estudiante|docente|admin` y `--verbose`.

El resultado esperado es **88 con datos, 0 errores**. Las dos preguntas de
inyección deben ser interceptadas por la categoría SECURITY.

---

## 6. Límites conocidos

Conviene poder enunciarlos antes de que los pregunten:

- **Solo entiende lo que alguien previó.** Una pregunta formulada de una forma no
  contemplada cae en la respuesta genérica. Ampliar la cobertura es añadir
  patrones, no reentrenar nada.
- **No mantiene el hilo de la conversación.** Cada pregunta se responde por sí
  sola; no hay memoria entre mensajes.
- **Depende del texto del reglamento versionado.** Si la universidad modifica el
  Acuerdo 105, hay que actualizar `regulation_data.js`; el sistema no se entera
  solo.
- **Los patrones se escribieron para español.** No atiende consultas en otros
  idiomas.
