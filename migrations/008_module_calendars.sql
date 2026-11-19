-- El calendario anterior se conserva como compartido, con los mismos IDs y fechas.
ALTER TABLE modules ADD COLUMN admission_year_id INTEGER REFERENCES years(id);
ALTER TABLE modules DROP CONSTRAINT modules_name_year_id_key;
CREATE UNIQUE INDEX modules_calendar_name_unique ON modules(year_id,COALESCE(admission_year_id,0),name);
CREATE INDEX modules_calendar_dates_idx ON modules(year_id,admission_year_id,start_date,end_date);
