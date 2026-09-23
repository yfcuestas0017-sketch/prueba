# Auditoría de Frontend, Sistema de Diseño y Responsividad
### GradoHub · Universidad CESMAG

> ## Estado de este informe — 15 de septiembre de 2026
>
> **Lo que sigue describe el código del 10 de septiembre de 2026, no el sistema
> actual.** El informe se conserva como justificación de la remediación que
> provocó y porque cada cifra suya fue contada sobre el código, lo que permite
> comparar el antes y el después.
>
> ### Cerrado
>
> | Hallazgo del informe | Cómo se cerró |
> |---|---|
> | ESLint no arrancaba en `frontend/` | Reparado. Al ejecutarlo apareció un `no-undef` real: el selector de programa de `GestionDocente` llamaba a una función inexistente y **lanzaba un error cada vez que se cambiaba** |
> | Sistema de diseño existente pero casi sin usar | Componentes `Button`, `Card`, `FormField`, `Modal`, `Badge` y `Alert` con punto único de importación en `components/ui/index.js` |
> | 69 de 80 etiquetas de formulario sin asociar a su campo | **81 de 81 asociadas.** `FormField` genera el identificador con `useId` y se lo entrega al campo, de modo que no se puede olvidar |
> | Diálogos nativos `alert()` y `confirm()` | **Ninguno queda en la aplicación.** `Modal` atrapa el foco, cierra con Escape y devuelve el foco al abridor |
> | Sin una sola región `aria-live` en todo el proyecto | Añadidas en avisos, contador de notificaciones y conversación del Chatbook |
> | Contrastes por debajo del mínimo AA | Corregidos con el cálculo hecho, no estimado: `--text-muted` de 3,61:1 a 5,34:1, entre otros |
> | Pantallas que no respondían al cambio de tema | Reportes y el Chatbook incorporados al sistema de temas; los 86 colores fijos del Chatbook agrupados en 18 variables por papel |
> | Arranque de 1,76 MB | **231 kB.** Carga diferida por ruta: quien no abre Reportes no descarga sus 832 kB de jsPDF, docx y html2canvas |
> | `AdminGeneralPage`, que el informe dejaba para el final | Migrada el 15 de septiembre: **28 estilos en línea → 0, 25 botones crudos → 1, 7 modales caseros → 0**, y 135 líneas de CSS huérfano retiradas |
>
> ### Sigue abierto
>
> - **Unificar los 15 puntos de corte a cuatro.** Hay colisiones en 6 archivos.
>   Fundirlos cambia el comportamiento en anchos intermedios y **no se puede
>   validar sin ver la pantalla**: requiere revisión visual, no es mecánico.
> - **Completar los temas ocean, forest, crimson y violet**, que hoy solo cambian
>   barra lateral y acentos. Es decisión de diseño, no un defecto.
> - **`Escudos.png` pesa 362 KB y mide 1201×1201 px, pero se muestra entre 40 y
>   160 px.** Sin optimizar: en esta máquina no hay `sharp`, ni `jimp`, ni
>   ImageMagick.
> - Las variables locales sin usar que reporta ESLint. Ojo: **15 de ellas son
>   manejadores muertos de `AdminGeneralPage`**, porque las pestañas Usuarios,
>   Roles, Permisos, Programas y Auditoría ya no se renderizan. Antes de
>   borrarlas hay que decidir si esas pestañas vuelven.

| | |
|---|---|
| **Alcance** | `frontend/src/**` y `frontend/public/**` — 23 archivos CSS (8.482 líneas), 45 archivos JS/JSX (10.557 líneas) |
| **Stack** | React 18.3 + Vite 8 + React Router 6 · CSS manual con variables nativas |
| **Fecha** | 10 de septiembre de 2026 |
| **Excluido** | `node_modules/` · `dist/` (solo inspeccionado para medir el peso del build) |
| **Método** | Análisis estático verificado. Cada cifra de este informe fue contada directamente sobre el código. |

---

## 1. Resumen ejecutivo

**El proyecto tiene un sistema de diseño bien concebido que casi nadie usa.**

`src/styles/globals.css` define un catálogo completo y profesional de design tokens: paleta institucional UCESMAG, seis temas conmutables, escala de radios, sombras calculadas sobre el azul de marca y dos familias tipográficas IBM Plex con fallbacks correctos. Existen además componentes compartidos en `src/components/ui/` — `Button`, `Card`, `CardHeader`, `StatCard` — bien construidos, con variantes, estados y hasta un `min-height: 44px` para objetivos táctiles.

El problema es de adopción, y las cifras son contundentes:

| Métrica verificada | Valor |
|---|---:|
| Botones `<button>` crudos frente a usos del componente `<Button>` | **104 vs 34** (75% fuera del sistema) |
| Archivos que importan el componente `Card` | **1 de más de 40** |
| Clases CSS distintas terminadas en `-card` | **31** |
| Familias independientes de campo de texto | **7** (alturas entre 33px y 41px) |
| Implementaciones de modal distintas | **5** (z-index de 200 a 9999) |
| Valores distintos de `font-size` | **55** |
| Colores hexadecimales hardcodeados en CSS | **381** |
| Estilos inline `style={{...}}` en JSX | **179** |
| `<label>` en formularios / de ellos con `htmlFor` | **80 / 11** (86% sin asociar) |
| Regiones `aria-live` en todo el proyecto | **0** |
| Reglas `prefers-reduced-motion` | **0** |
| Rutas con `React.lazy` (code splitting) | **0** |

De las 8.482 líneas de CSS, `globals.css` aporta solo el 13%. El otro 87% son hojas por página, y tres de ellas —`ProyectosPage.css` (1.095), `ReportesPage.css` (960), `BancoProyectos.css` (938)— son casi tan grandes como el archivo global completo. **El sistema de diseño no está centralizado: está reimplementado once veces.**

### Veredicto sobre lo que preguntaste

| Pregunta | Veredicto |
|---|---|
| ¿Se usan fuentes globales? | ✅ **Sí, y bien.** Una sola familia (IBM Plex Sans/Serif) vía tokens, con fallbacks correctos, en todo el proyecto. Es el aspecto más consistente del sistema. |
| ¿Se usan estilos y diseños globales? | ⚠️ **Parcialmente.** Los tokens existen y son buenos, pero 381 colores hardcodeados los esquivan. Dos módulos (`Reportes` y `Chatbook`) están completamente fuera del sistema de temas. |
| ¿Se usan componentes globales? | ❌ **No.** Existen pero están abandonados: 75% de los botones y 97% de las tarjetas no los usan. No existen componentes de input ni de modal. |
| ¿Botones, cards, KPIs y campos consistentes? | ❌ **No.** 6 familias de botón, 31 clases de tarjeta, 6 de KPI, 7 de campo de texto. Un campo de texto mide distinto según en qué página estés. |
| ¿Estructura 100% responsiva y multiplataforma? | ⚠️ **Casi.** 9 de 11 módulos sobreviven bien a 375px. Falla `AdminGeneralPage` (**cero media queries**) y `ReportesPage` tiene riesgo medio (tablas sin colapso). El Sidebar móvil tipo drawer está muy bien resuelto. |
| ¿Tamaños profesionales de plataforma universitaria? | ⚠️ **Inconsistentes.** 55 tamaños de fuente sin escala modular: conviven `0.85rem`, `0.86rem` y `0.88rem` para el mismo propósito en archivos distintos. |

### Lo que sí está bien hecho

Conviene decirlo con claridad porque es defendible ante un jurado:

- **Tipografía institucional impecable.** Una familia, cargada una vez, con fallbacks y `display=swap`.
- **Seis temas conmutables en runtime** mediante `[data-theme]` — es más de lo que tiene la mayoría del software universitario.
- **El drawer móvil del Sidebar** (`transform: translateX(-100%)` + backdrop clicable + bloqueo de scroll del body) está resuelto como se debe.
- **Uso de `100dvh`** en `DashboardLayout.css:3` y `Sidebar.css:16` en lugar de `100vh` — evita el bug clásico de la barra de direcciones en móvil. Es un detalle de alguien que conoce el problema.
- **`ReportesPage.jsx` tiene 10 de 10 etiquetas correctamente asociadas** con `htmlFor`. Demuestra que el equipo sabe hacerlo bien; el problema es de consistencia, no de conocimiento.
- **`Chatbook.jsx` es el componente mejor etiquetado en ARIA** de toda la aplicación (`role="tablist"`, `aria-selected`, 6 `aria-label`).

---

## 2. El sistema de diseño existente

### 2.1 Design tokens — `src/styles/globals.css:8-71`

El catálogo es completo y está bien pensado:

```css
/* Identidad institucional */
--inst-blue-1: #1F5BA3   --inst-blue-2: #2C3967
--inst-red-1:  #BA1828   --inst-red-2:  #E00F38

/* Superficies */
--bg-primary: #f2f5f9    --bg-secondary: #ffffff
--bg-card: #ffffff       --bg-header: rgba(255,255,255,.90)

/* Texto */
--text-primary: #182238  --text-secondary: #4a5773
--text-muted: #7987a5    --text-inverse: #ffffff

/* Acentos semánticos */
--accent-primary: #1F5BA3      --accent-primary-hover: #2C3967
--accent-secondary: #BA1828    --accent-danger: #E00F38
--accent-success: #10b981      --accent-info: #1F5BA3

/* Forma */
--border-color: #dbe3ee
--border-radius-sm: 8px  -md: 12px  -lg: 16px  -xl: 24px
--shadow-sm / --shadow-md / --shadow-lg

/* Tipografía */
--font-display: 'IBM Plex Serif', Georgia, serif
--font-body: 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif

/* Movimiento */
--transition-fast: .15s  --transition-base: .25s  --transition-slow: .4s
```

**Lo que falta en el catálogo:** no hay tokens de **espaciado** ni de **escala tipográfica** ni de **breakpoints** ni de **z-index**. Esas cuatro ausencias explican directamente cuatro de los problemas de este informe (padding ad hoc, 55 tamaños de fuente, 15 breakpoints distintos y z-index de 200 a 9999).

### 2.2 Los seis temas — y por qué cuatro están incompletos

`globals.css:73-158` define `default`, `dark`, `ocean`, `forest`, `crimson` y `violet`. Solo `dark` redefine superficies y texto. **`ocean`, `forest`, `crimson` y `violet` solo cambian las variables del sidebar y los dos acentos**, dejando `--bg-*` y `--text-*` del tema claro. En la práctica, esos cuatro temas cambian el color de la barra lateral y poco más.

### 2.3 Dos variables usadas pero nunca definidas 🐛

Verificado: ninguna de las dos existe en ningún `:root` del proyecto.

| Variable | Usada en | Consecuencia |
|---|---|---|
| `--accent-hover` | `AdminGeneralPage.css:222` | El hover del botón primario de Admin General usa siempre el hex fijo `#184882`, sin importar el tema |
| `--border-subtle` | `ProyectosPage.css:269` | Cae siempre al fallback `#e2e8f0` |

Son bugs silenciosos: funcionan por el mecanismo de fallback de `var()`, así que nadie los nota, pero rompen el sistema de temas en esos dos puntos.

### 2.4 `globals.css` no es solo global

De sus 1.102 líneas, **759 (el 69%) son estilos de componentes concretos**: `.ax-*` de analítica, `.banco-analytics`/`.ba-*`, `.dashboard-hero*`, `.quick-card*`. Esto significa que tocar el Dashboard obliga a editar el archivo global, y que el archivo que debería ser la fuente de verdad del sistema es en realidad un cajón mixto.

---

## 3. Consistencia de componentes — el hallazgo central

### 3.1 Tabla resumen

| Elemento | ¿Componente global? | ¿Se usa? | Variantes | Severidad |
|---|---|---|---:|:---:|
| **Cards** | Sí (`ui/Card/Card.jsx`) | **1 archivo de 40+** | 31 clases `-card` | 🔴 Crítica |
| **Botones** | Sí (`ui/Button.jsx`) | 34 de 138 (25%) | 6 familias | 🟠 Alta |
| **KPIs** | Sí (`ui/Card/StatCard.jsx`) | Solo en analítica | 6 familias | 🟠 Alta |
| **Campos de texto** | **No existe** | — | 7 familias (33–41px) | 🟠 Alta |
| **Modales** | **No existe** | — | 5, z-index 200–9999 | 🟠 Alta |
| **Tablas** | **No existe** | — | 5 (solo 1 responsive real) | 🟡 Media-Alta |
| **Badges de estado** | **No existe** | — | 7 familias, 2 verdes distintos | 🟡 Media |
| **Alertas éxito/error** | **No existe** | — | 5 familias, 1 no themable | 🟡 Media |
| **Spinners** | Parcial | — | 3 `@keyframes spin` homónimos | 🔵 Baja |

### 3.2 Botones — 104 crudos contra 34 del sistema

`ui/Button.jsx` define variantes `primary/secondary/outline/ghost/danger`, tamaños `sm/md/lg`, estados hover y disabled, spinner de carga y `min-height: 44px` para táctil (`Button.css:99-103`). Es el único componente del proyecto que se ocupa de los objetivos táctiles.

Archivos que **no lo importan en absoluto** y reimplementan botones propios:

| Archivo | `<button>` crudos | Su propia familia de clases |
|---|---:|---|
| `AdminGeneralPage.jsx` | **40** | `.ag-btn-primary` / `.ag-btn-secondary` |
| `ReportesPage.jsx` | 11 | `.btn-export-pdf` / `.btn-export-docx` / `.link-btn` / `.chip-btn` |
| `Chatbook.jsx` | 7 | `.chatbook-icon-btn` / `.chatbook-category-tab` / `.chatbook-question-chip` |
| `EditProjectModal.jsx` | 6 | `.epm-btn-primary` / `.epm-btn-ghost` |
| `CrearProyecto.jsx` | 5 | (las mismas `.epm-*`, duplicadas) |
| `Header.jsx` / `Sidebar.jsx` / `ThemePanel.jsx` | 4 / 3 / 3 | `.header-btn` / `.sidebar-toggle` / `.theme-panel-close` |

Comparativa de los cuatro botones "primarios" que conviven en la aplicación:

| Clase | Padding | Tamaño | Radio | Hover |
|---|---|---|---|---|
| `.btn--md` (`Button.css:22`) | `10px 20px` | `0.875rem` | token `sm` | gradiente + `translateY(-1px)` |
| `.ag-btn-primary` (`AdminGeneralPage.css:206`) | `0.55rem 1.1rem` | `0.85rem` | `8px` fijo | color plano, **variable rota** |
| `.epm-btn-primary` (`EditProjectModal.css:197` **y** `:442`) | `9px 18px` | `0.84rem` | token `sm` | dos definiciones que se pisan |
| `.btn-export-pdf` (`ReportesPage.css:352`) | `10px 18px` | `0.88rem` | `10px` fijo | gradiente propio distinto |

Cuatro botones que hacen lo mismo con cuatro alturas, cuatro tamaños de letra y tres radios diferentes. **Ninguno fuera de `Button.css` define `:focus-visible`.**

### 3.3 Cards — 31 reimplementaciones de una tarjeta

`ui/Card/Card.jsx` está construido 100% sobre tokens (22 líneas, impecable). Lo importa **un solo archivo de todo el proyecto**: `components/analytics/AnalyticsDashboard.jsx` — y ni siquiera importa `Card`, solo `StatCard`.

Las 31 clases `-card` que lo sustituyen: `.academic-admin-card`, `.ag-card`, `.ag-stat-card`, `.ax-chart-card`, `.ax-indicator-card`, `.ba-filters-card`, `.ba-indicator-card`, `.ba-summary-card`, `.banco-card`, `.banco-filters-card`, `.banco-history-card`, `.chatbook-detail-card`, `.chatbook-stat-card`, `.chatbook-teacher-card`, `.detail-card`, `.dp-stat-card`, `.epm-panel-card`, `.filters-card`, `.form-card`, `.gd-card`, `.gd-meta-card`, `.meta-card`, `.quick-card`, `.reportes-dossier-card`, `.reportes-filters-card`, `.reportes-preview-card`, `.reportes-select-card`, `.select-card`, `.settings-card`…

Y no son equivalentes: `.card` usa tokens; `.ag-card` hardcodea `border-radius:12px`; `.dossier-section` usa `background:#f8fafc`, un gris que no existe en la paleta; `.chatbook-*-card` no usa ni una sola variable.

### 3.4 Campos de texto — la inconsistencia más visible para el usuario

**No existe `Input.jsx` ni `Select.jsx`.** Hay 7 familias reimplementando el mismo patrón:

| Familia | Ubicación | Altura | Foco |
|---|---|---:|---|
| `.field-input` | `Login.css:180` | ~41px | `color-mix` sobre token ✅ |
| `.field-input` | `GestionDocente` / `BancoAnalytics` / `Ajustes` / `ProyectosPage` | ~39px | `color-mix` ✅ — **pero son 4 copias del mismo CSS** |
| `.epm-field input` | `CrearProyecto.css:131` + `EditProjectModal.css:151` | ~35px | `box-shadow` propio |
| `.ag-form-input` | `AdminGeneralPage.css:375` | ~34px | **solo borde, sin glow** ⚠️ |
| `.banco-input` | `BancoProyectos.css:219` | 40px fijo | `box-shadow` propio |
| `.filter-group input` | `ReportesPage.css:275` | ~33px | `rgba()` fijo ❌ no cambia con el tema |
| `.chatbook-input-row input` | `Chatbook.css:517` | ~38px | color fijo ❌ no cambia con el tema |

**Un campo de texto mide entre 33px y 41px según la página en la que estés.** Para una plataforma institucional, esa variación de 8px es perceptible al navegar entre módulos.

🐛 **Bug de accesibilidad concreto:** `AdminGeneralPage.css:197-204` aplica `outline: none` al buscador `.ag-search-box input` **sin ningún reemplazo** — no hay regla `:focus` ni `:focus-within`. Un usuario que navegue con teclado **no ve dónde está el foco** al tabular hasta ese campo.

### 3.5 Modales — cinco sistemas y una escala de z-index inventada

| Clase | Archivo | z-index |
|---|---|---:|
| `.gd-modal-overlay` | `GestionDocente.css:27` | 200 |
| `.modal-backdrop` | `ProyectosPage.css:717` | 200 |
| `.epm-backdrop` | `CrearProyecto.css:1` + `EditProjectModal.css:1` | 300 |
| `.ag-modal-overlay` | `AdminGeneralPage.css:313` | 1.000 |
| `.banco-modal-overlay` | `BancoProyectos.css:486` | **9.999** |

Ninguno usa `<dialog>` nativo, ninguno atrapa el foco (hay **1 solo `tabIndex` en todo el proyecto**) y ninguno devuelve el foco al cerrarse. El de z-index 9.999 ganará siempre a cualquier otro, incluidas las notificaciones del Header.

### 3.6 Duplicación de CSS medida

- **~300 líneas** casi idénticas entre `CrearProyecto.css` y `EditProjectModal.css` (ambos usan el prefijo `.epm-*`).
- **~40 líneas duplicadas dentro del propio `EditProjectModal.css`**: `.epm-btn-primary`, `.epm-btn-ghost` y `.epm-form-actions` están declaradas dos veces (líneas 189-228 y 432-483) con valores distintos. Por cascada gana la segunda; la primera es código muerto.
- **73 líneas idénticas** entre `features/proyectos/PageComing.css` y `features/usuarios/PageComing.css` — el mismo componente copiado en dos carpetas.
- **3 `@keyframes spin`** con el mismo nombre en hojas distintas (`Button.css`, `globals.css`, `ReportesPage.css`), más `epmSpin` duplicado en los dos CSS de modal.

---

## 4. Tokens contra valores hardcodeados

**381 colores hexadecimales** en el CSS. Descontando los 73 legítimos de `globals.css` (que define los tokens y los temas), quedan **308 fugas del sistema**:

| Archivo | Hex hardcodeados |
|---|---:|
| `ReportesPage.css` | **116** |
| `Chatbook.css` | **86** |
| `Sidebar.css` | 16 |
| `ProyectosPage.css` | 13 |
| `EditProjectModal.css` | 12 |
| `BancoProyectos.css` | 11 |
| `GestionDocente.css` | 10 |

Muchos coinciden **exactamente** con un token que ya existe: `#dbe3ee` (21 veces) es `--border-color`; `#7987a5` (12) es `--text-muted`; `#4a5773` (11) es `--text-secondary`. Están escritos a mano en vez de usar la variable.

### 🔴 El caso más grave: Reportes no reacciona a ningún tema

Verificado: `ReportesPage.css` usa `var(--inst-blue-1, #1F5BA3)` **23 veces**, y `--inst-blue-1` se define **una sola vez** en `globals.css:10` y **nunca se redefine en ningún bloque `[data-theme]`**.

**Consecuencia real:** el módulo de Reportes se ve exactamente igual en los seis temas. Si la usuaria activa el modo oscuro, toda la aplicación cambia menos Reportes, que sigue en azul claro institucional. La corrección es un reemplazo mecánico de `--inst-blue-1` por `--accent-primary` en esos 23 puntos.

### 🔴 El segundo caso: Chatbook vive fuera del sistema

`Chatbook.css` tiene **86 colores hex fijos** y ni una sola variable de tema. Su fondo de panel es siempre `#f7f9fc` y su cabecera siempre un gradiente azul/rojo inventado (`Chatbook.css:70`), distinto del `--gradient-accent` que ya existe en `globals.css:19`.

**Consecuencia real:** en modo oscuro, el widget de chat aparece como un **recuadro claro incrustado sobre una interfaz oscura**. Es la inconsistencia visual más llamativa de toda la aplicación.

### Estilos inline en JSX — 179 apariciones

| Archivo | `style={{` |
|---|---:|
| `AdminGeneralPage.jsx` | **55** |
| `ProyectosPage.jsx` | 29 |
| `BancoProyectos.jsx` | 29 |
| `AnalyticsDashboard.jsx` | 10 |
| `EditProjectModal.jsx` | 9 |

`AdminGeneralPage.jsx` es el epicentro de la deuda de diseño: 1.215 líneas, **cero componentes UI compartidos importados**, 40 botones crudos, 55 estilos inline y cero media queries.

### Espaciado sin escala

Los valores de padding observados cubren prácticamente todos los enteros entre 4 y 28px. `AdminGeneralPage.css` es además el **único archivo que usa `rem` para espaciado** mientras los otros 16 usan `px`.

---

## 5. Responsividad y multiplataforma

### 5.1 Lo correcto

- ✅ `index.html:6` — `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.
- ✅ **Sidebar con drawer móvil real**: `transform: translateX(-100%)`, backdrop clicable, bloqueo de scroll del body.
- ✅ **`100dvh` en lugar de `100vh`** en `DashboardLayout.css:3` y `Sidebar.css:16`.
- ✅ **Chatbook fluido**: `min(410px, calc(100vw - 32px))` se adapta correctamente a 375px.
- ✅ **`ProyectosPage.css:436-512`** convierte la tabla en tarjetas apiladas en móvil con `td::before { content: attr(data-label) }`. Es la solución correcta, y es el único módulo que la aplica.
- ✅ No hay anchos fijos tipo `width: 1200px` que fuercen scroll horizontal de página.

### 5.2 Breakpoints — 66 media queries, 15 puntos de corte distintos

Valores usados: **380, 400, 480, 520, 540, 600, 640, 641, 700, 720, 768, 820, 900, 1024 y 1100px**. Cada archivo repite el número literal porque no hay tokens de breakpoint. El enfoque es **desktop-first** (64 de 66 usan `max-width`).

Que convivan `640px` y `641px`, o `520px` y `540px`, en módulos distintos es exactamente el síntoma de que cada página eligió sus cortes por separado.

### 5.3 Supervivencia por dispositivo

| Módulo | 375px (móvil) | 768px (tablet) | 1280px |
|---|:---:|:---:|:---:|
| Login | ✅ 4 breakpoints propios | ✅ | ✅ |
| Dashboard / Analytics | ✅ | ✅ | ✅ |
| ProyectosPage | ✅ tabla→tarjetas | ✅ | ✅ |
| BancoProyectos | ✅ | ✅ | ✅ |
| GestionDocente | ✅ (1 solo breakpoint) | ✅ | ✅ |
| Ajustes | ✅ 5 breakpoints | ✅ | ✅ |
| CrearProyecto / EditProjectModal | ⚠️ colapsa a 540px, sin ajuste fino por debajo | ✅ | ✅ |
| **ReportesPage** | ⚠️ **Riesgo medio** — tablas solo con scroll horizontal | ✅ | ✅ |
| **AdminGeneralPage** | ❌ **Riesgo alto** — **0 media queries** | ✅ | ✅ |
| Layout / Header / Sidebar | ✅ drawer + hamburguesa | ✅ | ✅ |

**El punto más débil es `AdminGeneralPage`**: 451 líneas de CSS sin una sola media query, apoyándose solo en `flex-wrap` y `grid auto-fit`. A 375px, `.ag-search-box { min-width: 260px }` (línea 194) empuja el resto del toolbar a la línea siguiente de forma poco pulida. Es, además, el módulo del Administrador General — el rol que más probablemente use tablet.

### 5.4 Detalles de multiplataforma pendientes

- ⚠️ **El buscador del Header desaparece bajo 480px** (`Header.css:262`, `.header-search { display: none }`). Se elimina la función en vez de convertirla en un icono expandible.
- ⚠️ **El FAB del Chatbook no respeta `safe-area-inset`**: en iPhone con gestos queda muy cerca del indicador de inicio. Tampoco reserva `padding-bottom` en el contenido, por lo que puede tapar la última fila de una tabla a 375px.
- ⚠️ **`Login.css:4` usa `height: 100dvh` sin `min-height` de respaldo**: al abrirse el teclado virtual en móvil puede recortar contenido.
- ❌ **`color-scheme` no se declara en ningún sitio** — los controles nativos (checkboxes, date pickers, scrollbar de Firefox) no se adaptan al modo oscuro.
- ❌ **Cero reglas `prefers-reduced-motion`** — todas las animaciones se ejecutan siempre, ignorando la preferencia de accesibilidad del sistema operativo.

---

## 6. Análisis página por página

| Módulo | CSS | Reutiliza | Inconsistencias propias | Responsive | Accesibilidad |
|---|---|---|---|---|---|
| **Login** | `Login.css` (286) | `Button` ×2 | `.field-input` propia (41px, la más alta) | ✅ 4 bp | 6 `<label>`, **0 `htmlFor`**; toggle de contraseña sin `aria-label` |
| **Dashboard** | en `globals.css` | `AnalyticsDashboard` | — | ✅ | ✅ jerarquía `h1→h2` correcta |
| **ProyectosPage** | 1.095 líneas | `Button` ×10 + 8 crudos | `.field-input` copia nº3; `.docente-role-tab` con fallback `#6366f1` (índigo ajeno a la marca) | ✅ único con tabla→tarjeta | 12 `<label>`, 0 `htmlFor`; único con `:focus-visible` |
| **CrearProyecto** | 371 | 5 crudos | `.epm-*` duplicado con EditProjectModal | ⚠️ | 7 `<label>`, 0 `htmlFor` |
| **EditProjectModal** | 484 | 6 crudos | **reglas duplicadas dentro del propio archivo** | ⚠️ | 7 `<label>`, 0 `htmlFor` |
| **BancoProyectos** | 938 | `Button` ×15 + 5 crudos | Mezcla `window.confirm()`/`alert()` nativos (`:350,357,378`) **con sus propios** `.banco-confirm-dialog` y `.banco-toast-success` | ✅ | 16 `<label>`, 0 `htmlFor`; ✅ tiene overrides `[data-theme=dark]` propios |
| **GestionDocente** | 221 | `Button` ×1 | Dos familias de KPI en el mismo archivo (`.gd-meta-card` y `.dp-stat-card`) | ✅ 1 bp | — |
| **ReportesPage** | 960 | **0 componentes** | 🔴 116 hex; `--inst-blue-1` ×23 → no reacciona a temas; alertas con colores fijos | ⚠️ tablas sin colapso | ✅ **10/10 `htmlFor`** — el mejor de la app |
| **AdminGeneralPage** | 451 | **0 componentes** | 🔴 40 botones crudos, 55 inline, variable rota, **0 media queries** | ❌ | 14 `<label>`, **1 `htmlFor`**; buscador sin foco visible |
| **Ajustes** | 507 | `Button` ×4 | `.field-input` copia nº5 | ✅ 5 bp | 3 `<label>`, 0 `htmlFor` |
| **Chatbook** | 578 | 7 crudos | 🔴 86 hex, gradiente inventado, cero variables | ✅ fluido | ✅ **mejor ARIA de la app**; ❌ sin `aria-live`; 🐛 imagen 404 |
| **Header / Sidebar** | 316 / 364 | — | — | ✅ | ✅ `aria-label`; ⚠️ logout solo con `title` |

---

## 7. Accesibilidad (WCAG 2.1 AA)

La documentación del proyecto declara cumplimiento AA. **La evidencia del código no lo sostiene.** Hay tres incumplimientos objetivos y demostrables:

### 7.1 Contraste insuficiente

| Par de color | Ratio | Requisito | Estado |
|---|---:|---|:---:|
| `--text-muted #7987a5` sobre `--bg-card #ffffff` | **3,61:1** | 4,5:1 (texto normal) | ❌ **Falla** |
| `.quick-card--primary` texto `#000` sobre `--accent-primary #1F5BA3` (`globals.css:1021-1034`) | **3,09:1** | 4,5:1 | ❌ **Falla** |
| `.banco-badge-status--disponible` `#059669` sobre su fondo | **3,77:1** | 4,5:1 | ❌ **Falla** |
| `--text-secondary #4a5773` sobre blanco | 7,24:1 | 4,5:1 | ✅ |
| `--accent-primary #1F5BA3` sobre blanco | 6,81:1 | 4,5:1 | ✅ |

`--text-muted` es el más grave porque se usa en decenas de sitios para texto pequeño (0,68–0,78rem): metadatos de tabla, etiquetas de KPI, placeholders, subtítulos de tarjeta. El caso de `.quick-card--primary` es especialmente evitable: es **texto negro sobre azul institucional** cuando bastaría usar `--text-inverse`.

### 7.2 Formularios sin etiquetar — 86% de los campos

Verificado: **80 `<label>` en el proyecto, solo 11 con `htmlFor`**. Los otros 69 son elementos hermanos del input, no lo envuelven, y no tienen asociación programática.

**Consecuencia real:** un lector de pantalla no anuncia el propósito del campo al recibir el foco. Incumple WCAG 1.3.1 (*Info and Relationships*) y 4.1.2 (*Name, Role, Value*).

Que `ReportesPage.jsx` tenga 10 de 10 correctos demuestra que no es falta de conocimiento, sino de consistencia.

### 7.3 Cero regiones `aria-live`

Verificado: **ninguna en todo el proyecto**. Nada de lo que cambia dinámicamente se anuncia a tecnología asistiva: errores de formulario, confirmaciones de guardado, contador de notificaciones, respuestas del chatbot, toasts de éxito.

### 7.4 Foco y teclado

- Solo `ProyectosPage.css` usa `:focus-visible` (1 de 23 archivos).
- `.ag-search-box input` queda **sin ningún indicador de foco**.
- **1 solo `tabIndex`** y **2 `role=`** en todo el código; ningún modal atrapa el foco ni lo devuelve al cerrar.

---

## 8. Rendimiento

| Métrica | Valor | Observación |
|---|---:|---|
| CSS fuente | 229 KB / 23 archivos | Se concatena en un único `.css` de **144 KB** cargado en toda ruta |
| Bundle JS principal | **1,6 MB** | Contiene las 9 páginas a la vez |
| `dist/` total | 2,7 MB | |
| `public/Escudos.png` | **364 KB** | PNG para un escudo → candidato claro a SVG |
| `public/login/SedeCentroUCESMAG.webp` | **248 KB** | Ya en WebP, pero sin `srcset` para móvil |

🐛 **`src/app/App.jsx:9-17` importa las 9 páginas de forma estática.** Verificado: **cero `React.lazy` en todo el proyecto**. Por eso el bundle inicial incluye jsPDF, docx y Recharts —usados en una sola de las nueve páginas— antes siquiera de mostrar el login.

🐛 **`index.html:5` apunta el favicon a `/vite.svg`**, el icono por defecto de Vite, mientras `public/favicon.svg` existe y nunca se enlaza. **La pestaña del navegador muestra el logo de Vite, no el de la Universidad CESMAG.** Para una plataforma institucional es un detalle visible en cada pestaña abierta.

🐛 **`Chatbook.jsx:198`** referencia `/chatbook/gato-cesmag.png`, que no existe. Genera un 404 en cada carga y cae al `onError` que pone un escudo institucional donde debía ir la mascota.

⚠️ **Las clases CSS no tienen scoping.** No son CSS Modules ni siguen BEM estricto, así que `.field`, `.field-label`, `.field-input` y `.link-btn` están declaradas literalmente en 5+ archivos distintos y **cualquier colisión entre features es posible**.

---

## 9. Plan de implementación sin romper nada

El principio rector es **estrangulamiento progresivo**: introducir lo nuevo sin borrar lo viejo, migrar módulo a módulo verificando visualmente cada paso, y eliminar lo antiguo solo cuando ya nadie lo usa. Ninguna fase exige tocar la lógica de negocio.

### Verificación obligatoria después de CADA cambio

Antes de empezar, establece este ritual. Es lo que convierte el plan en "a prueba de errores":

```bash
npm run build          # debe compilar sin errores
npm run dev            # levantar y revisar a ojo
```

Y recorrer esta lista en el navegador (DevTools → Toggle device toolbar):

- [ ] Las 9 rutas cargan sin error en consola
- [ ] A **375px**, **768px** y **1280px** de ancho
- [ ] En tema **claro** y tema **oscuro**
- [ ] Con los 4 roles (Estudiante, Docente, Administrador, Admin General)
- [ ] Tabulando con el teclado: el foco se ve siempre

> **Regla de oro:** un commit por módulo migrado. Si algo se rompe, `git revert` de un solo commit lo deshace sin arrastrar nada más.

---

### FASE 0 — Red de seguridad (medio día) · Riesgo: ninguno

Sin esto, ninguna refactorización es segura.

**0.1 — Reparar ESLint.** Está roto: importa cuatro paquetes que no están instalados.

```bash
npm --prefix frontend install -D @eslint/js globals eslint-plugin-react-hooks eslint-plugin-react-refresh
```

Añadir a `frontend/package.json`: `"lint": "eslint src --max-warnings=0"`.

**0.2 — Capturar el estado visual actual.** Antes de tocar nada, toma capturas de las 9 páginas en móvil y escritorio, en ambos temas. Son tu referencia para comparar. Guárdalas fuera del repositorio.

**0.3 — Congelar el comportamiento.** Anota en un archivo qué hace cada página hoy (qué botones, qué filtros, qué modales). Si al migrar algo desaparece, lo notarás.

---

### FASE 1 — Quick wins visibles (1 día) · Riesgo: muy bajo

Cambios pequeños, aislados, de efecto inmediato. Cada uno es un commit independiente.

| # | Acción | Archivo | Riesgo |
|---|---|---|---|
| 1.1 | Cambiar el favicon a `/favicon.svg` | `index.html:5` | Ninguno |
| 1.2 | Definir `--accent-hover` y `--border-subtle` en `:root` | `globals.css` | Ninguno — hoy caen a fallback |
| 1.3 | Crear `public/chatbook/gato-cesmag.png` o quitar la referencia | `Chatbook.jsx:198` | Ninguno — ya hay `onError` |
| 1.4 | Reemplazar `--inst-blue-1` → `--accent-primary` (23 ocurrencias) | `ReportesPage.css` | Bajo — **verificar en los 6 temas** |
| 1.5 | Añadir `color-scheme: light dark` a `:root` y `[data-theme=dark]` | `globals.css` | Ninguno |
| 1.6 | Añadir bloque `@media (prefers-reduced-motion: reduce)` global | `globals.css` | Ninguno |
| 1.7 | Restaurar indicador de foco en `.ag-search-box input` | `AdminGeneralPage.css:197` | Ninguno |
| 1.8 | Borrar las reglas duplicadas de `EditProjectModal.css:189-228` | — | Bajo — **comprobar que el modal se ve igual** |
| 1.9 | Corregir el contraste de `.quick-card--primary`: `#000` → `var(--text-inverse)` | `globals.css:1021` | Ninguno |

Para 1.6, el bloque estándar:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Verificación de la fase:** recorrer la lista de comprobación. Nada debe cambiar visualmente salvo Reportes (que ahora sí responde a los temas) y la pestaña del navegador.

---

### FASE 2 — Completar el catálogo de tokens (1 día) · Riesgo: ninguno

**Solo se añade. No se modifica ni se borra nada.** Es imposible romper algo en esta fase.

Añadir a `globals.css:71`, después de los tokens existentes:

```css
:root {
  /* ---- Escala tipográfica (modular 1.125) ---- */
  --fs-2xs: 0.694rem;   /* metadatos, timestamps  */
  --fs-xs:  0.79rem;    /* etiquetas de KPI, badges */
  --fs-sm:  0.889rem;   /* cuerpo secundario, inputs */
  --fs-md:  1rem;       /* cuerpo base */
  --fs-lg:  1.125rem;   /* subtítulos */
  --fs-xl:  1.266rem;   /* títulos de tarjeta */
  --fs-2xl: 1.424rem;   /* títulos de sección */
  --fs-3xl: 1.802rem;   /* título de página */

  /* ---- Escala de espaciado (base 4px) ---- */
  --sp-1: 4px;   --sp-2: 8px;   --sp-3: 12px;  --sp-4: 16px;
  --sp-5: 20px;  --sp-6: 24px;  --sp-8: 32px;  --sp-10: 40px;

  /* ---- Alturas de control (consistencia de formularios) ---- */
  --control-h-sm: 34px;
  --control-h-md: 40px;   /* ← la altura canónica de input y botón */
  --control-h-lg: 46px;

  /* ---- Escala de z-index (documentada, no inventada) ---- */
  --z-dropdown: 100;
  --z-sticky:   200;
  --z-drawer:   300;
  --z-modal:    400;
  --z-toast:    500;
  --z-tooltip:  600;

  /* ---- Breakpoints (referencia; CSS nativo no los usa en @media) ---- */
  --bp-sm: 480px;  --bp-md: 768px;  --bp-lg: 1024px;  --bp-xl: 1280px;
}
```

> **Nota honesta sobre los breakpoints:** el CSS nativo **no permite** usar `var()` dentro de `@media`. Estos tokens sirven como documentación y para JavaScript. Para unificar de verdad los 15 puntos de corte a cuatro hay que editarlos a mano, módulo a módulo — está en la Fase 5.

**Verificación:** `npm run build`. Nada cambia visualmente porque todavía nadie usa los tokens nuevos.

---

### FASE 3 — Construir los componentes que faltan (2-3 días) · Riesgo: ninguno

**Se crean archivos nuevos. No se toca ni una línea del código existente.**

Crear en `src/components/ui/`:

```
ui/
├── Input/          Input.jsx  Select.jsx  Textarea.jsx  FormField.jsx  Field.css
├── Modal/          Modal.jsx  Modal.css
├── Badge/          Badge.jsx  Badge.css
├── Table/          DataTable.jsx  DataTable.css
└── Alert/          Alert.jsx  Alert.css
```

**`FormField.jsx` resuelve dos problemas de golpe** — la inconsistencia de altura y las 69 etiquetas sin asociar:

```jsx
import { useId } from 'react';
import './Field.css';

export function FormField({ label, hint, error, required, children }) {
  const id = useId();                       // ← asociación automática, imposible olvidarla
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}{required && <span aria-hidden="true"> *</span>}
      </label>
      {children({ id, 'aria-describedby': errorId, 'aria-invalid': !!error })}
      {hint && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}
```

`Field.css` usa `--control-h-md` y `--fs-sm`, de modo que **todos** los campos migrados miden exactamente lo mismo.

**`Modal.jsx` con foco atrapado**, que ninguno de los 5 modales actuales tiene:

```jsx
export function Modal({ open, onClose, title, children, size = 'md' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();          // ← devuelve el foco al cerrar
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-label={title}
           tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
```

`Modal.css` usa `z-index: var(--z-modal)` — un solo valor para todos.

**Verificación:** `npm run build`. La aplicación no cambia en absoluto: los componentes existen pero nadie los importa todavía.

---

### FASE 4 — Migración módulo a módulo (2-3 semanas) · Riesgo: medio, controlado

Aquí es donde hay que ir con cuidado. **Un módulo por vez, un commit por módulo, verificación completa antes de pasar al siguiente.**

Orden recomendado — de menor a mayor riesgo, para ganar confianza antes de tocar lo grande:

| Orden | Módulo | Por qué en esta posición | Riesgo |
|:---:|---|---|:---:|
| 1 | `UsuariosPage` | Placeholder de 66 líneas. Ensayo general. | 🟢 |
| 2 | `GestionDocente` | Pequeño (334 líneas), ya usa `Button`. | 🟢 |
| 3 | `Ajustes` | Formularios simples, responsive ya resuelto. | 🟢 |
| 4 | `Login` | Crítico pero pequeño. **Probar login real de los 4 roles.** | 🟡 |
| 5 | `CrearProyecto` + `EditProjectModal` | Juntos: comparten el CSS duplicado, se unifican de una vez. | 🟡 |
| 6 | `ReportesPage` | Ya tiene `htmlFor` correctos. Migrar botones y los 116 hex. | 🟡 |
| 7 | `BancoProyectos` | Grande (1.368). Sustituir `alert()`/`confirm()` por sus propios modales. | 🟠 |
| 8 | `ProyectosPage` | Grande (1.332). **Conservar la tabla→tarjeta responsive**, es la joya del módulo. | 🟠 |
| 9 | `AdminGeneralPage` | El más difícil: 40 botones, 55 inline, 0 media queries. **Dejarlo para el final**, cuando ya domines el patrón. | 🔴 |
| 10 | `Chatbook` | 86 hex → tokens. Riesgo estético alto, funcional bajo. | 🟠 |

**Receta por módulo** (los mismos 6 pasos siempre):

1. Captura de pantalla del módulo *antes* (móvil + escritorio, tema claro + oscuro).
2. Sustituir `<button className="xx-btn-primary">` por `<Button variant="primary">`.
3. Envolver cada campo en `<FormField>` — esto arregla su `htmlFor` automáticamente.
4. Sustituir su modal propio por `<Modal>`.
5. Reemplazar hex hardcodeados por el token equivalente.
6. Borrar del CSS del módulo las reglas que ya no se usan.
7. Comparar con la captura del paso 1. **Debe verse igual o mejor, nunca peor.**

> **Si un módulo se resiste, déjalo y pasa al siguiente.** El sistema antiguo y el nuevo pueden convivir indefinidamente sin conflicto — ese es justamente el propósito del estrangulamiento progresivo.

---

### FASE 5 — Responsividad y accesibilidad (1 semana) · Riesgo: bajo

**5.1 — Unificar breakpoints a cuatro.** Sustituir los 15 valores actuales por `480 / 768 / 1024 / 1280`. Mecánico: buscar `@media (max-width:` en cada archivo y redondear al más cercano de los cuatro. Verificar cada módulo a esos anchos exactos.

**5.2 — Dar responsividad a `AdminGeneralPage`** (el hueco más grande). Añadir al final de `AdminGeneralPage.css`:

```css
@media (max-width: 768px) {
  .ag-toolbar    { flex-direction: column; align-items: stretch; }
  .ag-search-box { min-width: 0; width: 100%; }
  .ag-tabs       { overflow-x: auto; scrollbar-width: none; }
  .ag-stats-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 480px) {
  .ag-stats-grid { grid-template-columns: 1fr; }
}
```

**5.3 — Tabla responsive en Reportes.** Aplicar el mismo patrón `td::before { content: attr(data-label) }` que ya funciona en `ProyectosPage.css:436-512`. Es copiar una solución que ya está probada en el propio proyecto.

**5.4 — Corregir `--text-muted`.** Oscurecer de `#7987a5` a aproximadamente `#5d6b8a` para superar 4,5:1. **Verificar visualmente en los 6 temas**, porque afecta a muchos sitios.

**5.5 — Añadir `aria-live`** a las zonas dinámicas: alertas de formulario (`role="alert"`), contador de notificaciones del Header (`aria-live="polite"`) y cuerpo de mensajes del Chatbook (`aria-live="polite"`).

**5.6 — Detalles móviles:** `safe-area-inset-bottom` en el FAB del Chatbook; convertir el buscador del Header en icono expandible bajo 480px en vez de ocultarlo; `min-height` de respaldo en `Login.css:4`.

---

### FASE 6 — Rendimiento (2 días) · Riesgo: bajo

**6.1 — Code splitting por ruta.** El cambio de mayor impacto de todo el plan:

```jsx
// src/app/App.jsx
import { lazy, Suspense } from 'react';

const ReportesPage     = lazy(() => import('../features/reportes/ReportesPage'));
const AdminGeneralPage = lazy(() => import('../features/admin-general/AdminGeneralPage'));
const BancoProyectos   = lazy(() => import('../features/banco-proyectos/BancoProyectos'));
// … el resto salvo Login, que debe seguir siendo estático

<Suspense fallback={<div className="route-loading">Cargando…</div>}>
  <Routes>{/* … */}</Routes>
</Suspense>
```

Solo con diferir Reportes se saca jsPDF, docx y html2canvas del arranque. **Verificar que cada ruta sigue cargando** y que el fallback aparece brevemente.

**6.2 — Optimizar `Escudos.png`** (364 KB → SVG o WebP).
**6.3 — `srcset`** en la imagen de fondo del Login para servir una versión menor en móvil.

---

### Resumen del plan

| Fase | Contenido | Duración | Riesgo | Impacto visible |
|:---:|---|---|:---:|---|
| 0 | Red de seguridad | ½ día | 🟢 Ninguno | Ninguno |
| 1 | Quick wins | 1 día | 🟢 Muy bajo | **Alto** — favicon, temas en Reportes, contraste |
| 2 | Tokens | 1 día | 🟢 Ninguno | Ninguno (base) |
| 3 | Componentes nuevos | 2-3 días | 🟢 Ninguno | Ninguno (base) |
| 4 | Migración por módulo | 2-3 semanas | 🟠 Medio, controlado | **Muy alto** — consistencia total |
| 5 | Responsive + A11y | 1 semana | 🟡 Bajo | Alto en móvil |
| 6 | Rendimiento | 2 días | 🟡 Bajo | Alto en carga inicial |

**Si solo dispones de un día**, haz la Fase 1 completa: son nueve cambios de bajo riesgo con el mayor efecto visible por hora invertida — el favicon institucional, Reportes respondiendo a los temas y tres fallos de contraste corregidos.

---

## 10. Checklist de verificación final

Cuando termines el plan, esto debería ser cierto. Úsalo también como guion de demostración ante el jurado:

**Consistencia**
- [ ] Cero `<button>` crudos en `features/` (hoy: 104)
- [ ] Cero `style={{}}` de color o espaciado en JSX (hoy: 179)
- [ ] Un solo componente de tarjeta, input, modal y badge
- [ ] Todos los campos de texto miden `--control-h-md`
- [ ] Cero hex hardcodeados fuera de `globals.css` (hoy: 308)
- [ ] Todos los `font-size` salen de la escala (hoy: 55 valores sueltos)

**Responsividad**
- [ ] Las 9 páginas verificadas a 375 / 768 / 1280px
- [ ] Solo 4 breakpoints en todo el proyecto (hoy: 15)
- [ ] Todas las tablas colapsan a tarjetas en móvil
- [ ] Ningún scroll horizontal de página en ningún ancho

**Accesibilidad**
- [ ] 100% de los `<label>` con `htmlFor` (hoy: 11 de 80)
- [ ] Todo el texto supera 4,5:1 de contraste
- [ ] Foco visible en cada control interactivo
- [ ] Modales con foco atrapado y retorno al cerrar
- [ ] `aria-live` en toda zona dinámica (hoy: 0)
- [ ] `prefers-reduced-motion` respetado (hoy: no)

**Temas**
- [ ] Los 6 temas se ven correctos en las 9 páginas
- [ ] Chatbook y Reportes cambian con el tema (hoy: no)

**Rendimiento**
- [ ] Bundle inicial por debajo de 600 KB (hoy: 1,6 MB)
- [ ] Ninguna imagen por encima de 200 KB
- [ ] Favicon institucional
- [ ] Cero peticiones 404 en consola

---

<sub>Auditoría de solo lectura. No se modificó ningún archivo. Todas las cifras fueron verificadas contando directamente sobre el código fuente.</sub>
