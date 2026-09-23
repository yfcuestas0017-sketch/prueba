-- ============================================================================
-- 1) SINCRONIZAR TODAS LAS SECUENCIAS SERIAL CON EL MAX(id) REAL
-- ----------------------------------------------------------------------------
-- Causa del error "Ya existe la llave (research_subline_id)=(12)" / lo mismo
-- en degree_options: en algún momento se insertaron filas indicando el ID a
-- mano (import manual, script, etc.), lo que dejó la secuencia interna de
-- PostgreSQL desactualizada. Cuando el formulario inserta una fila nueva sin
-- indicar ID, Postgres usa nextval() de la secuencia, que todavía apunta a un
-- número ya usado -> choque de llave primaria duplicada.
--
-- Este bloque recorre TODAS las columnas SERIAL/IDENTITY de tablas en
-- "public" y reacomoda su secuencia al valor correcto (MAX(id) actual).
-- Es seguro ejecutarlo las veces que quieras.
-- ============================================================================
DO $$
DECLARE
  rec RECORD;
  seq_name TEXT;
  max_id BIGINT;
BEGIN
  FOR rec IN
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_default LIKE 'nextval(%'
  LOOP
    seq_name := pg_get_serial_sequence(
      format('%I.%I', rec.table_schema, rec.table_name),
      rec.column_name
    );
    IF seq_name IS NOT NULL THEN
      EXECUTE format(
        'SELECT COALESCE(MAX(%I), 0) FROM %I.%I',
        rec.column_name, rec.table_schema, rec.table_name
      ) INTO max_id;

      PERFORM setval(seq_name, GREATEST(max_id, 1), max_id > 0);

      RAISE NOTICE 'Secuencia % sincronizada con MAX(%) = %', seq_name, rec.column_name, max_id;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 2) ALCANCE POR PROGRAMA EN "OPCIONES DE GRADO"
-- ----------------------------------------------------------------------------
-- program_id NULL  = la opción de grado aplica para TODOS los programas.
-- program_id = N    = la opción de grado solo aplica para ese programa.
-- ============================================================================
ALTER TABLE public.degree_options
  ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES public.programs(program_id);

CREATE INDEX IF NOT EXISTS idx_degree_options_program_id
  ON public.degree_options(program_id);
