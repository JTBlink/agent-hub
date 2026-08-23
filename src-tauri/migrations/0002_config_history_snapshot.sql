ALTER TABLE config_operations ADD COLUMN target_path TEXT;
ALTER TABLE config_operations ADD COLUMN agent TEXT;
ALTER TABLE config_operations ADD COLUMN scope TEXT;
ALTER TABLE config_operations ADD COLUMN format TEXT;

UPDATE config_operations
SET target_path = (
        SELECT normalized_path FROM config_files WHERE config_files.id = config_operations.config_file_id
    ),
    agent = (
        SELECT agent FROM config_files WHERE config_files.id = config_operations.config_file_id
    ),
    scope = (
        SELECT scope FROM config_files WHERE config_files.id = config_operations.config_file_id
    ),
    format = (
        SELECT format FROM config_files WHERE config_files.id = config_operations.config_file_id
    );

CREATE INDEX IF NOT EXISTS idx_config_operations_target_path
ON config_operations(target_path);
