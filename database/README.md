# Migraciones de base de datos

**Atención: en este proyecto conviven dos mecanismos de migración y solo uno se
ejecuta solo.** Confundirlos es la causa de que un fallo ya "arreglado" siga vivo
en la base de datos.

| Ubicación | Formato | ¿Se ejecuta? |
|---|---|---|
| `backend/migrations/*.js` | JavaScript | **Sí**, en cada arranque del servidor |
| `database/migrations/*.sql` | SQL | **No.** Ningún código las lee. Se aplican a mano |

Este directorio es la **segunda** categoría: un archivo histórico de los cambios
de esquema que alguien ejecutó manualmente contra PostgreSQL, en orden
cronológico por el prefijo de fecha del nombre.

## Contenido

| Archivo | Qué hace |
|---|---|
| `TrabajoGradoBD.sql` | Esquema base: tablas, claves foráneas y disparadores de historial |
| `20260427_user_projects_rls_policies.sql` | Políticas RLS de la época de Supabase |
| `20260819_fix_user_projects_id_default.sql` | Valor por defecto del id de `user_projects` |
| `20260819_research_process_records.sql` | Registros del proceso de investigación |
| `20260819_semester_dates.sql` | Fechas de semestre |
| `20260825_project_history_actor.sql` | Autor del cambio en el historial de proyectos |
| `20260904_project_bank_and_histories.sql` | Banco de proyectos e historiales |
| `20260910_fix_sequences_and_degree_program_scope.sql` | Secuencias y alcance de programa |

## Advertencia sobre la última migración

`20260910_fix_sequences_and_degree_program_scope.sql` se escribió para corregir
las secuencias, pero **solo actúa sobre columnas cuyo `column_default` ya empieza
por `nextval(`**. Justamente las tres tablas cuyo problema era *no tener* ese
valor por defecto quedaban fuera de su alcance. Por eso el fallo del Banco de
Proyectos sobrevivió a la migración escrita para arreglarlo. Ver
`docs/BITACORA-TECNICA.md`.

## Por qué ya no se llama `supabase/`

El proyecto migró a PostgreSQL local y Supabase quedó abandonado (la decisión y
sus motivos están en `docs/BITACORA-TECNICA.md` §1). La carpeta conservaba el nombre
del proveedor aunque su contenido eran migraciones SQL corrientes, lo que hacía
creer que existía una integración con Supabase que en realidad no existe. El
nombre `database/migrations/` describe lo que hay.
