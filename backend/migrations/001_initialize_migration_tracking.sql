-- Foundation migration to initialize enhanced migration tracking
-- This sets up the migration system infrastructure

-- Create the enhanced migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations_v2 (
    id SERIAL PRIMARY KEY,
    migration_id VARCHAR(255) UNIQUE NOT NULL,
    filename VARCHAR(255) NOT NULL,
    description TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    applied_by VARCHAR(255) DEFAULT 'migration_runner',
    execution_time_ms INTEGER DEFAULT 0,
    checksum VARCHAR(64),
    is_manual_marking BOOLEAN DEFAULT FALSE,
    schema_version VARCHAR(20) DEFAULT '2.0',
    notes TEXT
);

-- Create migration history table for detailed tracking
CREATE TABLE IF NOT EXISTS migration_history (
    id SERIAL PRIMARY KEY,
    migration_id VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'apply', 'rollback', 'mark_applied'
    status VARCHAR(50) NOT NULL, -- 'running', 'success', 'failure'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    execution_time_ms INTEGER,
    applied_by VARCHAR(255) DEFAULT 'migration_runner',
    error_message TEXT,
    error_detail TEXT
);

-- Create migration locks table to prevent concurrent execution
CREATE TABLE IF NOT EXISTS migration_locks (
    lock_name VARCHAR(255) PRIMARY KEY,
    locked_by VARCHAR(255) NOT NULL,
    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    process_id VARCHAR(255)
);

-- Create migration configuration table
CREATE TABLE IF NOT EXISTS migration_config (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial configuration
INSERT INTO migration_config (key, value, description) VALUES
('migration_system_version', '2.0', 'Version of the migration system')
ON CONFLICT (key) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_schema_migrations_v2_migration_id ON schema_migrations_v2(migration_id);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_v2_applied_at ON schema_migrations_v2(applied_at);
CREATE INDEX IF NOT EXISTS idx_migration_history_migration_id ON migration_history(migration_id);
CREATE INDEX IF NOT EXISTS idx_migration_history_status ON migration_history(status);
CREATE INDEX IF NOT EXISTS idx_migration_locks_expires_at ON migration_locks(expires_at);