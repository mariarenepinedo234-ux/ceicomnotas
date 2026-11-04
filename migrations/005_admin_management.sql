-- Una misma materia puede tener grupos distintos en varios trimestres de una gestión.
DO $$
DECLARE old_constraint TEXT;
BEGIN
  FOR old_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='academic_groups'::regclass AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (subject_id, year_id, admission_year_id, shift_id)'
  LOOP
    EXECUTE format('ALTER TABLE academic_groups DROP CONSTRAINT %I',old_constraint);
  END LOOP;
END $$;
CREATE UNIQUE INDEX academic_groups_pending_identity_idx
  ON academic_groups(subject_id,year_id,admission_year_id,shift_id)
  WHERE offering_id IS NULL;
