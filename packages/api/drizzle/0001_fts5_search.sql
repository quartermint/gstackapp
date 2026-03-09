-- FTS5 virtual table for captures full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts USING fts5(
  raw_content,
  content='captures',
  content_rowid='rowid'
);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS captures_ai AFTER INSERT ON captures BEGIN
  INSERT INTO captures_fts(rowid, raw_content) VALUES (new.rowid, new.raw_content);
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS captures_ad AFTER DELETE ON captures BEGIN
  INSERT INTO captures_fts(captures_fts, rowid, raw_content) VALUES('delete', old.rowid, old.raw_content);
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS captures_au AFTER UPDATE ON captures BEGIN
  INSERT INTO captures_fts(captures_fts, rowid, raw_content) VALUES('delete', old.rowid, old.raw_content);
  INSERT INTO captures_fts(rowid, raw_content) VALUES (new.rowid, new.raw_content);
END;--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS project_metadata_fts USING fts5(
  name,
  tagline,
  content='projects',
  content_rowid='rowid'
);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS projects_ai AFTER INSERT ON projects BEGIN
  INSERT INTO project_metadata_fts(rowid, name, tagline) VALUES (new.rowid, new.name, COALESCE(new.tagline, ''));
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS projects_ad AFTER DELETE ON projects BEGIN
  INSERT INTO project_metadata_fts(project_metadata_fts, rowid, name, tagline) VALUES('delete', old.rowid, old.name, COALESCE(old.tagline, ''));
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS projects_au AFTER UPDATE ON projects BEGIN
  INSERT INTO project_metadata_fts(project_metadata_fts, rowid, name, tagline) VALUES('delete', old.rowid, old.name, COALESCE(old.tagline, ''));
  INSERT INTO project_metadata_fts(rowid, name, tagline) VALUES (new.rowid, new.name, COALESCE(new.tagline, ''));
END;
