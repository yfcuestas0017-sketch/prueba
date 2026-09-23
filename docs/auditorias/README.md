# Auditorías — septiembre de 2026

GradoHub · Universidad CESMAG

Tres revisiones del código hechas el **10 de septiembre de 2026** sobre el commit
`f9f351b7`. Cada una analizó una dimensión distinta y las tres se verificaron
contando sobre el código, no por impresión.

| Informe | Qué revisa | Extensión |
|---|---|---|
| [`AUDITORIA.md`](AUDITORIA.md) | Seguridad, datos personales, historial de Git y coherencia con los requisitos declarados | 712 líneas |
| [`AUDITORIA-BACKEND-ARQUITECTURA.md`](AUDITORIA-BACKEND-ARQUITECTURA.md) | Arquitectura, calidad funcional, mantenibilidad y escalabilidad del backend | 648 líneas |
| [`AUDITORIA-FRONTEND-DISENO.md`](AUDITORIA-FRONTEND-DISENO.md) | Sistema de diseño, accesibilidad, responsividad y peso del frontend | 751 líneas |

## Cómo leerlos

**Describen el código del 10 de septiembre de 2026, no el sistema actual.** Buena
parte de lo que denuncian ya está corregido: la autenticación con JWT y bcrypt,
el manejo de transacciones, el desmontaje del Chatbook, el sistema de diseño y la
carga diferida del frontend salieron de estos informes.

Por eso **cada archivo abre con una tabla de estado fechada** que separa lo
cerrado de lo que sigue abierto. Esa tabla es lo primero que hay que leer: sin
ella, los avisos de las primeras secciones se leen como si describieran el
sistema de hoy.

Se conservan porque son la justificación del trabajo de remediación y el registro
del método con que se detectó y midió cada defecto.
