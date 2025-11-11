# Database Migration Best Practices

## Overview
This document outlines best practices for creating and managing database migrations in the Pathfinder application to prevent issues like the recent weather system migration failure.

## Migration File Structure
- Migration files are located in `backend/migrations/`
- Files are named with numeric prefixes: `01_description.sql`, `02_description.sql`, etc.
- Always use descriptive names that clearly indicate what the migration does

## Best Practices

### 1. Idempotent Operations
Always write migrations that can be run multiple times safely:

**✅ GOOD:**
```sql
CREATE TABLE IF NOT EXISTS my_table (...);
INSERT INTO my_table (name) 
SELECT 'value' 
WHERE NOT EXISTS (SELECT 1 FROM my_table WHERE name = 'value');
```

**❌ AVOID:**
```sql
CREATE TABLE my_table (...);
INSERT INTO my_table (name) VALUES ('value') ON CONFLICT (name) DO NOTHING;
```

### 2. Constraint-Safe Inserts
When using ON CONFLICT, ensure the constraint actually exists:

**✅ GOOD:**
```sql
-- Create table with explicit constraint
CREATE TABLE IF NOT EXISTS my_table (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- Now ON CONFLICT is safe to use
INSERT INTO my_table (name) VALUES ('value') ON CONFLICT (name) DO NOTHING;
```

**✅ BETTER (more reliable):**
```sql
INSERT INTO my_table (name) 
SELECT 'value' 
WHERE NOT EXISTS (SELECT 1 FROM my_table WHERE name = 'value');
```

### 3. Transaction Safety
- The migration runner wraps each migration in a transaction automatically
- For complex migrations, consider explicit transaction control within the SQL
- Test rollback scenarios

### 4. Data Migration
For large data migrations:
- Consider breaking them into smaller chunks
- Add logging statements for progress tracking
- Test on a copy of production data first

### 5. Index Creation
- Use `CREATE INDEX CONCURRENTLY` for large tables in production
- Consider creating indexes in separate migration files
- Always use `IF NOT EXISTS`

## Testing Migrations

### Local Testing
1. Create a backup of your local database
2. Run the migration
3. Verify the expected changes
4. Test rollback if applicable

### Migration Validation
The migration runner now includes automatic validation that checks for:
- ON CONFLICT usage with CREATE TABLE IF NOT EXISTS
- Missing transaction safety
- Other common anti-patterns

## Rollback Strategy

### Automatic Rollback Templates
The migration runner now automatically creates rollback templates in `migrations/rollbacks/`:
- Review and customize these templates
- Test rollback procedures in development
- Keep rollback SQL updated as you modify migrations

### Manual Rollback Process
If you need to manually rollback a migration:

1. Review the rollback template:
   ```bash
   cat backend/migrations/rollbacks/XX_migration_name_rollback.sql
   ```

2. Customize the rollback SQL as needed

3. Execute the rollback:
   ```sql
   BEGIN;
   -- Your rollback statements here
   DELETE FROM schema_migrations WHERE filename = 'XX_migration_name.sql';
   COMMIT;
   ```

## Troubleshooting

### Common Error: "no unique or exclusion constraint matching the ON CONFLICT specification"
**Cause:** Using ON CONFLICT when the table was created with CREATE TABLE IF NOT EXISTS, and the constraint doesn't exist.

**Solution:** Replace with INSERT...WHERE NOT EXISTS pattern.

### Migration Stuck/Failed
1. Check the application logs for detailed error information
2. Connect to the database and check `schema_migrations` table
3. Identify which migration failed
4. Fix the migration SQL
5. Manually apply remaining steps if needed
6. Mark migration as complete in `schema_migrations`

### Checking Migration Status
Use the new migration health endpoints:
- `GET /api/migrations/health` - Quick health check
- `GET /api/migrations/status` - Detailed status
- `GET /api/migrations/details` - Full migration information

## Recovery Process

If migrations fail during startup:

1. **Identify the problem:**
   ```bash
   docker logs pathfinder-rotr
   ```

2. **Connect to database:**
   ```bash
   docker exec -it pathfinder-db psql -U pathfinder -d pathfinder
   ```

3. **Check migration status:**
   ```sql
   SELECT * FROM schema_migrations ORDER BY applied_at;
   ```

4. **Fix the issue:**
   - Repair the migration SQL file
   - Manually apply missing changes
   - Mark migration as complete if partially applied

5. **Restart the application:**
   ```bash
   docker restart pathfinder-rotr
   ```

## Future Improvements

Consider implementing:
- Migration locking to prevent concurrent runs
- Checksum validation for migration files
- More sophisticated rollback automation
- Integration with database schema versioning tools like Flyway or Liquibase

## References
- PostgreSQL Documentation on Transactions
- Database Migration Anti-patterns
- Zero-downtime Migration Strategies
