# Metodología de desarrollo — texto para el documento de grado

> **Cómo usar este archivo.** Lo que sigue está redactado para insertarse en el
> capítulo **III METODOLOGÍA** del documento, después de **DISEÑO DE
> INVESTIGACIÓN** y antes de **POBLACIÓN**. Respeta el estilo del documento:
> títulos en mayúsculas, afirmación respaldada por autor citado en formato IEEE
> numerado. Las referencias nuevas continúan la numeración existente, que llega
> a [56].
>
> **Verifica los datos bibliográficos** de [57]–[59] contra las ediciones a las
> que tengas acceso en la biblioteca antes de entregar.

---

## METODOLOGÍA DE DESARROLLO DE SOFTWARE

El desarrollo de la plataforma GradoHub se llevó a cabo siguiendo el **modelo
incremental**. Según Pressman [57], el modelo incremental combina elementos de
los flujos de proceso lineal y paralelo, entregando el software en una serie de
incrementos donde cada uno constituye un producto operativo: el primer
incremento suele ser un producto fundamental que cubre los requisitos básicos, y
los incrementos posteriores agregan funcionalidad hasta completar el sistema.

Esta metodología se eligió por tres razones directamente relacionadas con las
condiciones reales del proyecto. En primer lugar, el equipo de desarrollo estuvo
conformado por tres estudiantes que debían compatibilizar el trabajo con su
carga académica, de modo que un modelo que exige la especificación completa de
requisitos antes de escribir código —como el modelo en cascada— no era viable.
En segundo lugar, el sistema se compone de módulos funcionales claramente
delimitados —gestión de proyectos, panel docente, historial de trazabilidad,
banco de proyectos, reportes y administración general—, cada uno con valor de
uso independiente, lo que permite entregarlos y validarlos por separado. En
tercer lugar, el diseño cuasiexperimental de esta investigación requiere que la
plataforma se encuentre operativa para la medición posterior, y el modelo
incremental garantiza que exista **un producto funcional desde el primer
incremento**, reduciendo el riesgo de llegar a la fase de medición sin un
sistema utilizable.

Cada incremento siguió el mismo ciclo interno: análisis del requisito, diseño
del modelo de datos correspondiente, implementación de los servicios en el
servidor, construcción de la interfaz de usuario y verificación funcional. Un
incremento no se daba por cerrado hasta que el módulo era utilizable de extremo
a extremo por el rol al que estaba destinado.

**Evidencia del proceso.** La aplicación del modelo incremental es verificable
en el historial de control de versiones del proyecto, alojado en un repositorio
Git: 46 confirmaciones (*commits*) realizadas entre el 8 de agosto y el 11 de
septiembre de 2026 por las tres personas integrantes del equipo. Los mensajes de dichas
confirmaciones agrupan el trabajo **por módulo funcional y no por capa
técnica**, que es la huella característica de un desarrollo incremental por
funcionalidad completa. Este historial puede consultarse con las órdenes
`git log` y `git shortlog -sn` sobre el repositorio del proyecto.

---

## FASES DEL DESARROLLO

El desarrollo se organizó en seis incrementos, delimitados a partir del
historial de control de versiones:

| Nº | Periodo (2026) | Incremento | Resultado entregado | Commits |
|:--:|---|---|---|:--:|
| 0 | 8 – 18 ago | Configuración del entorno | Estructura inicial del proyecto, dependencias y conexión con la base de datos PostgreSQL | 6 |
| 1 | 19 – 21 ago | Núcleo de gestión y reportes | Migración a la base de datos `BaseDatosGrado`, módulo de reportes, identidad visual institucional y aislamiento estricto de la información por programa académico | 7 |
| 2 | 22 – 24 ago | Panel docente y asistente normativo | Panel del rol Docente y restricciones de visualización del Chatbook según el perfil del usuario | 10 |
| 3 | 25 – 28 ago | Trazabilidad | Historial de cambios por usuario, registro del autor de cada modificación, gestión de la opción de grado y aislamiento de líneas y sublíneas de investigación | 7 |
| 4 | 4 – 8 sep | Banco de proyectos | Módulo de banco de proyectos con trazabilidad y orquestador del Chatbook con consulta del reglamento institucional | 4 |
| 5 | 9 – 11 sep | Administración general | Rol Administrador General del Sistema, filtro global por programa académico y **separación de la aplicación monolítica en dos aplicaciones autónomas** (`backend/` y `frontend/`) | 12 |

La reestructuración arquitectónica del incremento 5 merece mención aparte: hasta
ese punto la lógica del servidor residía en un único archivo. Su división en una
interfaz de usuario y una interfaz de programación de aplicaciones (API)
independientes, comunicadas exclusivamente por HTTP, responde al supuesto
teórico de **modularidad y acoplamiento flexible** declarado en el marco teórico
de esta investigación.

### Etapa de verificación y refactorización

Concluidos los seis incrementos se realizó una **auditoría técnica del sistema**
—de arquitectura del servidor, de interfaz y diseño, y de seguridad— cuyos
hallazgos dieron lugar a una etapa posterior de corrección. Esta etapa se
condujo aplicando el patrón de **estrangulamiento progresivo** descrito por
Fowler [58]: incorporar el componente nuevo junto al existente, migrar un módulo
por vez y verificar antes de continuar, de manera que el sistema permanezca
operativo durante toda la transformación y cada paso sea reversible.

Durante esta etapa se incorporaron la autenticación mediante JSON Web Tokens con
cifrado de contraseñas por *bcrypt*, un sistema de componentes de interfaz
reutilizables y un manejo centralizado de errores. La corrección del sistema se
verifica mediante baterías de pruebas ejecutables que comprueban la
autenticación (44 casos), el asistente normativo (88 casos), el manejo de
errores (17 casos) y las condiciones de carrera en la base de datos (7 casos).

---

## RECURSOS DE LA INVESTIGACIÓN (párrafo corregido)

> **Motivo de la corrección:** el párrafo actual enumera «PostgreSQL y pgAdmin,
> HTML, CSS3, JavaScript y Visual Studio Code», tecnologías que no corresponden
> a las realmente empleadas. Un jurado que abra el repositorio encontrará React,
> Vite y Express. Se sugiere sustituirlo por el siguiente texto.

Para crear la plataforma digital de analítica académica en la Universidad
CESMAG en los programas mencionados, será necesario contar con varios recursos
que ayuden a alcanzar las metas establecidas. Estos recursos comprenden personal
especializado en ingeniería de sistemas, equipos tecnológicos para pruebas y
desarrollo, entornos de trabajo colaborativos y software de soporte. En el
almacenamiento de datos se emplea el sistema gestor de bases de datos
**PostgreSQL**, administrado mediante **pgAdmin**. La interfaz de usuario se
construyó con la biblioteca **React** sobre el empaquetador **Vite**, empleando
**JavaScript**, **HTML** y **CSS3**. La interfaz de programación de aplicaciones
se desarrolló con **Express** sobre el entorno de ejecución **Node.js**. El
control de versiones y el trabajo colaborativo se gestionaron con **Git** y
**GitHub**, y la edición de código con **Visual Studio Code** [56].

---

## REFERENCIAS NUEVAS

Continúan la numeración del documento, que llega a [56]:

```
[57]  R. S. Pressman, Ingeniería del software: un enfoque práctico, 7ª ed.
      México D. F., México: McGraw-Hill, 2010.

[58]  M. Fowler, "Strangler Fig Application", martinfowler.com, 29 jun. 2004.
      [En línea]. Disponible en:
      https://martinfowler.com/bliki/StranglerFigApplication.html

[59]  I. Sommerville, Ingeniería de software, 9ª ed. México: Pearson
      Educación, 2011.
```

> [59] solo es necesaria si decides ampliar la justificación del modelo
> incremental con una segunda fuente. Si no la citas en el cuerpo del texto,
> retírala: una referencia que no se cita en el cuerpo es un error de forma.

---

## LO QUE ESTE TEXTO NO CUBRE

Para que no te sorprenda en la sustentación, esto queda fuera a propósito:

1. **No declara Scrum ni ningún marco ágil formal.** No hubo *sprints* de
   duración fija, *product backlog*, actas ni retrospectivas, y el jurado puede
   pedir esos artefactos. Declarar el modelo incremental es defendible porque
   todo lo que afirma se comprueba en el historial.
2. **El rol «Secretario»** aparece en los requisitos del documento pero no está
   implementado. Hay que implementarlo o retirarlo de los requisitos; un
   requisito documentado y ausente es una pregunta incómoda garantizada.
3. **La validación con usuarios** que promete la metodología de investigación
   (encuesta inicial, final y de satisfacción) aún no tiene informe de
   resultados en el repositorio.
