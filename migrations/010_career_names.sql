-- El catálogo mantiene su identidad. Los nombres por gestión no alteran años anteriores.
CREATE TABLE career_names (
  career_id INTEGER NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  year_id INTEGER NOT NULL REFERENCES years(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  PRIMARY KEY (career_id, year_id)
);
