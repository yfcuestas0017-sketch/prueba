import pool from '../config/db.js';
import { withTransaction } from '../db/withTransaction.js';

export async function setupProjectAuditTrigger() {
  await withTransaction(pool, async (client) => {
    await client.query(`
    CREATE OR REPLACE FUNCTION public.log_project_field_changes()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      new_history_id INT;
    BEGIN
      IF OLD.title IS DISTINCT FROM NEW.title THEN
        INSERT INTO public.histories (description, modified_field, old_value, new_value, change_type)
        VALUES ('Modificación de título', 'title', OLD.title, NEW.title, 'UPDATE')
        RETURNING history_id INTO new_history_id;
        INSERT INTO public.project_histories (project_id, history_id)
        VALUES (NEW.project_id, new_history_id);
      END IF;

      RETURN NEW;
    END;
    $$;

    DELETE FROM public.project_histories ph
    USING public.histories h
    WHERE ph.history_id = h.history_id
      AND h.user_id IS NULL
      AND h.description = 'Status update'
      AND h.modified_field = 'status_id'
      AND h.old_value ~ '^[0-9]+$'
      AND h.new_value ~ '^[0-9]+$';

    DELETE FROM public.histories h
    WHERE h.user_id IS NULL
      AND h.description = 'Status update'
      AND h.modified_field = 'status_id'
      AND h.old_value ~ '^[0-9]+$'
      AND h.new_value ~ '^[0-9]+$'
      AND NOT EXISTS (
        SELECT 1
          FROM public.project_histories ph
         WHERE ph.history_id = h.history_id
      );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_trigger
         WHERE tgname = 'trg_audit_projects'
           AND tgrelid = 'public.projects'::regclass
           AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER trg_audit_projects
        AFTER UPDATE ON public.projects
        FOR EACH ROW EXECUTE FUNCTION public.log_project_field_changes();
      END IF;
    END;
    $$;
  `);
  });
}
